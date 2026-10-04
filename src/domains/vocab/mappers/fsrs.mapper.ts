import type { Prisma, VocabFsrsCard, VocabTrainer } from '@prisma/client';
import { FsrsCardState, FsrsSettings } from '../types';

/** The settings that stay editable after the trainer is created (mode and directions do not). */
export type FsrsSettingsPatch = Partial<Pick<FsrsSettings, 'desiredRetention' | 'maximumInterval' | 'newPerDay' | 'endsAt'>>;

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

    /** Settings that can change after creation, as trainer columns. A key that is not in the patch is not in the result. */
    public toColumns(patch: FsrsSettingsPatch): Prisma.VocabTrainerUpdateInput {
        return {
            ...(patch.desiredRetention !== undefined && { fsrsDesiredRetention: patch.desiredRetention }),
            ...(patch.maximumInterval !== undefined && { fsrsMaximumInterval: patch.maximumInterval }),
            ...(patch.newPerDay !== undefined && { fsrsNewPerDay: patch.newPerDay }),
            ...(patch.endsAt !== undefined && { fsrsEndsAt: patch.endsAt }),
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
