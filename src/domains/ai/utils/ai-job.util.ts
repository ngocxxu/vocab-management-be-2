import { captureSentryException } from '@/shared';
import type { Job } from 'bull';
import { VOCAB_TRAINER_AI_CONFIG } from '../constants/vocab-trainer-job.constants';
import { isAiRateLimitError } from './ai-rate-limit.util';

export class StaleAiJobError extends Error {
    public constructor(jobId: string, userId: string) {
        super(`Job ${jobId} was superseded or its lock expired for user ${userId}`);
        this.name = 'StaleAiJobError';
    }
}

export class AiCallTimeoutError extends Error {
    public constructor(label: string, timeoutMs: number) {
        super(`${label} timed out after ${timeoutMs}ms`);
        this.name = 'AiCallTimeoutError';
    }
}

// ponytail: Promise.race cannot cancel the underlying request; it keeps running and its result is ignored.
export async function withAiCallTimeout<T>(promise: Promise<T>, label: string, timeoutMs = VOCAB_TRAINER_AI_CONFIG.AI_CALL_TIMEOUT_SECONDS * 1000): Promise<T> {
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new AiCallTimeoutError(label, timeoutMs)), timeoutMs);
    });

    try {
        return await Promise.race([promise, timeout]);
    } finally {
        clearTimeout(timer);
    }
}

export interface AiJobFailure {
    /** Retrying cannot help (rate limit, stale lock): Bull must not retry. */
    permanent: boolean;
    /** No further attempt will run: the FE gets `failed` and the user lock is released. */
    finalAttempt: boolean;
}

export function classifyAiJobFailure(job: Pick<Job, 'attemptsMade' | 'opts'>, error: unknown): AiJobFailure {
    const permanent = error instanceof StaleAiJobError || isAiRateLimitError(error);
    const finalAttempt = permanent || job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
    return { permanent, finalAttempt };
}

/**
 * Whether a final failure may mark the submit as grading_failed (#17). A stale job lost the user's lock. When another job holds the
 * lock now, that job owns the submit's state, so the stale job must not write it. `activeJob` is read only for a stale job.
 */
export async function mayRecordGradingFailure(error: unknown, activeJob: () => Promise<unknown>): Promise<boolean> {
    if (!(error instanceof StaleAiJobError)) {
        return true;
    }

    return !(await activeJob());
}

/**
 * Marks a grading as failed so the client can regrade it (#17). It never throws: a failed write is logged and reported,
 * so the caller still releases the user's job lock. Returns true only when a row was marked.
 */
export async function recordGradingFailure(markFailed: () => Promise<number>, logger: { error: (message: string) => void }, jobId: string): Promise<boolean> {
    try {
        return (await markFailed()) > 0;
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error(`Could not mark the grading of job ${jobId} as failed: ${message}`);
        captureSentryException(error);

        return false;
    }
}
