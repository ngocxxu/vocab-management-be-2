import type { VocabTrainerQueueName } from '@/domains/ai/constants/vocab-trainer-job.constants';
import type { VocabTrainerJobType } from '@/domains/ai/dto/active-vocab-trainer-job.dto';
import type { VocabWithTextTargets } from '@/domains/vocab-trainer/utils';
import type { AppLocale } from '@/shared/utils/locale.util';
import type { TemplateData } from '@/shared/utils/type.util';

interface VocabTrainerJobMetadata {
    jobId: string;
    lockToken: string;
    jobType: VocabTrainerJobType;
    queueName: VocabTrainerQueueName;
}

export interface AudioEvaluationJobData extends VocabTrainerJobMetadata {
    locale?: AppLocale;
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

export interface MultipleChoiceGenerationJobData extends VocabTrainerJobMetadata {
    vocabTrainerId: string;
    vocabList: VocabWithTextTargets[];
    userId: string;
}

export interface FillInBlankChoiceGenerationJobData extends VocabTrainerJobMetadata {
    vocabTrainerId: string;
    vocabList: VocabWithTextTargets[];
    userId: string;
}

export interface FillInBlankEvaluationJobData extends VocabTrainerJobMetadata {
    locale?: AppLocale;
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
    locale?: AppLocale;
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

export interface SubjectGenerateJobData {
    textTarget: string;
    targetLanguageCode: string;
    userId: string;
}

export interface VocabGenerateTextTargetJobData {
    locale?: AppLocale;
    textSource: string;
    sourceLanguageCode: string;
    targetLanguageCode: string;
    userId: string;
}

export interface AiChatJobData {
    userId: string;
    messageId: string;
    tier: string;
    locale?: AppLocale;
}
