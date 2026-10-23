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
