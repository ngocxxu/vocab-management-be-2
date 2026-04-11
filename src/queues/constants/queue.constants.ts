export { EEmailReminderType, ENotificationFcmType, EReminderType } from '@/domains/reminder/utils';

import { EReminderType } from '@/domains/reminder/utils';

export const DEAD_LETTER_QUEUE = 'dead-letter' as const;

export const WORKLOAD_QUEUE_NAMES: EReminderType[] = [
    EReminderType.EMAIL_REMINDER,
    EReminderType.NOTIFICATION,
    EReminderType.NOTIFICATION_FCM,
    EReminderType.AUDIO_EVALUATION,
    EReminderType.MULTIPLE_CHOICE_GENERATION,
    EReminderType.FILL_IN_BLANK_EVALUATION,
    EReminderType.VOCAB_TRANSLATION,
];

export const JOB_NAMES = {
    evaluateAudio: 'evaluate-audio',
    generateQuestions: 'generate-questions',
    evaluateAnswers: 'evaluate-answers',
    translateVocab: 'translate-vocab',
    failedJobMirror: 'failed-job',
} as const;
