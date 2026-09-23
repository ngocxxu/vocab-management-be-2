import { EMBEDDING_SPEC_ID } from '@/domains/ai/constants';
import { isAiRateLimitError } from '@/domains/ai/utils/ai-rate-limit.util';
import { LoggerService } from '@/shared';
import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { createHash } from 'node:crypto';
import { EmbeddingProvider } from '../../ai/providers/embedding.provider';
import { ClaimedVocab, VocabEmbeddingRepository } from '../repositories';
import { buildEmbeddingText } from '../utils/build-embedding-text.util';
import { toVocabPointId } from '../utils/vocab-point-id.util';
import { QdrantService } from './qdrant.service';

const WORKER_CONFIG = {
    /** Safety net. CDC shortens latency; this bounds it when CDC is down. */
    intervalMs: 30_000,
    /** Coalesces a burst of CDC webhooks (e.g. a CSV import) into one scan. */
    wakeDebounceMs: 2_000,
    batchSize: 20,
    seedBatchSize: 500,
    orphanBatchSize: 500,
    perItemDelayMs: 300,
    /** Backoff grows 1m, 2m, 4m... so a poison row cannot hold the queue head. */
    retryBaseMs: 60_000,
    maxRetryMs: 6 * 60 * 60 * 1000,
    /** gemini-embedding-001 accepts 2048 tokens; ~4 chars/token, kept conservative. */
    maxTextLength: 6_000,
};

@Injectable()
export class VocabEmbeddingWorkerService implements OnModuleDestroy {
    private readonly instanceId = process.env.INSTANCE_ID ?? `pid-${process.pid}`;
    private wakeTimer?: NodeJS.Timeout;
    private stopped = false;
    private processing = false;

    public constructor(
        private readonly repository: VocabEmbeddingRepository,
        private readonly embeddingProvider: EmbeddingProvider,
        private readonly qdrantService: QdrantService,
        private readonly logger: LoggerService,
    ) {}

    @Interval('vocab-embedding-worker', WORKER_CONFIG.intervalMs)
    private tick(): void {
        if (process.env.VOCAB_EMBEDDING_ENABLED === 'false') {
            return;
        }
        void this.run().catch((error: unknown) => {
            this.logger.error(`Vocab embedding worker failed: ${toMessage(error)}`);
        });
    }

    public onModuleDestroy(): void {
        this.stopped = true;
        if (this.wakeTimer) {
            clearTimeout(this.wakeTimer);
        }
    }

    /**
     * Called by the CDC webhook. Debounced: a 5,000-row CSV import fires thousands
     * of webhooks, and this collapses them into a single scan.
     *
     * Carries no information about *what* changed — the worker's own SQL decides
     * that. This is only a "scan sooner" signal, which is why CDC being down costs
     * latency and nothing else.
     */
    public requestWake(): void {
        if (this.stopped || process.env.VOCAB_EMBEDDING_ENABLED === 'false') {
            return;
        }
        if (this.wakeTimer) {
            clearTimeout(this.wakeTimer);
        }
        this.wakeTimer = setTimeout(() => this.tick(), WORKER_CONFIG.wakeDebounceMs);
    }

    private async run(): Promise<void> {
        // Node is single-threaded, so this check is atomic within one process.
        // Across pods, the DB lease in claimDue() is what prevents duplicate work.
        if (this.stopped || this.processing) {
            return;
        }
        this.processing = true;
        try {
            await this.pruneDeleted();
            await this.repository.seedMissingState(WORKER_CONFIG.seedBatchSize);
            await this.embedDueBatch();
        } finally {
            this.processing = false;
        }
    }

    /**
     * State rows outlive their vocab on purpose (no FK), so a deleted vocab leaves
     * a tombstone this anti-join finds in milliseconds — no Qdrant scroll needed.
     */
    private async pruneDeleted(): Promise<void> {
        const orphanIds = await this.repository.findOrphans(WORKER_CONFIG.orphanBatchSize);
        if (orphanIds.length === 0) {
            return;
        }

        await this.qdrantService.deleteByIds(orphanIds.map(toVocabPointId));
        await this.repository.deleteState(orphanIds);
        this.logger.info(`Vocab embedding worker: pruned ${orphanIds.length} orphaned points`);
    }

