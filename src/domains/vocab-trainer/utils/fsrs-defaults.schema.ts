import { FsrsDirection } from '@prisma/client';
import { z } from 'zod';
import { isValidTimezone } from '../../vocab/utils/fsrs-local-day.util';
import { FSRS_MAX_DESIRED_RETENTION, FSRS_MIN_DESIRED_RETENTION, isRandomWithOthers } from './fsrs-trainer-rules';

/** Config (scope USER) key of the defaults. The timezone key lives next to the code that reads it (fsrs-local-day.util). */
export const SRS_DEFAULTS_CONFIG_KEY = 'srs.defaults';

/** What a new FSRS trainer starts from. Copied into the trainer when it is created, never read again during review. */
export const srsDefaultsSchema = z.strictObject({
    desiredRetention: z.number().min(FSRS_MIN_DESIRED_RETENTION).max(FSRS_MAX_DESIRED_RETENTION),
    directions: z
        .array(z.enum(FsrsDirection))
        .min(1)
        .refine((directions) => new Set(directions).size === directions.length, 'directions must be unique')
        .refine((directions) => !isRandomWithOthers(directions), 'RANDOM cannot be combined with another direction'),
    questionType: z.enum(['FLIP_CARD', 'FILL_IN_THE_BLANK']),
    reminderEnabled: z.boolean(),
});

export const srsDefaultsPatchSchema = srsDefaultsSchema.partial();

export const updateSrsSettingsSchema = z.strictObject({
    defaults: srsDefaultsPatchSchema.optional(),
    timezone: z.string().refine(isValidTimezone, 'unknown timezone').optional(),
});

export type SrsDefaults = z.infer<typeof srsDefaultsSchema>;

/** The user's own FSRS settings. `timezone` is null until the user (or the browser, the first time) sets one. */
export type SrsSettings = { defaults: SrsDefaults; timezone: string | null };

export const SYSTEM_SRS_DEFAULTS: SrsDefaults = {
    desiredRetention: 0.9,
    directions: [FsrsDirection.SOURCE_TO_TARGET, FsrsDirection.TARGET_TO_SOURCE],
    questionType: 'FLIP_CARD',
    reminderEnabled: true,
};
