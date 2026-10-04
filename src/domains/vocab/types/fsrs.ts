import type { FsrsDirection, FsrsRating, FsrsState, QuestionType } from '@prisma/client';

/** Per-trainer FSRS settings. Stored in the `fsrs*` columns of VocabTrainer, always read through FsrsMapper.toSettings. */
export type FsrsSettings = {
    desiredRetention: number;
    maximumInterval: number;
    /** Max NEW cards introduced per local day; null = unlimited. */
    newPerDay: number | null;
    directions: FsrsDirection[];
    /** End of the cycle (for example an exam date); null = no end. */
    endsAt: Date | null;
};

/** Scheduling columns of a VocabFsrsCard row (see docs/features/fsrs.md). Also valid as Prisma update data. */
export type FsrsCardState = {
    state: FsrsState;
    due: Date;
    stability: number;
    difficulty: number;
    reps: number;
    lapses: number;
    scheduledDays: number;
    lastReviewedAt: Date | null;
};

/** Values for a VocabFsrsReviewLog row that come from the scheduler (the caller adds ids, answerId, timing, ...). */
export type FsrsReviewLogValues = {
    rating: FsrsRating;
    prevState: FsrsState;
    elapsedDays: number;
    stateAfter: FsrsState;
    dueAfter: Date;
    stabilityAfter: number;
    difficultyAfter: number;
    scheduledDaysAfter: number;
};

export type FsrsReviewOutcome = {
    card: FsrsCardState;
    log: FsrsReviewLogValues;
};

/** What each of the 4 rating buttons would do, used to show the next interval on the button. */
export type FsrsPreview = Record<FsrsRating, FsrsReviewOutcome>;

/** What one rating button would do, for the label of the button. */
export type FsrsPreviewButton = { due: Date; scheduledDays: number };

/** One card of a review session. `direction` decides which side is the question. */
export type FsrsReviewQueueItem = {
    cardId: string;
    vocabId: string;
    direction: FsrsDirection;
    state: FsrsState;
    isNew: boolean;
    frontText: string[];
    /** Every answer accepted for a typed answer (a word can have several translations). */
    acceptedAnswers: string[];
    frontLanguageCode: string;
    backLanguageCode: string;
    preview: Record<FsrsRating, FsrsPreviewButton>;
};

/** A fixed session list plus the counts around it. An ended trainer has no items. */
export type FsrsReviewQueue = {
    ended: boolean;
    items: FsrsReviewQueueItem[];
    overdue: number;
    dueToday: number;
    newAvailable: number;
    pendingAfterThisSession: number;
};

export type FsrsReviewSummary = {
    overdue: number;
    dueToday: number;
    newAvailable: number;
    mastered: number;
    leech: number;
    ended: boolean;
    endsAt: Date | null;
    estimatedDaysToClearBacklog: number;
};

/** One answer to a card. `answerId` is a client-generated id: sending the same one twice must not schedule twice. */
export type FsrsReviewInput = {
    cardId: string;
    rating: FsrsRating;
    questionType: QuestionType;
    answerId: string;
    durationMs?: number;
};

/** Result of recording a review. For a repeated `answerId` the values are those of the first review. */
export type FsrsReviewResult = {
    cardId: string;
    rating: FsrsRating;
    state: FsrsState;
    due: Date;
    stability: number;
    difficulty: number;
    scheduledDays: number;
    isDuplicate: boolean;
};