    private async embedDueBatch(): Promise<void> {
        const claimed = await this.repository.claimDue(WORKER_CONFIG.batchSize, this.instanceId, EMBEDDING_SPEC_ID);
        if (claimed.length === 0) {
            return;
        }

        let embedded = 0;
        let skipped = 0;

        for (let index = 0; index < claimed.length; index += 1) {
            const vocab = claimed[index];

            if (this.stopped) {
                await this.repository.releaseLease(claimed.slice(index).map((row) => row.vocabId));
                break;
            }

            const outcome = await this.processOne(vocab);

            if (outcome === 'embedded') {
                embedded += 1;
            } else if (outcome === 'skipped') {
                skipped += 1;
            } else if (outcome === 'aborted') {
                // Rate limited or breaker open: hand the rest back so a later tick retries.
                await this.repository.releaseLease(claimed.slice(index + 1).map((row) => row.vocabId));
                break;
            }
        }

        if (embedded > 0 || skipped > 0) {
            this.logger.info(`Vocab embedding worker: embedded ${embedded}, skipped ${skipped} of ${claimed.length} claimed`);
        }
    }

    private async processOne(vocab: ClaimedVocab): Promise<'embedded' | 'skipped' | 'failed' | 'aborted'> {
        try {
            const text = buildEmbeddingText(vocab.textSource, vocab.textTargets).normalize('NFC');

            // Empty text can never embed. Record the version so it stops being due
            // instead of failing forever behind exponential backoff.
            if (text.length === 0) {
                await this.repository.markUnchanged(vocab.vocabId, vocab.sourceVersion, EMBEDDING_SPEC_ID);
                return 'skipped';
            }

            const truncated = text.slice(0, WORKER_CONFIG.maxTextLength);
            const hash = createHash('sha256').update(truncated).digest('hex');

            // Exact gate: skip only when NEITHER the text NOR the embedding model
            // changed. A model change (EMBEDDING_SPEC_ID mismatch) forces a
            // re-embed even though the text hash is identical, since the vector
            // space itself is different.
            if (hash === vocab.contentHash && vocab.embeddingSpec === EMBEDDING_SPEC_ID) {
                await this.repository.markUnchanged(vocab.vocabId, vocab.sourceVersion, EMBEDDING_SPEC_ID);
                return 'skipped';
            }

            const vector = await this.embeddingProvider.embed(truncated, 'RETRIEVAL_DOCUMENT');
            await this.qdrantService.upsert(toVocabPointId(vocab.vocabId), vector, {
                vocabId: vocab.vocabId,
                userId: vocab.userId,
                languageFolderId: vocab.languageFolderId,
            });

            await this.repository.markEmbedded(vocab.vocabId, vocab.sourceVersion, hash, EMBEDDING_SPEC_ID);
            await sleep(WORKER_CONFIG.perItemDelayMs);
            return 'embedded';
        } catch (error) {
            if (isAiRateLimitError(error) || isBreakerOpen(error)) {
                this.logger.warn(`Vocab embedding worker: backing off (${toMessage(error)})`);
                await this.repository.releaseLease([vocab.vocabId]);
                return 'aborted';
            }

            const attempt = await this.repository.getAttempt(vocab.vocabId);
            const backoffMs = Math.min(WORKER_CONFIG.retryBaseMs * 2 ** attempt, WORKER_CONFIG.maxRetryMs);
            await this.repository.markFailed(vocab.vocabId, toMessage(error), attempt, backoffMs);
            this.logger.error(`Vocab embedding worker: vocab ${vocab.vocabId} failed (attempt ${attempt + 1}): ${toMessage(error)}`);
            return 'failed';
        }
    }
}

function toMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

/**
 * opossum tags open-circuit rejections with `code: 'EOPENBREAKER'`
 * (verified in node_modules/opossum/lib/circuit.js). Matching the code rather
 * than the message survives a wording change upstream.
 */
function isBreakerOpen(error: unknown): boolean {
    return error instanceof Error && (error as NodeJS.ErrnoException).code === 'EOPENBREAKER';
}

async function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
