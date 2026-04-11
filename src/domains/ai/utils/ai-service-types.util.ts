import { VocabWithTextTargets } from '../../vocab-trainer/utils';
import { EvaluationResult } from './type.util';

export type QueueAudioEvaluationParams = {
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

export type QueueMultipleChoiceGenerationParams = {
    vocabTrainerId: string;
    vocabList: VocabWithTextTargets[];
    userId: string;
};

export type QueueFillInBlankEvaluationParams = {
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
};

export type FormatMarkdownReportFn = (evaluation: EvaluationResult, transcript: string) => string;
