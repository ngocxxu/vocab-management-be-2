import type { VocabFsrsCard, VocabTrainer } from '@prisma/client';
import { FsrsCardState, FsrsSettings } from '../types';

type FsrsTrainerColumns = Pick<VocabTrainer, 'fsrsDesiredRetention' | 'fsrsMaximumInterval' | 'fsrsNewPerDay' | 'fsrsDirections' | 'fsrsEndsAt'>;

/**
 * The only place that knows the `fsrs*` column names of VocabTrainer. Everything else works with FsrsSettings,
 * so the settings can move to their own 1:1 table later without touching callers.
 */
export class FsrsMapper {
    public toSettings(trainer: FsrsTrainerColumns): FsrsSettings {
        return {
            desiredRetention: trainer.fsrsDesiredRetention,
            maximumInterval: trainer.fsrsMaximumInterval,
            newPerDay: trainer.fsrsNewPerDay,
            directions: trainer.fsrsDirections,
            endsAt: trainer.fsrsEndsAt,
        };
    }

    public toCardState(row: VocabFsrsCard): FsrsCardState {
        return {
            state: row.state,
            due: row.due,
            stability: row.stability,
            difficulty: row.difficulty,
            reps: row.reps,
            lapses: row.lapses,
            scheduledDays: row.scheduledDays,
            lastReviewedAt: row.lastReviewedAt,
        };
    }
}
