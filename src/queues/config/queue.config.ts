import { EReminderType } from '@/domains/reminder/utils';
import type { JobsOptions } from 'bullmq';

export interface QueueWorkerConfig {
    concurrency: number;
    defaultJobOptions: JobsOptions;
}

const exponentialBackoff: JobsOptions['backoff'] = {
    type: 'exponential',
    delay: 2000,
};

export const QUEUE_CONFIG: Record<EReminderType, QueueWorkerConfig> = {
    [EReminderType.AUDIO_EVALUATION]: {
        concurrency: 2,
        defaultJobOptions: {
            attempts: 3,
            backoff: exponentialBackoff,
            removeOnComplete: 100,
            removeOnFail: 500,
        },
    },
    [EReminderType.MULTIPLE_CHOICE_GENERATION]: {
        concurrency: 2,
        defaultJobOptions: {
            attempts: 3,
            backoff: exponentialBackoff,
            removeOnComplete: 100,
            removeOnFail: 500,
        },
    },
    [EReminderType.FILL_IN_BLANK_EVALUATION]: {
        concurrency: 1,
        defaultJobOptions: {
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
};

export const DEAD_LETTER_QUEUE_DEFAULT_OPTIONS: JobsOptions = {
    attempts: 1,
    removeOnComplete: 100,
    removeOnFail: 500,
};

export const EMAIL_REMINDER_JOB_CONCURRENCY = {
    templateEmail: 3,
    scheduleEmail: 2,
} as const;
