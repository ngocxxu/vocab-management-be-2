import type { FsrsDirection, FsrsRating, FsrsState } from '@prisma/client';

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
