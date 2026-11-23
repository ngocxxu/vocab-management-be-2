import type { AppLocale } from '@/shared/utils/locale.util';
import { VocabWithTextTargets } from '../../vocab-trainer/utils';
import { VocabTrainerQueueName } from '../constants/vocab-trainer-job.constants';
import { ActiveJobResponse, VocabTrainerJobType } from '../dto/active-vocab-trainer-job.dto';
import { EvaluationResult } from './type.util';

export type QueueJobResult = {
    jobId: string;
    activeJob?: ActiveJobResponse;
};

type QueueJobIdentity = {
    jobType: VocabTrainerJobType;
    queueName: VocabTrainerQueueName;
};

export type QueueAudioEvaluationParams = QueueJobIdentity & {
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
};

export type QueueMultipleChoiceGenerationParams = QueueJobIdentity & {
    vocabTrainerId: string;
    vocabList: VocabWithTextTargets[];
    userId: string;
};

export type QueueFillInBlankChoiceGenerationParams = QueueJobIdentity & {
    vocabTrainerId: string;
    vocabList: VocabWithTextTargets[];
    userId: string;
};

/** Decided under the user's job lock, then stored in the job. The processor applies this, never decides again (#42). */
export type FillInBlankAttemptDecision = {
    countsAsAttempt: boolean;
    submittedAt: string;
};

export type QueueFillInBlankEvaluationParams = QueueJobIdentity & {
    locale?: AppLocale;
    vocabTrainerId: string;
    /** Called only when this submit gets the user's job lock. A submit that joins the running job never calls it. */
    decideAttempt: () => Promise<FillInBlankAttemptDecision>;
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
};

export type EvaluateTranslationParams = {
    targetDialogue: Array<{ speaker: string; text: string }>;
    transcript: string;
    sourceLanguageCode: string;
    targetLanguageCode: string;
    sourceWords: string[];
    targetStyle?: 'formal' | 'informal';
    targetAudience?: string;
    userId?: string;
    retryCount?: number;
    locale?: AppLocale;
};

export type TranslateVocabParams = {
    textSource: string;
    sourceLanguageCode: string;
    targetLanguageCode: string;
    subjectIds?: string[];
    userId?: string;
    retryCount?: number;
    locale?: AppLocale;
};

export type FormatMarkdownReportFn = (evaluation: EvaluationResult, transcript: string) => string;
