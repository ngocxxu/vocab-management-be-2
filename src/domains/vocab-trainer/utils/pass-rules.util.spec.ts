import { TrainerMode } from '@prisma/client';
import { VocabTrainerBadRequestException } from '../exceptions';
import { assertReminderSettings, countsAsAttempt, hasReachedMaxRepeat, isAttemptApplied, isReminderPromptPending, nextFailStreak, PASS_RULES } from './pass-rules.util';

const NOW = new Date('2026-11-23T10:00:00.000Z');
const HOUR_MS = 60 * 60 * 1000;
const HOURS_AGO = (hours: number): Date => new Date(NOW.getTime() - hours * HOUR_MS);

describe('countsAsAttempt', () => {
    describe('with reminders on', () => {
        test('the first Pass of a trainer counts, without a reminder first', () => {
            // Arrange
            const input = { remindersOff: false, hasInFlightInitial: false, lastCountedAt: null, latestFinalInitialAt: null, now: NOW };

            // Act
            const counts = countsAsAttempt(input);

            // Assert
            expect(counts).toBe(true);
        });

        test('a repeat after a counted Pass does not count while no reminder has reached a final state', () => {
            // Arrange
            const input = { remindersOff: false, hasInFlightInitial: false, lastCountedAt: HOURS_AGO(1), latestFinalInitialAt: null, now: NOW };

            // Act
            const counts = countsAsAttempt(input);

            // Assert
            expect(counts).toBe(false);
        });

        test('a repeat does not count while the next reminder is pending and nothing reached a final state after the last count', () => {
            // Arrange
            const input = { remindersOff: false, hasInFlightInitial: true, lastCountedAt: HOURS_AGO(1), latestFinalInitialAt: HOURS_AGO(3), now: NOW };

            // Act
            const counts = countsAsAttempt(input);

            // Assert
            expect(counts).toBe(false);
        });

        test('a Pass counts once a reminder reached a final state after the last count', () => {
            // Arrange
            const input = { remindersOff: false, hasInFlightInitial: false, lastCountedAt: HOURS_AGO(2), latestFinalInitialAt: HOURS_AGO(1), now: NOW };

            // Act
            const counts = countsAsAttempt(input);

            // Assert
            expect(counts).toBe(true);
        });

        test('a final state at the same instant as the last count does not open the next Pass', () => {
            // Arrange: the reminder cancelled by the counted attempt itself is stamped with the attempt time
            const input = { remindersOff: false, hasInFlightInitial: false, lastCountedAt: NOW, latestFinalInitialAt: NOW, now: NOW };

            // Act
            const counts = countsAsAttempt(input);

            // Assert
            expect(counts).toBe(false);
        });

        test('a final state from before the last count does not open the next Pass', () => {
            // Arrange
            const input = { remindersOff: false, hasInFlightInitial: false, lastCountedAt: HOURS_AGO(1), latestFinalInitialAt: HOURS_AGO(2), now: NOW };

            // Act
            const counts = countsAsAttempt(input);

            // Assert
            expect(counts).toBe(false);
        });

        test('the 24 hour cap does not apply with reminders on', () => {
            // Arrange
            const input = { remindersOff: false, hasInFlightInitial: false, lastCountedAt: HOURS_AGO(1), latestFinalInitialAt: HOURS_AGO(0.5), now: NOW };

            // Act
            const counts = countsAsAttempt(input);

            // Assert
            expect(counts).toBe(true);
        });
    });

    describe('with reminders on, and a reminder in flight', () => {
        test('the first Pass is blocked while a reminder is in flight', () => {
            // Arrange
            const input = { remindersOff: false, hasInFlightInitial: true, lastCountedAt: null, latestFinalInitialAt: null, now: NOW };

            // Act
            const counts = countsAsAttempt(input);

            // Assert
            expect(counts).toBe(false);
        });

        test('a Pass is blocked while a reminder is SENDING, even when a final state came after the last count', () => {
            // Arrange
            const input = { remindersOff: false, hasInFlightInitial: true, lastCountedAt: HOURS_AGO(2), latestFinalInitialAt: HOURS_AGO(1), now: NOW };

            // Act
            const counts = countsAsAttempt(input);

            // Assert
            expect(counts).toBe(false);
        });
    });

    describe('with reminders off (unchanged)', () => {
        test('an attempt counts when nothing was counted before', () => {
            // Arrange
            const input = { remindersOff: true, hasInFlightInitial: false, lastCountedAt: null, latestFinalInitialAt: null, now: NOW };

            // Act
            const counts = countsAsAttempt(input);

            // Assert
            expect(counts).toBe(true);
        });

        test('an attempt while a classic reminder is in flight does not count', () => {
            // Arrange
            const input = { remindersOff: true, hasInFlightInitial: true, lastCountedAt: null, latestFinalInitialAt: null, now: NOW };

            // Act
            const counts = countsAsAttempt(input);

            // Assert
            expect(counts).toBe(false);
        });

        test('a second counted attempt within 24 hours does not count', () => {
            // Arrange
            const input = { remindersOff: true, hasInFlightInitial: false, lastCountedAt: HOURS_AGO(23), latestFinalInitialAt: null, now: NOW };

            // Act
            const counts = countsAsAttempt(input);

            // Assert
            expect(counts).toBe(false);
        });

        test('an attempt counts again once 24 hours have passed', () => {
            // Arrange
            const input = { remindersOff: true, hasInFlightInitial: false, lastCountedAt: HOURS_AGO(24), latestFinalInitialAt: null, now: NOW };

            // Act
            const counts = countsAsAttempt(input);

            // Assert
            expect(counts).toBe(true);
        });
    });
});

