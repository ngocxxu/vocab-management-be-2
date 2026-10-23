import { VOCAB_TRAINER_AI_CONFIG } from '@/domains/ai/constants/vocab-trainer-job.constants';
import { EReminderType } from '@/domains/reminder/utils';
import type { JobOptions } from 'bull';

export interface QueueWorkerConfig {
    concurrency: number;
    defaultJobOptions: JobOptions;
}

// ponytail: Bull rejects the job after this; the underlying promise keeps running (no cancel).
const AI_JOB_TIMEOUT_MS = VOCAB_TRAINER_AI_CONFIG.JOB_TIMEOUT_SECONDS * 1000;

const exponentialBackoff: JobOptions['backoff'] = {
    type: 'exponential',
    delay: 2000,
};

export const QUEUE_CONFIG: Record<EReminderType, QueueWorkerConfig> = {
    [EReminderType.AUDIO_EVALUATION]: {
        concurrency: 2,
        defaultJobOptions: {
            timeout: AI_JOB_TIMEOUT_MS,
            attempts: 3,
            backoff: exponentialBackoff,
            removeOnComplete: 100,
            removeOnFail: 500,
        },
    },
    [EReminderType.MULTIPLE_CHOICE_GENERATION]: {
        concurrency: 2,
        defaultJobOptions: {
            timeout: AI_JOB_TIMEOUT_MS,
            attempts: 3,
            backoff: exponentialBackoff,
            removeOnComplete: 100,
            removeOnFail: 500,
        },
    },
    [EReminderType.FILL_IN_BLANK_CHOICE_GENERATION]: {
        concurrency: 2,
        defaultJobOptions: {
            timeout: AI_JOB_TIMEOUT_MS,
            attempts: 3,
            backoff: exponentialBackoff,
            removeOnComplete: 100,
            removeOnFail: 500,
        },
    },
    [EReminderType.FILL_IN_BLANK_EVALUATION]: {
        concurrency: 1,
        defaultJobOptions: {
            timeout: AI_JOB_TIMEOUT_MS,
            attempts: 3,
            backoff: exponentialBackoff,
            removeOnComplete: 100,
            removeOnFail: 500,
        },
    },
    [EReminderType.VOCAB_TRANSLATION]: {
        concurrency: 2,
        defaultJobOptions: {
            attempts: 3,
            backoff: exponentialBackoff,
            removeOnComplete: 100,
            removeOnFail: 500,
        },
    },
    [EReminderType.EMAIL_REMINDER]: {
        concurrency: 5,
        defaultJobOptions: {
            attempts: 3,
            backoff: exponentialBackoff,
            removeOnComplete: 100,
            removeOnFail: 500,
        },
    },
    [EReminderType.NOTIFICATION]: {
        concurrency: 10,
        defaultJobOptions: {
            attempts: 3,
            backoff: exponentialBackoff,
            removeOnComplete: 100,
            removeOnFail: 500,
        },
    },
    [EReminderType.NOTIFICATION_FCM]: {
        concurrency: 10,
        defaultJobOptions: {
            attempts: 3,
            backoff: exponentialBackoff,
            removeOnComplete: 100,
            removeOnFail: 500,
        },
    },
    [EReminderType.SUBJECT_GENERATE]: {
        concurrency: 5,
        defaultJobOptions: {
            attempts: 1,
            removeOnComplete: 100,
            removeOnFail: 500,
        },
    },
    [EReminderType.VOCAB_GENERATE_TEXT_TARGET]: {
        concurrency: 5,
        defaultJobOptions: {
            attempts: 1,
            removeOnComplete: 100,
            removeOnFail: 500,
        },
    },
    [EReminderType.AI_CHAT]: {
        concurrency: 5,
        defaultJobOptions: {
            attempts: 2,
            backoff: exponentialBackoff,
            removeOnComplete: 100,
            removeOnFail: 500,
        },
    },
};

export const DEAD_LETTER_QUEUE_DEFAULT_OPTIONS: JobOptions = {
    attempts: 1,
    removeOnComplete: 100,
    removeOnFail: 500,
};

export const EMAIL_REMINDER_JOB_CONCURRENCY = {
    templateEmail: 3,
    scheduleEmail: 2,
} as const;
