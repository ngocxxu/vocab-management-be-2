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
    /** The submit time, ISO. The processor writes only while the stored submit still has this time (#17). Absent on older jobs: the job time. */
    submittedAt?: string;
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
    /** Whether this attempt counts as a new reminder cycle, decided when the job was queued (#42). Absent on jobs queued before #42: counted. */
    countsAsAttempt?: boolean;
    /** The submit time, ISO. A retry that finds this time already on the trainer is a no-op. Absent on older jobs: the job time. */
    submittedAt?: string;
    evaluations: Array<{
        vocab: VocabWithTextTargets;
        userAnswer: string;
        systemAnswer: string;
        questionType: 'textSource' | 'textTarget';
        vocabId: string;
        /** Question text for display only. Copied to the stored result, never sent to the grader (#17). */
        content?: string | null;
    }>;
    answerSubmissions: Array<{
        userAnswer: string;
        systemAnswer: string;
        /** Question text for display only, null when the client sent none. Kept in the attempt snapshot (#17). */
        content?: string | null;
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
