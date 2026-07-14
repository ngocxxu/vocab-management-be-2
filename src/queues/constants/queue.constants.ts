export { EEmailReminderType, ENotificationFcmType, EReminderType } from '@/domains/reminder/utils';

import { EReminderType } from '@/domains/reminder/utils';

export const DEAD_LETTER_QUEUE = 'dead-letter' as const;

export const WORKLOAD_QUEUE_NAMES: EReminderType[] = [
    EReminderType.EMAIL_REMINDER,
    EReminderType.NOTIFICATION,
    EReminderType.NOTIFICATION_FCM,
    EReminderType.AUDIO_EVALUATION,
    EReminderType.MULTIPLE_CHOICE_GENERATION,
    EReminderType.FILL_IN_BLANK_CHOICE_GENERATION,
    EReminderType.FILL_IN_BLANK_EVALUATION,
    EReminderType.VOCAB_TRANSLATION,
    EReminderType.SUBJECT_GENERATE,
    EReminderType.VOCAB_GENERATE_TEXT_TARGET,
    EReminderType.AI_CHAT,
];

export const JOB_NAMES = {
    evaluateAudio: 'evaluate-audio',
    generateQuestions: 'generate-questions',
    generateFillInBlankChoice: 'generate-fill-in-blank-choice',
    evaluateAnswers: 'evaluate-answers',
    translateVocab: 'translate-vocab',
    failedJobMirror: 'failed-job',
    generateSubjects: 'generate-subjects',
    generateTextTarget: 'generate-text-target',
    aiChat: 'ai-chat',
} as const;
