import type { AttemptUndo, RegradePayload } from '../../vocab-trainer/utils/attempt-snapshot.util';
import type { AppLocale } from '@/shared/utils/locale.util';

export type { AttemptUndo } from '../../vocab-trainer/utils/attempt-snapshot.util';
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

/** Decided under the user's job lock: the submit time of an audio job. */
export type AudioAttemptDecision = { submittedAt: string };

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
    /** Called only when this submit gets the user's job lock. A submit that joins the running job never calls it (#17). */
    decideAttempt: () => AudioAttemptDecision;
    /** Writes the submit before the job is queued. Returns the undo, run when the queue step fails. */
    recordAttempt: (decision: AudioAttemptDecision) => Promise<AttemptUndo>;
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
    /** Writes the submit (answers, snapshot, grading state) before the job is queued. Returns the undo, run when the queue step fails (#17). */
    recordAttempt: (decision: FillInBlankAttemptDecision) => Promise<AttemptUndo>;
    evaluations: Array<{
        vocab: VocabWithTextTargets;
        userAnswer: string;
        systemAnswer: string;
        questionType: 'textSource' | 'textTarget';
        vocabId: string;
        /** Question text for display only (#17). */
        content?: string | null;
    }>;
    answerSubmissions: Array<{
        userAnswer: string;
        systemAnswer: string;
        /** Question text for display only (#17). */
        content?: string | null;
    }>;
    userId: string;
};

/** A regrade takes a failed submit back to grading under the user's job lock, and returns the job payload it is queued with. */
export type RegradeClaim = {
    payload: RegradePayload;
    /** Puts the submit back to grading_failed and gives the regrade back. Run only when the job could not be queued. */
    rollback: AttemptUndo;
};

export type QueueRegradeParams = {
    userId: string;
    vocabTrainerId: string;
    jobType: VocabTrainerJobType;
    queueName: VocabTrainerQueueName;
    /** Called under the user's job lock. Throws when the submit cannot be regraded now. */
    claim: () => Promise<RegradeClaim>;
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
