import type { TemplateData } from '@/shared/utils/type.util';
import type { VocabWithTextTargets } from '@/domains/vocab-trainer/utils';

export interface AudioEvaluationJobData {
    fileId: string;
    targetDialogue: Array<{ speaker: string; text: string }>;
    sourceLanguageCode: string;
    targetLanguageCode: string;
    sourceWords: string[];
    targetStyle?: 'formal' | 'informal';
    targetAudience?: string;
    userId: string;
    vocabTrainerId: string;
}

export interface MultipleChoiceGenerationJobData {
    vocabTrainerId: string;
    vocabList: VocabWithTextTargets[];
    userId: string;
}

export interface FillInBlankEvaluationJobData {
    vocabTrainerId: string;
    evaluations: Array<{
        vocab: VocabWithTextTargets;
        userAnswer: string;
        systemAnswer: string;
        questionType: 'textSource' | 'textTarget';
        vocabId: string;
    }>;
    answerSubmissions: Array<{
        userAnswer: string;
        systemAnswer: string;
    }>;
    userId: string;
}

export interface VocabTranslationJobData {
    vocabId: string;
    textSource: string;
    sourceLanguageCode: string;
    targetLanguageCode: string;
    subjectIds?: string[];
    userId: string;
}

export interface NotificationJobData {
    reminderType: string;
    data: TemplateData;
    recipientUserIds: string[];
}

export interface SendFcmNotificationJobData {
    notificationId: string;
    userIds: string[];
    title: string;
    body: string;
    data?: Record<string, string>;
    priority?: 'normal' | 'high';
}

export interface EmailJobData {
    userEmail: string;
    reminderType: string;
    templateName: string;
    data: TemplateData;
}

export interface ReminderScheduleEmailJobData {
    scheduleId: string;
}
