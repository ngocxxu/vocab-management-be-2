export const VOCAB_TRAINER_AI_CONFIG = {
    AI_CALL_TIMEOUT_SECONDS: 30,
    MAX_BACKOFF_SECONDS: 60,
    MAX_RETRY_ATTEMPTS: 3,
    SAFETY_BUFFER_SECONDS: 60,
} as const;

export const VOCAB_TRAINER_JOB_LOCK_TTL_SECONDS =
    VOCAB_TRAINER_AI_CONFIG.MAX_RETRY_ATTEMPTS * (VOCAB_TRAINER_AI_CONFIG.AI_CALL_TIMEOUT_SECONDS + VOCAB_TRAINER_AI_CONFIG.MAX_BACKOFF_SECONDS) +
    VOCAB_TRAINER_AI_CONFIG.SAFETY_BUFFER_SECONDS;

export const VOCAB_TRAINER_QUEUE_NAMES = ['multiple-choice-generation', 'fill-in-blank-choice-generation', 'fill-in-blank-evaluation', 'audio-evaluation'] as const;

export type VocabTrainerQueueName = (typeof VOCAB_TRAINER_QUEUE_NAMES)[number];
