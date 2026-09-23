import { EMBEDDING_SPEC } from '@/domains/ai/constants';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { QdrantClient } from '@qdrant/js-client-rest';
import CircuitBreaker from 'opossum';

const SCROLL_PAGE_SIZE = 1_000;

/** Payload fields `search()` filters on — Qdrant rejects filtering without an index. */
const FILTERABLE_PAYLOAD_FIELDS = ['userId', 'languageFolderId'] as const;

/**
 * Separate from the Gemini breaker on purpose: the two services fail
 * independently, so sharing one would let a Qdrant outage block embedding (and
 * vice versa). Tighter timeout than Gemini's — Qdrant calls are fast, so a slow
 * one already signals trouble.
 */
const BREAKER_OPTIONS = {
    timeout: 5_000,
    errorThresholdPercentage: 50,
    resetTimeout: 30_000,
    volumeThreshold: 5,
};

export interface VocabPointPayload {
    [key: string]: unknown;
    /**
     * Point ids are UUID v5 derived from the cuid and NOT reversible, so the
     * original `Vocab.id` has to travel in the payload.
     */
    vocabId: string;
    userId: string;
    languageFolderId: string;
}

export interface VocabSearchHit {
    vocabId: string;
    score: number;
}

export interface VocabSearchGroup {
    languageFolderId: string;
    hits: VocabSearchHit[];
}

@Injectable()
export class QdrantService {
    private readonly logger = new Logger(QdrantService.name);
    private readonly client: QdrantClient;
    private readonly breaker: CircuitBreaker<[() => Promise<unknown>], unknown>;
    private collectionEnsured = false;

    public constructor(private readonly configService: ConfigService) {
        const url = this.configService.getOrThrow<string>('qdrant.url');
        const apiKey = this.configService.getOrThrow<string>('qdrant.apiKey');
        this.client = new QdrantClient({ url, apiKey });

        this.breaker = new CircuitBreaker(async (operation: () => Promise<unknown>) => operation(), BREAKER_OPTIONS);
        this.breaker.on('open', () => this.logger.warn('Qdrant circuit opened — failing fast until it half-opens'));
        this.breaker.on('close', () => this.logger.log('Qdrant circuit closed'));
    }

