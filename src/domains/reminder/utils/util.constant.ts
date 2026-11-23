import { ReminderScheduleStatus } from '@prisma/client';

export enum EReminderType {
    EMAIL_REMINDER = 'email_reminder',
    NOTIFICATION = 'notification',
    NOTIFICATION_FCM = 'notification_fcm',
    AUDIO_EVALUATION = 'audio-evaluation',
    MULTIPLE_CHOICE_GENERATION = 'multiple-choice-generation',
    FILL_IN_BLANK_CHOICE_GENERATION = 'fill-in-blank-choice-generation',
    FILL_IN_BLANK_EVALUATION = 'fill-in-blank-evaluation',
    VOCAB_TRANSLATION = 'vocab-translation',
    SUBJECT_GENERATE = 'subject-generate',
    VOCAB_GENERATE_TEXT_TARGET = 'vocab-generate-text-target',
    AI_CHAT = 'ai-chat',
}

export enum EReminderTitle {
    VOCAB_TRAINER = 'Vocab Trainer',
    NOTIFICATION = 'Notification',
}

export enum ENotificationFcmType {
    SEND_NOTIFICATION = 'send_notification',
}

export enum EEmailReminderType {
    SEND_REMINDER = 'send_reminder',
    SEND_REMINDER_SCHEDULE = 'send_reminder_schedule',
    SEND_CREATE_NOTIFICATION = 'send_create_notification',
}

export enum EEmailTemplate {
    WELCOME = 'welcome',
    PASSWORD_RESET = 'password_reset',
    REMINDER = 'reminder',
    EXAM_REMINDER = 'exam_reminder',
    FSRS_DUE_REMINDER = 'fsrs_due_reminder',
}

/** Which Reminder a Bell notification came from. The FE branches on these exact strings. */
export enum EReminderNotificationKind {
    INITIAL = 'INITIAL',
    ESCALATION = 'ESCALATION',
    FSRS_DUE = 'FSRS_DUE',
}

export const EXPIRES_AT_30_DAYS = 1000 * 60 * 60 * 24 * 30; // 30 days

/** Bell of a classic reminder: kept 90 days (FSRS bells keep EXPIRES_AT_30_DAYS). */
export const EXPIRES_AT_90_DAYS = 1000 * 60 * 60 * 24 * 90; // 90 days

/** A classic INITIAL reminder in one of these states blocks counting a new attempt (#42). A FAILED_TERMINAL one does not. */
export const IN_FLIGHT_INITIAL_STATUSES: ReminderScheduleStatus[] = [
    ReminderScheduleStatus.PENDING,
    ReminderScheduleStatus.CLAIMED,
    ReminderScheduleStatus.QUEUED,
    ReminderScheduleStatus.SENDING,
];
