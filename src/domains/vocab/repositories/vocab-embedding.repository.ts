import { PrismaService } from '@/shared';
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

/** How long a claimed row stays reserved before another worker may steal it. */
const LEASE_MINUTES = 5;

const MAX_ERROR_LENGTH = 1000;

export interface ClaimedVocab {
    vocabId: string;
    textSource: string;
    userId: string;
    languageFolderId: string;
    /** Computed in SQL at claim time — never recomputed in TS (formats differ). */
    sourceVersion: string;
    contentHash: string | null;
    textTargets: string[];
}

/**
 * The fingerprint deciding whether a vocab needs re-examining.
 *
 * - `vocab.updated_at`             catches an edited textSource
 * - `MAX(text_target.updated_at)`  catches an edited or added textTarget
 * - `COUNT(text_target.id)`        catches a DELETED textTarget, which neither
 *                                  timestamp can see — the row is simply gone
 *
 * Evaluated by Postgres so the filter runs in the database. That is what makes
 * `LIMIT` mean "rows that actually changed" rather than "arbitrary rows we then
 * have to hash to find out".
 *
 * Never mirror this in TypeScript: Postgres renders timestamps as
 * `2026-09-07 02:39:02.123` while JS `toISOString()` yields
 * `2026-09-07T02:39:02.123Z`, so a TS-computed value would never match.
 */
const SOURCE_VERSION_SQL = Prisma.sql`
    GREATEST(v.updated_at, COALESCE(MAX(tt.updated_at), v.updated_at))::text
      || ':' || COUNT(tt.id)::text
`;

@Injectable()
export class VocabEmbeddingRepository {
    public constructor(private readonly prisma: PrismaService) {}

    /**
     * Gives never-seen vocabs a state row so {@link claimDue} can lease them.
     *
     * Seeded with an empty `source_version`, which no real fingerprint can equal,
     * so the row is immediately due.
     */
    public async seedMissingState(limit: number): Promise<number> {
        return this.prisma.$executeRaw`
            INSERT INTO vocab_embedding_state (vocab_id, source_version)
            SELECT v.id, ''
            FROM vocab v
            LEFT JOIN vocab_embedding_state s ON s.vocab_id = v.id
            WHERE s.vocab_id IS NULL
            LIMIT ${limit}
            ON CONFLICT (vocab_id) DO NOTHING
        `;
    }

    /**
     * Leases up to `limit` vocabs whose source data changed since the last embed.
     *
     * Two statements on purpose. `FOR UPDATE` cannot be combined with `GROUP BY`
     * (Postgres rejects it outright), so the candidate scan runs unlocked and the
     * UPDATE does the arbitration: under READ COMMITTED, a second worker blocking
     * on the same row re-evaluates the WHERE clause once the lock frees, sees the
     * lease now set, and does not update it. Only rows actually RETURNED are ours.
     *
     * Both statements are short and commit immediately — neither wraps the
     * embedding API call. From that point `locked_by`/`locked_at` carry ownership
     * as ordinary data, which is what survives the slow network call. A crashed
     * worker's lease expires after {@link LEASE_MINUTES}.
     */
    public async claimDue(limit: number, instanceId: string): Promise<ClaimedVocab[]> {
        const candidates = await this.prisma.$queryRaw<{ vocab_id: string; new_version: string }[]>`
            SELECT v.id AS vocab_id, ${SOURCE_VERSION_SQL} AS new_version
            FROM vocab v
            LEFT JOIN text_target tt ON tt.vocab_id = v.id
            JOIN vocab_embedding_state s ON s.vocab_id = v.id
            WHERE (s.next_attempt_at IS NULL OR s.next_attempt_at <= now())
              AND (s.locked_at IS NULL OR s.locked_at < now() - make_interval(mins => ${LEASE_MINUTES}::int))
            GROUP BY v.id, v.updated_at, s.source_version
            HAVING s.source_version IS DISTINCT FROM (${SOURCE_VERSION_SQL})
            ORDER BY v.updated_at ASC
            LIMIT ${limit}
        `;

        if (candidates.length === 0) {
            return [];
        }

        const candidateIds = candidates.map((row) => row.vocab_id);

        const leased = await this.prisma.$queryRaw<{ vocab_id: string; content_hash: string | null }[]>`
            UPDATE vocab_embedding_state
            SET locked_by = ${instanceId}, locked_at = now()
            WHERE vocab_id = ANY(${candidateIds})
              AND (locked_at IS NULL OR locked_at < now() - make_interval(mins => ${LEASE_MINUTES}::int))
            RETURNING vocab_id, content_hash
        `;

        if (leased.length === 0) {
            return [];
        }

        const versionById = new Map(candidates.map((row) => [row.vocab_id, row.new_version]));
        const hashById = new Map(leased.map((row) => [row.vocab_id, row.content_hash]));

        return this.hydrate([...hashById.keys()], versionById, hashById);
    }