    /**
     * Qdrant Cloud free tier clusters auto-suspend after 1 week of no usage and
     * get deleted after 4 weeks. The docs don't define "usage", so this issues a
     * real read (not just a ping) against the collection. Mon & Thu 03:00 keeps
     * the longest gap under 4 days, well inside the 7-day suspend window even if
     * one run is missed. Errors are swallowed — a failed keep-alive must never
     * crash the process, and the next scheduled run tries again.
     */
    @Cron('0 3 * * 1,4', { name: 'qdrant-keep-alive' })
    public async keepAlive(): Promise<void> {
        try {
            await this.ensureCollection();
            await this.run(async () => this.client.count(EMBEDDING_SPEC.collection, { exact: false }));
        } catch (error) {
            this.logger.warn(`Qdrant keep-alive failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /** @param pointId UUID v5 from `toVocabPointId` — a raw cuid is rejected with 400. */
    public async upsert(pointId: string, vector: number[], payload: VocabPointPayload): Promise<void> {
        await this.ensureCollection();
        await this.run(async () =>
            this.client.upsert(EMBEDDING_SPEC.collection, {
                wait: true,
                points: [{ id: pointId, vector, payload }],
            }),
        );
    }

    public async search(vector: number[], userId: string, limit: number, languageFolderId?: string): Promise<VocabSearchHit[]> {
        await this.ensureCollection();

        // Filtering by userId inside the query, never after: post-filtering would
        // leak other users' vocab into the ranking and silently shrink results.
        const must: Record<string, unknown>[] = [{ key: 'userId', match: { value: userId } }];
        if (languageFolderId) {
            must.push({ key: 'languageFolderId', match: { value: languageFolderId } });
        }

        const result = (await this.run(async () =>
            this.client.query(EMBEDDING_SPEC.collection, {
                query: vector,
                filter: { must },
                score_threshold: EMBEDDING_SPEC.scoreThreshold,
                limit,
                with_payload: true,
            }),
        )) as { points: { score: number; payload?: Record<string, unknown> | null }[] };

        return result.points.flatMap((point) => {
            const vocabId = point.payload?.vocabId;
            return typeof vocabId === 'string' ? [{ vocabId, score: point.score }] : [];
        });
    }

    /**
     * Same query as {@link search}, but returns per-folder buckets instead of one
     * ranked list — for searching across every folder at once.
     *
     * Grouping is not cosmetic. Multilingual embedding models rank same-language
     * and English matches higher than equally-relevant matches in other
     * languages, so a single merged list lets whichever folder the query
     * happens to share a language with take nearly every slot. Giving each
     * folder its own bucket means folders compete only within their own
     * language. Qdrant does this server-side in one round trip; `group_by`
     * works here because `languageFolderId` is already a keyword payload index.
     */
    public async searchGrouped(vector: number[], userId: string, groupCount: number, groupSize: number): Promise<VocabSearchGroup[]> {
        await this.ensureCollection();

        const result = (await this.run(async () =>
            this.client.queryGroups(EMBEDDING_SPEC.collection, {
                query: vector,
                filter: { must: [{ key: 'userId', match: { value: userId } }] },
                group_by: 'languageFolderId',
                group_size: groupSize,
                score_threshold: EMBEDDING_SPEC.scoreThreshold,
                limit: groupCount,
                with_payload: true,
            }),
        )) as { groups: { id: unknown; hits: { score: number; payload?: Record<string, unknown> | null }[] }[] };

        return result.groups.flatMap((group) => {
            if (typeof group.id !== 'string') {
                return [];
            }

            const hits = group.hits.flatMap((hit) => {
                const vocabId = hit.payload?.vocabId;
                return typeof vocabId === 'string' ? [{ vocabId, score: hit.score }] : [];
            });

            return hits.length > 0 ? [{ languageFolderId: group.id, hits }] : [];
        });
    }

    /** @param pointIds UUID v5 values, not cuids. */
    public async deleteByIds(pointIds: string[]): Promise<void> {
        if (pointIds.length === 0) {
            return;
        }
        await this.ensureCollection();
        await this.run(async () => this.client.delete(EMBEDDING_SPEC.collection, { wait: true, points: pointIds }));
    }

    /**
     * Every stored point's `vocabId`, for the rare full-drift reconcile.
     *
     * Routine deletions do not need this: a deleted vocab leaves a tombstone row
     * in `vocab_embedding_state`, which the worker finds with a SQL anti-join.
     * This exists only to catch points whose state row vanished without the
     * Qdrant delete landing.
     */
    public async scrollVocabIds(): Promise<string[]> {
        await this.ensureCollection();

        const vocabIds: string[] = [];
        let offset: string | number | Record<string, unknown> | null | undefined;

        do {
            const page = (await this.run(async () =>
                this.client.scroll(EMBEDDING_SPEC.collection, {
                    limit: SCROLL_PAGE_SIZE,
                    offset,
                    with_payload: true,
                    with_vector: false,
                }),
            )) as { points: { payload?: Record<string, unknown> | null }[]; next_page_offset?: unknown };

            for (const point of page.points) {
                const vocabId = point.payload?.vocabId;
                if (typeof vocabId === 'string') {
                    vocabIds.push(vocabId);
                }
            }

            offset = page.next_page_offset as typeof offset;
        } while (offset !== undefined && offset !== null);

        return vocabIds;
    }

    private async run<T>(operation: () => Promise<T>): Promise<T> {
        return this.breaker.fire(operation as () => Promise<unknown>) as Promise<T>;
    }

    private async ensureCollection(): Promise<void> {
        if (this.collectionEnsured) {
            return;
        }

        const { collections } = (await this.run(async () => this.client.getCollections())) as { collections: { name: string }[] };
        const exists = collections.some((collection) => collection.name === EMBEDDING_SPEC.collection);

        if (!exists) {
            this.logger.log(`Creating Qdrant collection "${EMBEDDING_SPEC.collection}" (size=${EMBEDDING_SPEC.dimensions}, distance=Cosine)`);
            await this.run(async () =>
                this.client.createCollection(EMBEDDING_SPEC.collection, {
                    vectors: { size: EMBEDDING_SPEC.dimensions, distance: 'Cosine' },
                }),
            );
        } else {
            await this.assertDimensionsMatch();
        }

        await this.ensurePayloadIndexes();
        this.collectionEnsured = true;
    }

    /**
     * Catches the case where EMBEDDING_SPEC.model/dimensions changed but
     * `collection` was left pointing at an existing collection sized for the
     * old model. Without this, upserts fail with a 400 from Qdrant and pile up
     * behind the worker's retry backoff — silently, since nothing surfaces it.
     */
    private async assertDimensionsMatch(): Promise<void> {
        const info = (await this.run(async () => this.client.getCollection(EMBEDDING_SPEC.collection))) as {
            config: { params: { vectors: { size: number } } };
        };
        const actualSize = info.config.params.vectors.size;

        if (actualSize !== EMBEDDING_SPEC.dimensions) {
            throw new Error(
                `Qdrant collection "${EMBEDDING_SPEC.collection}" has vector size ${actualSize}, but EMBEDDING_SPEC.dimensions is ${EMBEDDING_SPEC.dimensions}. ` +
                    'Give EMBEDDING_SPEC.collection a new name for this model generation — see the upgrade runbook in docs/features/semantic-search.md.',
            );
        }
    }

    /**
     * Qdrant refuses to filter on an unindexed payload field:
     *   "Index required but not found for \"userId\" of one of the following
     *    types: [keyword]"
     * Every search filters by userId, so without these indexes search returns
     * 400 while upserts keep succeeding — the failure only shows up at query
     * time, never at write time.
     *
     * Run on every startup, not only at collection creation, so an existing
     * collection missing an index gets repaired. Creating one that already
     * exists is a no-op.
     */
    private async ensurePayloadIndexes(): Promise<void> {
        for (const fieldName of FILTERABLE_PAYLOAD_FIELDS) {
            await this.run(async () =>
                this.client.createPayloadIndex(EMBEDDING_SPEC.collection, {
                    field_name: fieldName,
                    field_schema: 'keyword',
                    wait: true,
                }),
            );
        }
    }
}
