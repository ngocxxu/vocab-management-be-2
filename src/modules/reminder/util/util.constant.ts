export enum EReminderType {
    EMAIL_REMINDER = 'email_reminder',
    NOTIFICATION = 'notification',
    NOTIFICATION_FCM = 'notification_fcm',
    AUDIO_EVALUATION = 'audio-evaluation',
    MULTIPLE_CHOICE_GENERATION = 'multiple-choice-generation',
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
    SEND_CREATE_NOTIFICATION = 'send_create_notification',
}

export enum EEmailTemplate {
    WELCOME = 'welcome',
    PASSWORD_RESET = 'password_reset',
    REMINDER = 'reminder',
    EXAM_REMINDER = 'exam_reminder',
}

export const EXPIRES_AT_30_DAYS = 1000 * 60 * 60 * 24 * 30; // 30 days
