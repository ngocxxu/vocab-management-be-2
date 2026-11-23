import type { AudioEvaluationJobData, FillInBlankEvaluationJobData } from '@/queues/interfaces/job-payloads';
import type { Prisma, VocabTrainerAttempt } from '@prisma/client';

/** The two submits that the AI grades later. Matches the CHECK constraint on vocab_trainer_attempt.kind. */
export const ATTEMPT_KIND = {
    FILL_IN_BLANK: 'fill-in-blank',
    AUDIO: 'audio',
} as const;
export type AttemptKind = (typeof ATTEMPT_KIND)[keyof typeof ATTEMPT_KIND];

/** Grading state of the latest submit. Only `grading_failed` can start a regrade. */
export const GRADING_STATUS = {
    GRADING: 'grading',
    GRADED: 'graded',
    GRADING_FAILED: 'grading_failed',
} as const;
export type GradingStatus = (typeof GRADING_STATUS)[keyof typeof GRADING_STATUS];

/** The submit fields the trainer DTO shows. The trainer queries read only these, never the answers snapshot. */
export type AttemptSummary = Pick<VocabTrainerAttempt, 'submittedAt' | 'gradingStatus' | 'regradeCount'>;

/** Puts a recorded submit back as it was (or removes it). Run only when the job could not be queued. */
export type AttemptUndo = () => Promise<void>;

/** Regrades allowed for one submit. Keep in sync with the CHECK constraint on regrade_count in the migration. */
export const REGRADE_LIMIT = 2;

/** What a fill-in-blank job needs and the submit does not send again: the questions as graded, and the answers. */
export type FillInBlankSnapshot = Pick<FillInBlankEvaluationJobData, 'locale' | 'evaluations' | 'answerSubmissions'>;

/** What an audio job needs and the submit does not send again: the recording, the dialogue and the languages. */
export type AudioSnapshot = Pick<
    AudioEvaluationJobData,
    'locale' | 'fileId' | 'targetDialogue' | 'sourceLanguageCode' | 'targetLanguageCode' | 'sourceWords' | 'targetStyle' | 'targetAudience'
>;

type RegradeBase = { vocabTrainerId: string; userId: string; submittedAt: string };
export type RegradeFillInBlankPayload = RegradeBase & FillInBlankSnapshot & { countsAsAttempt: boolean };
export type RegradeAudioPayload = RegradeBase & AudioSnapshot;
export type RegradePayload = RegradeFillInBlankPayload | RegradeAudioPayload;

/** Plain JSON of a snapshot. Drops undefined values, so the stored form reads back the same. */
export function toSnapshotJson(snapshot: object): Prisma.InputJsonValue {
    return JSON.parse(JSON.stringify(snapshot)) as Prisma.InputJsonValue;
}

/** The job payload of a regrade, rebuilt from the stored submit. It has the same fields as the job the submit queued. */
export function toRegradePayload(attempt: Pick<VocabTrainerAttempt, 'kind' | 'trainerId' | 'userId' | 'submittedAt' | 'countsAsAttempt' | 'answersSnapshot'>): RegradePayload {
    const base: RegradeBase = {
        vocabTrainerId: attempt.trainerId,
        userId: attempt.userId,
        submittedAt: attempt.submittedAt.toISOString(),
    };
    const snapshot = attempt.answersSnapshot as object;

    if (attempt.kind === ATTEMPT_KIND.AUDIO) {
        return { ...base, ...(snapshot as AudioSnapshot) };
    }

    // The decision of the submit is reused as it was stored. A regrade never checks the trainer again.
    return { ...base, ...(snapshot as FillInBlankSnapshot), countsAsAttempt: attempt.countsAsAttempt };
}
