import { TrainerMode, VocabTrainer } from '@prisma/client';
import { VocabTrainerBadRequestException } from '../exceptions';

const HOUR_MS = 60 * 60 * 1000;

/** Ranges and defaults of the Classic reminder cycle. The DB CHECK constraints in the migration use the same ranges. */
export const PASS_RULES = {
    spacingDays: { default: 2, min: 2, max: 30 },
    maxRepeat: { default: 6, min: 3, max: 20 },
    /** Counted failed attempts in a row that ask the user whether to keep reminders on. */
    failStreakForPrompt: 3,
    /** With reminders off, at most one counted attempt per this window. */
    countCooldownMs: 24 * HOUR_MS,
} as const;

export interface CountDecisionInput {
    remindersOff: boolean;
    /** A classic INITIAL reminder of the trainer is PENDING, CLAIMED, QUEUED or SENDING. Blocks the attempt with reminders on or off. */
    hasInFlightInitial: boolean;
    /** Reminders on only: the latest classic INITIAL reminder in a final state (SENT, FAILED_TERMINAL, CANCELLED), at its finalized time. */
    latestFinalInitialAt: Date | null;
    lastCountedAt: Date | null;
    now: Date;
}

/**
 * Whether an attempt counts as a new reminder cycle. Only a counted attempt can add a Pass or move the fail streak.
 * Nothing counts while a classic INITIAL reminder is in flight. With reminders on, a Pass also needs nothing counted yet,
 * or a reminder that reached a final state after the last count. With reminders off, counting is capped at one per 24 hours.
 */
export function countsAsAttempt(input: CountDecisionInput): boolean {
    if (input.hasInFlightInitial) {
        return false;
    }
    if (input.remindersOff) {
        return input.lastCountedAt === null || input.now.getTime() - input.lastCountedAt.getTime() >= PASS_RULES.countCooldownMs;
    }
    if (input.lastCountedAt === null) {
        return true;
    }

    return input.latestFinalInitialAt !== null && input.latestFinalInitialAt.getTime() > input.lastCountedAt.getTime();
}

/** Only counted attempts move the streak: a pass resets it, a failure adds one. */
export function nextFailStreak(current: number, counted: boolean, passed: boolean): number {
    if (!counted) {
        return current;
    }

    return passed ? 0 : current + 1;
}

export function isReminderPromptPending(trainer: Pick<VocabTrainer, 'mode' | 'reminderDisabled' | 'reminderFailStreak'>): boolean {
    return trainer.mode === TrainerMode.CLASSIC && !trainer.reminderDisabled && trainer.reminderFailStreak >= PASS_RULES.failStreakForPrompt;
}

export function hasReachedMaxRepeat(passes: number, maxRepeat: number): boolean {
    return passes >= maxRepeat;
}

/**
 * A retried AI job carries the submit time it was queued with. When the trainer already has that time, the attempt was applied.
 */
export function isAttemptApplied(trainer: Pick<VocabTrainer, 'lastExamSubmittedAt'>, submittedAt: Date): boolean {
    return trainer.lastExamSubmittedAt !== null && trainer.lastExamSubmittedAt.getTime() === submittedAt.getTime();
}

export interface ReminderSettingsInput {
    reminderSpacingDays?: number;
    reminderMaxRepeat?: number;
}

/** Checks the classic-only reminder settings. `existing` is the trainer being updated, when there is one. */
export function assertReminderSettings(input: ReminderSettingsInput, existing: { mode: TrainerMode; reminderRepeat?: number }): void {
    const { reminderSpacingDays, reminderMaxRepeat } = input;
    if (reminderSpacingDays === undefined && reminderMaxRepeat === undefined) {
        return;
    }
    if (existing.mode === TrainerMode.FSRS) {
        throw new VocabTrainerBadRequestException('Reminder spacing and max passes need mode CLASSIC');
    }
    if (reminderSpacingDays !== undefined && (reminderSpacingDays < PASS_RULES.spacingDays.min || reminderSpacingDays > PASS_RULES.spacingDays.max)) {
        throw new VocabTrainerBadRequestException(`Reminder spacing must be ${PASS_RULES.spacingDays.min} to ${PASS_RULES.spacingDays.max} days`);
    }
    if (reminderMaxRepeat === undefined) {
        return;
    }
    if (reminderMaxRepeat < PASS_RULES.maxRepeat.min || reminderMaxRepeat > PASS_RULES.maxRepeat.max) {
        throw new VocabTrainerBadRequestException(`Max passes must be ${PASS_RULES.maxRepeat.min} to ${PASS_RULES.maxRepeat.max}`);
    }
    if (existing.reminderRepeat !== undefined && reminderMaxRepeat < existing.reminderRepeat) {
        throw new VocabTrainerBadRequestException('Max passes cannot be below the passes already earned');
    }
}