describe('nextFailStreak', () => {
    test('a counted failure adds one to the streak', () => {
        expect(nextFailStreak(1, true, false)).toBe(2);
    });

    test('a counted pass resets the streak', () => {
        expect(nextFailStreak(2, true, true)).toBe(0);
    });

    test('an attempt that does not count leaves the streak as it was', () => {
        expect(nextFailStreak(2, false, false)).toBe(2);
        expect(nextFailStreak(2, false, true)).toBe(2);
    });
});

describe('isReminderPromptPending', () => {
    const classic = { mode: TrainerMode.CLASSIC, reminderDisabled: false, reminderFailStreak: PASS_RULES.failStreakForPrompt };

    test('three failures in a row with reminders on raise the prompt', () => {
        expect(isReminderPromptPending(classic)).toBe(true);
    });

    test('two failures in a row do not raise the prompt', () => {
        expect(isReminderPromptPending({ ...classic, reminderFailStreak: 2 })).toBe(false);
    });

    test('no prompt when reminders are already off', () => {
        expect(isReminderPromptPending({ ...classic, reminderDisabled: true })).toBe(false);
    });

    test('no prompt for an FSRS trainer', () => {
        expect(isReminderPromptPending({ ...classic, mode: TrainerMode.FSRS })).toBe(false);
    });
});

describe('hasReachedMaxRepeat', () => {
    test('reaching T completes the trainer', () => {
        expect(hasReachedMaxRepeat(6, 6)).toBe(true);
    });

    test('one Pass below T does not complete it', () => {
        expect(hasReachedMaxRepeat(5, 6)).toBe(false);
    });
});

describe('isAttemptApplied', () => {
    test('a job whose submit time is already on the trainer is applied', () => {
        const submittedAt = new Date('2026-11-23T09:59:00.000Z');
        expect(isAttemptApplied({ lastExamSubmittedAt: submittedAt }, new Date(submittedAt))).toBe(true);
    });

    test('a different submit time is not applied yet', () => {
        expect(isAttemptApplied({ lastExamSubmittedAt: new Date('2026-11-23T09:00:00.000Z') }, NOW)).toBe(false);
    });

    test('a trainer that was never submitted is not applied', () => {
        expect(isAttemptApplied({ lastExamSubmittedAt: null }, NOW)).toBe(false);
    });
});

describe('assertReminderSettings', () => {
    const classic = { mode: TrainerMode.CLASSIC };

    test('accepts spacing 2 to 30 and max passes 3 to 20 on a classic trainer', () => {
        expect(() => assertReminderSettings({ reminderSpacingDays: 30, reminderMaxRepeat: 3 }, { ...classic, reminderRepeat: 0 })).not.toThrow();
        expect(() => assertReminderSettings({ reminderSpacingDays: 2, reminderMaxRepeat: 20 }, { ...classic, reminderRepeat: 0 })).not.toThrow();
    });

    test('rejects spacing outside 2 to 30', () => {
        expect(() => assertReminderSettings({ reminderSpacingDays: 1 }, classic)).toThrow(VocabTrainerBadRequestException);
        expect(() => assertReminderSettings({ reminderSpacingDays: 31 }, classic)).toThrow(VocabTrainerBadRequestException);
    });

    test('rejects max passes outside 3 to 20', () => {
        expect(() => assertReminderSettings({ reminderMaxRepeat: 2 }, classic)).toThrow(VocabTrainerBadRequestException);
        expect(() => assertReminderSettings({ reminderMaxRepeat: 21 }, classic)).toThrow(VocabTrainerBadRequestException);
    });

    test('rejects a max passes T below the passes already earned', () => {
        // Arrange
        const existing = { mode: TrainerMode.CLASSIC, reminderRepeat: 4 };

        // Act + Assert
        expect(() => assertReminderSettings({ reminderMaxRepeat: 3 }, existing)).toThrow(VocabTrainerBadRequestException);
        expect(() => assertReminderSettings({ reminderMaxRepeat: 4 }, existing)).not.toThrow();
    });

    test('rejects reminder settings on an FSRS trainer', () => {
        expect(() => assertReminderSettings({ reminderSpacingDays: 5 }, { mode: TrainerMode.FSRS })).toThrow(VocabTrainerBadRequestException);
    });

    test('an update without reminder settings is always allowed', () => {
        expect(() => assertReminderSettings({}, { mode: TrainerMode.FSRS })).not.toThrow();
    });
});
