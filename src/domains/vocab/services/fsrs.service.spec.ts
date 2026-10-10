import { FsrsCardState, FsrsSettings } from '../types';
import { FsrsService } from './fsrs.service';

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const RATINGS = ['AGAIN', 'HARD', 'GOOD', 'EASY'] as const;

const DEFAULT_SETTINGS: FsrsSettings = {
    desiredRetention: 0.9,
    maximumInterval: 36500,
    newPerDay: null,
    directions: ['SOURCE_TO_TARGET', 'TARGET_TO_SOURCE'],
    endsAt: null,
};

const NOW = new Date('2026-10-03T08:00:00.000Z');

function daysFromNow(days: number, from: Date = NOW): Date {
    return new Date(from.getTime() + days * MS_PER_DAY);
}

function newCard(now: Date = NOW): FsrsCardState {
    return {
        state: 'NEW',
        due: now,
        stability: 0,
        difficulty: 0,
        reps: 0,
        lapses: 0,
        scheduledDays: 0,
        lastReviewedAt: null,
    };
}

describe('FsrsService', () => {
    const service = new FsrsService();

    // Builds a REVIEW card through the service itself (Easy on a NEW card), reviewed at NOW.
    function reviewCard(settings: FsrsSettings = DEFAULT_SETTINGS): FsrsCardState {
        return service.schedule(newCard(), 'EASY', NOW, settings).card;
    }

    describe('preview', () => {
        test('returns an outcome for each of the 4 ratings with non-decreasing due times (NEW card)', () => {
            // Arrange
            const card = newCard();

            // Act
            const preview = service.preview(card, NOW, DEFAULT_SETTINGS);

            // Assert
            const dues = RATINGS.map((rating) => preview[rating].card.due.getTime());
            expect(Object.keys(preview).sort()).toEqual([...RATINGS].sort());
            expect(dues).toEqual([...dues].sort((a, b) => a - b));
        });

        test('returns non-decreasing due times for a REVIEW card reviewed on its due date', () => {
            // Arrange
            const card = reviewCard();

            // Act
            const preview = service.preview(card, card.due, DEFAULT_SETTINGS);

            // Assert
            const dues = RATINGS.map((rating) => preview[rating].card.due.getTime());
            expect(dues).toEqual([...dues].sort((a, b) => a - b));
            expect(preview.EASY.card.scheduledDays).toBeGreaterThan(preview.GOOD.card.scheduledDays);
        });

        test('has no short-term steps: every outcome is a REVIEW card due at least a day later, and Again comes back after 1 day', () => {
            // Arrange
            const card = newCard();

            // Act
            const preview = service.preview(card, NOW, DEFAULT_SETTINGS);

            // Assert
            for (const rating of RATINGS) {
                expect(preview[rating].card.state).toBe('REVIEW');
                expect(preview[rating].card.due.getTime() - NOW.getTime()).toBeGreaterThanOrEqual(MS_PER_DAY);
            }
            expect(preview.AGAIN.card.due).toEqual(daysFromNow(1));
        });

        test('does not mutate the input card', () => {
            // Arrange
            const card = reviewCard();
            const snapshot = { ...card };

            // Act
            service.preview(card, card.due, DEFAULT_SETTINGS);

            // Assert
            expect(card).toEqual(snapshot);
        });

        test('is deterministic: the same inputs always give the same schedule (fuzz is seeded)', () => {
            // Arrange
            const card = reviewCard();

            // Act
            const first = service.preview(card, card.due, DEFAULT_SETTINGS);
            const second = service.preview(card, card.due, DEFAULT_SETTINGS);

            // Assert
            expect(second).toEqual(first);
        });
    });

    describe('schedule', () => {
        test('Again on a REVIEW card keeps it in REVIEW, lowers stability, adds a lapse and brings it back in 1 day', () => {
            // Arrange
            const card = reviewCard();

            // Act
            const { card: next, log } = service.schedule(card, 'AGAIN', card.due, DEFAULT_SETTINGS);

            // Assert
            expect(next.state).toBe('REVIEW');
            expect(next.lapses).toBe(card.lapses + 1);
            expect(next.stability).toBeLessThan(card.stability);
            expect(next.reps).toBe(card.reps + 1);
            expect(next.scheduledDays).toBe(1);
            expect(next.due).toEqual(daysFromNow(1, card.due));
            expect(next.lastReviewedAt).toEqual(card.due);
            expect(log.prevState).toBe('REVIEW');
            expect(log.stateAfter).toBe('REVIEW');
            expect(log.rating).toBe('AGAIN');
        });

        test('the first review turns a NEW card into a REVIEW card', () => {
            // Arrange
            const card = newCard();

            // Act
            const { card: next, log } = service.schedule(card, 'GOOD', NOW, DEFAULT_SETTINGS);

            // Assert
            expect(log.prevState).toBe('NEW');
            expect(next.state).toBe('REVIEW');
            expect(next.reps).toBe(1);
        });

        test('writes the outcome to the *After log values and keeps them equal to the new card', () => {
            // Arrange
            const card = reviewCard();

            // Act
            const { card: next, log } = service.schedule(card, 'GOOD', card.due, DEFAULT_SETTINGS);

            // Assert
            expect(log.dueAfter).toEqual(next.due);
            expect(log.stabilityAfter).toBe(next.stability);
            expect(log.difficultyAfter).toBe(next.difficulty);
            expect(log.scheduledDaysAfter).toBe(next.scheduledDays);
            expect(log.stateAfter).toBe(next.state);
        });

        test('elapsedDays is 0 on the first review and counts whole days since lastReviewedAt afterwards', () => {
            // Arrange
            const first = service.schedule(newCard(), 'GOOD', NOW, DEFAULT_SETTINGS);
            const threeAndHalfDaysLater = daysFromNow(3.5);

            // Act
            const second = service.schedule(first.card, 'GOOD', threeAndHalfDaysLater, DEFAULT_SETTINGS);

            // Assert
            expect(first.log.elapsedDays).toBe(0);
            expect(second.log.elapsedDays).toBe(3);
        });

        test('reviewing ahead uses the real time, not the due date: elapsedDays comes from lastReviewedAt', () => {
            // Arrange
            const card = reviewCard();
            const twoDaysBeforeDue = daysFromNow(-2, card.due);

            // Act
            const { card: next, log } = service.schedule(card, 'GOOD', twoDaysBeforeDue, DEFAULT_SETTINGS);

            // Assert
            expect(log.elapsedDays).toBe(Math.floor((twoDaysBeforeDue.getTime() - NOW.getTime()) / MS_PER_DAY));
            expect(next.lastReviewedAt).toEqual(twoDaysBeforeDue);
            expect(next.due.getTime()).toBeGreaterThan(twoDaysBeforeDue.getTime());
        });

        test('a lower desiredRetention gives a longer interval than a higher one', () => {
            // Arrange
            const card = reviewCard();
            const lowRetention = { ...DEFAULT_SETTINGS, desiredRetention: 0.8 };
            const highRetention = { ...DEFAULT_SETTINGS, desiredRetention: 0.95 };

            // Act
            const low = service.schedule(card, 'GOOD', card.due, lowRetention);
            const high = service.schedule(card, 'GOOD', card.due, highRetention);

            // Assert
            expect(low.card.scheduledDays).toBeGreaterThan(high.card.scheduledDays);
        });

        test('never schedules further than maximumInterval (ts-fsrs alone returned 7 days for a 5 day cap)', () => {
            // Arrange
            const settings = { ...DEFAULT_SETTINGS, maximumInterval: 5 };
            const card = reviewCard(settings);
            const reviewedAt = daysFromNow(9, card.due);

            // Act
            const preview = service.preview(card, reviewedAt, settings);

            // Assert
            for (const rating of RATINGS) {
                const { card: next } = preview[rating];
                expect(next.scheduledDays).toBeLessThanOrEqual(5);
                expect(next.due.getTime()).toBeLessThanOrEqual(reviewedAt.getTime() + 5 * MS_PER_DAY);
            }
            expect(preview.EASY.card.scheduledDays).toBe(5);
        });
    });

    describe('cycle deadline (endsAt)', () => {
        test('without a deadline the effective maximum interval is the configured one', () => {
            // Act
            const cap = service.effectiveMaximumInterval(DEFAULT_SETTINGS, NOW, 'card-1');

            // Assert
            expect(cap).toBe(36500);
        });

        test('with a deadline, cards are due 1 to 3 days before it', () => {
            // Arrange
            const settings = { ...DEFAULT_SETTINGS, endsAt: daysFromNow(30) };

            // Act
            const caps = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((seed) => service.effectiveMaximumInterval(settings, NOW, seed));

            // Assert
            for (const cap of caps) {
                expect(cap).toBeGreaterThanOrEqual(27);
                expect(cap).toBeLessThanOrEqual(29);
            }
        });

        test('the spread is deterministic per card and differs between cards, so reviews do not pile up on one day', () => {
            // Arrange
            const settings = { ...DEFAULT_SETTINGS, endsAt: daysFromNow(30) };
            const seeds = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];

            // Act
            const first = seeds.map((seed) => service.effectiveMaximumInterval(settings, NOW, seed));
            const second = seeds.map((seed) => service.effectiveMaximumInterval(settings, NOW, seed));

            // Assert
            expect(second).toEqual(first);
            expect(new Set(first).size).toBeGreaterThan(1);
        });

        test('the configured maximum interval still applies when it is shorter than the time left', () => {
            // Arrange
            const settings = { ...DEFAULT_SETTINGS, maximumInterval: 10, endsAt: daysFromNow(100) };

            // Act
            const cap = service.effectiveMaximumInterval(settings, NOW, 'card-1');

            // Assert
            expect(cap).toBe(10);
        });

        test('close to the deadline the cap never goes below 1 day', () => {
            // Arrange
            const settings = { ...DEFAULT_SETTINGS, endsAt: daysFromNow(2) };

            // Act
            const cap = service.effectiveMaximumInterval(settings, NOW, 'card-1');

            // Assert
            expect(cap).toBe(1);
        });

        test('schedule keeps a card that would be due after the deadline inside the cycle', () => {
            // Arrange
            const endsAt = daysFromNow(30);
            const settings = { ...DEFAULT_SETTINGS, endsAt };
            const card = reviewCard();

            // Act
            const { card: next } = service.schedule(card, 'EASY', card.due, settings, 'card-1');

            // Assert
            expect(next.scheduledDays).toBeLessThanOrEqual(29);
            expect(next.due.getTime()).toBeLessThan(endsAt.getTime());
        });

        test('isCycleEnded is true only once the deadline has passed', () => {
            // Assert
            expect(service.isCycleEnded({ endsAt: null }, NOW)).toBe(false);
            expect(service.isCycleEnded({ endsAt: daysFromNow(1) }, NOW)).toBe(false);
            expect(service.isCycleEnded({ endsAt: NOW }, NOW)).toBe(true);
            expect(service.isCycleEnded({ endsAt: daysFromNow(-1) }, NOW)).toBe(true);
        });
    });

    describe('retrievability', () => {
        test('is 0 for a NEW card', () => {
            // Act
            const retrievability = service.retrievability(newCard(), NOW);

            // Assert
            expect(retrievability).toBe(0);
        });

        test('is close to the default 90% on the due date and drops as time passes', () => {
            // Arrange
            const card = reviewCard();
            const tenDaysLater = daysFromNow(10, card.due);

            // Act
            const onDue = service.retrievability(card, card.due);
            const overdue = service.retrievability(card, tenDaysLater);

            // Assert
            expect(onDue).toBeGreaterThan(0.85);
            expect(onDue).toBeLessThan(0.95);
            expect(overdue).toBeLessThan(onDue);
        });
    });
});
