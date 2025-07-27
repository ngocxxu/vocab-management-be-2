export enum EReminderType {
    EMAIL_REMINDER = 'email_reminder',
    NOTIFICATION = 'notification',
}

export enum EReminderTitle {
    VOCAB_TRAINER = 'Vocab Trainer',
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