    /**
     * State rows whose vocab is gone. The table has no FK on purpose, so these
     * survive as tombstones and are found with a millisecond anti-join instead of
     * scrolling the entire Qdrant collection.
     */
    public async findOrphans(limit: number): Promise<string[]> {
        const rows = await this.prisma.$queryRaw<{ vocab_id: string }[]>`
            SELECT s.vocab_id
            FROM vocab_embedding_state s
            LEFT JOIN vocab v ON v.id = s.vocab_id
            WHERE v.id IS NULL
            LIMIT ${limit}
        `;
        return rows.map((row) => row.vocab_id);
    }

    public async deleteState(vocabIds: string[]): Promise<void> {
        if (vocabIds.length === 0) {
            return;
        }
        await this.prisma.vocabEmbeddingState.deleteMany({ where: { vocabId: { in: vocabIds } } });
    }

    /** Embedded successfully: store both gates, clear the lease and any failure. */
    public async markEmbedded(vocabId: string, sourceVersion: string, contentHash: string): Promise<void> {
        await this.prisma.vocabEmbeddingState.update({
            where: { vocabId },
            data: {
                sourceVersion,
                contentHash,
                embeddedAt: new Date(),
                attempt: 0,
                nextAttemptAt: null,
                lastError: null,
                lockedBy: null,
                lockedAt: null,
            },
        });
    }

    /**
     * Source changed but the embedded text did not — e.g. only `grammar` was
     * edited. Records the new version so the cheap gate stops re-selecting this
     * row, without spending an embedding call.
     */
    public async markUnchanged(vocabId: string, sourceVersion: string): Promise<void> {
        await this.prisma.vocabEmbeddingState.update({
            where: { vocabId },
            data: { sourceVersion, attempt: 0, nextAttemptAt: null, lastError: null, lockedBy: null, lockedAt: null },
        });
    }

    /**
     * Backoff so one permanently-failing row cannot block the queue head.
     * `sourceVersion` is deliberately NOT stored — the row must stay due.
     */
    public async markFailed(vocabId: string, error: string, attempt: number, backoffMs: number): Promise<void> {
        await this.prisma.vocabEmbeddingState.update({
            where: { vocabId },
            data: {
                attempt: attempt + 1,
                nextAttemptAt: new Date(Date.now() + backoffMs),
                lastError: error.slice(0, MAX_ERROR_LENGTH),
                lockedBy: null,
                lockedAt: null,
            },
        });
    }

    public async releaseLease(vocabIds: string[]): Promise<void> {
        if (vocabIds.length === 0) {
            return;
        }
        await this.prisma.vocabEmbeddingState.updateMany({
            where: { vocabId: { in: vocabIds } },
            data: { lockedBy: null, lockedAt: null },
        });
    }

    public async getAttempt(vocabId: string): Promise<number> {
        const state = await this.prisma.vocabEmbeddingState.findUnique({
            where: { vocabId },
            select: { attempt: true },
        });
        return state?.attempt ?? 0;
    }

    /** Loads the text needed to build the embedding input for already-leased rows. */
    private async hydrate(vocabIds: string[], versionById: Map<string, string>, hashById: Map<string, string | null>): Promise<ClaimedVocab[]> {
        const vocabs = await this.prisma.vocab.findMany({
            where: { id: { in: vocabIds } },
            select: {
                id: true,
                textSource: true,
                userId: true,
                languageFolderId: true,
                textTargets: { select: { textTarget: true } },
            },
        });

        return vocabs.flatMap((vocab) => {
            const sourceVersion = versionById.get(vocab.id);
            if (!sourceVersion) {
                return [];
            }
            return [
                {
                    vocabId: vocab.id,
                    textSource: vocab.textSource,
                    userId: vocab.userId,
                    languageFolderId: vocab.languageFolderId,
                    sourceVersion,
                    contentHash: hashById.get(vocab.id) ?? null,
                    textTargets: vocab.textTargets.map((target) => target.textTarget),
                },
            ];
        });
    }
}
