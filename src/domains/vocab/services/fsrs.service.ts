import { Injectable } from '@nestjs/common';
import type { FsrsRating, FsrsState } from '@prisma/client';
import { Card, FSRS, fsrs, generatorParameters, Grade, Rating, State } from 'ts-fsrs';
import { FsrsCardState, FsrsPreview, FsrsReviewOutcome, FsrsSettings } from '../types';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// With a cycle deadline, cards are scheduled to come back 1 to 3 days before it. The spread depends on the card, so the
// last reviews do not pile up on one day.
const DEADLINE_BUFFER_DAYS = 1;
const DEADLINE_SPREAD_DAYS = 3;

const RATINGS: FsrsRating[] = ['AGAIN', 'HARD', 'GOOD', 'EASY'];

const RATING_TO_LIB: Record<FsrsRating, Grade> = {
    AGAIN: Rating.Again,
    HARD: Rating.Hard,
    GOOD: Rating.Good,
    EASY: Rating.Easy,
};

const STATE_TO_LIB: Record<FsrsState, State> = {
    NEW: State.New,
    REVIEW: State.Review,
};

type SchedulerSettings = Pick<FsrsSettings, 'desiredRetention' | 'maximumInterval' | 'endsAt'>;

const HASH_MULTIPLIER = 31;
const HASH_MODULUS = 2_147_483_647;

// A small stable hash, so the same card always gets the same spread.
function stableHash(value: string): number {
    let hash = 7;
    for (const char of value) {
        hash = (hash * HASH_MULTIPLIER + (char.codePointAt(0) ?? 0)) % HASH_MODULUS;
    }

    return hash;
}

/**
 * Pure wrapper around ts-fsrs. No I/O: callers pass the card, the time and the trainer settings, and persist the result.
 * Nothing outside this file imports ts-fsrs, so the library (or its version) can be swapped in one place.
 *
 * Short-term learning steps are disabled: every review, including a failed one, schedules the card on a day-based
 * interval, so a card is only ever NEW or REVIEW.
 */
@Injectable()
export class FsrsService {
    // Only used for retrievability, which depends on the default FSRS weights and not on trainer settings.
    private readonly defaultScheduler: FSRS = fsrs(generatorParameters());

    /** What each rating button would do right now, without changing anything. `seed` identifies the card (see effectiveMaximumInterval). */
    public preview(card: FsrsCardState, now: Date, settings: SchedulerSettings, seed: string = ''): FsrsPreview {
        const records = this.createScheduler(settings).repeat(this.toLibCard(card, now), now);

        return Object.fromEntries(RATINGS.map((rating) => [rating, this.toOutcome(card, rating, now, settings, seed, records[RATING_TO_LIB[rating]].card)])) as FsrsPreview;
    }

    /** Applies one rating. `now` must be the real review time (also when reviewing ahead), never the due date. */
    public schedule(card: FsrsCardState, rating: FsrsRating, now: Date, settings: SchedulerSettings, seed: string = ''): FsrsReviewOutcome {
        const { card: next } = this.createScheduler(settings).next(this.toLibCard(card, now), now, RATING_TO_LIB[rating]);

        return this.toOutcome(card, rating, now, settings, seed, next);
    }

    /** Probability (0-1) that the word is recalled at `now`. 0 for a NEW card. Used to order the review queue. */
    public retrievability(card: FsrsCardState, now: Date): number {
        return this.defaultScheduler.get_retrievability(this.toLibCard(card, now), now, false);
    }

    /**
     * Longest interval, in days, that may be scheduled at `now`. Without a deadline it is the configured maximum.
     * With a deadline it shrinks as the deadline gets closer so every card is seen again before it, and `seed`
     * (a stable id of the card) spreads the cards over 3 days. Never below 1 day.
     */
    public effectiveMaximumInterval(settings: Pick<FsrsSettings, 'maximumInterval' | 'endsAt'>, now: Date, seed: string): number {
        if (!settings.endsAt) {
            return settings.maximumInterval;
        }

        const daysLeft = Math.floor((settings.endsAt.getTime() - now.getTime()) / MS_PER_DAY);
        const spread = stableHash(seed) % DEADLINE_SPREAD_DAYS;
        const untilDeadline = Math.max(1, daysLeft - DEADLINE_BUFFER_DAYS - spread);

        return Math.min(settings.maximumInterval, untilDeadline);
    }

    /** The stable id of a card that `preview` / `schedule` take as `seed`: the same card always gets the same deadline spread. */
    public cardSeed(card: { vocabTrainerId: string; vocabId: string; direction: string }): string {
        return `${card.vocabTrainerId}:${card.vocabId}:${card.direction}`;
    }

    /** True once the deadline of the cycle has passed. A trainer without a deadline never ends. */
    public isCycleEnded(settings: Pick<FsrsSettings, 'endsAt'>, now: Date): boolean {
        return settings.endsAt !== null && settings.endsAt.getTime() <= now.getTime();
    }

    private createScheduler(settings: Pick<FsrsSettings, 'desiredRetention' | 'maximumInterval'>): FSRS {
        return fsrs(
            generatorParameters({
                request_retention: settings.desiredRetention,
                maximum_interval: settings.maximumInterval,
                enable_short_term: false,
                enable_fuzz: true,
            }),
        );
    }

    private toOutcome(previous: FsrsCardState, rating: FsrsRating, now: Date, settings: SchedulerSettings, seed: string, next: Card): FsrsReviewOutcome {
        const { due, scheduledDays } = this.capInterval(next, now, this.effectiveMaximumInterval(settings, now, seed));
        const card: FsrsCardState = {
            state: this.fromLibState(next.state),
            due,
            stability: next.stability,
            difficulty: next.difficulty,
            reps: next.reps,
            lapses: next.lapses,
            scheduledDays,
            lastReviewedAt: now,
        };

        return {
            card,
            log: {
                rating,
                prevState: previous.state,
                elapsedDays: this.elapsedDays(previous, now),
                stateAfter: card.state,
                dueAfter: card.due,
                stabilityAfter: card.stability,
                difficultyAfter: card.difficulty,
                scheduledDaysAfter: card.scheduledDays,
            },
        };
    }

    // ts-fsrs 5.4.2 can return an interval above maximum_interval (observed: 7 days for a 5 day cap on an overdue card
    // with fuzz on), and it knows nothing about the cycle deadline, so the cap is enforced here.
    private capInterval(next: Card, now: Date, maximumInterval: number): { due: Date; scheduledDays: number } {
        if (next.scheduled_days <= maximumInterval) {
            return { due: next.due, scheduledDays: next.scheduled_days };
        }

        return { due: new Date(now.getTime() + maximumInterval * MS_PER_DAY), scheduledDays: maximumInterval };
    }

    private elapsedDays(card: FsrsCardState, now: Date): number {
        if (!card.lastReviewedAt) {
            return 0;
        }

        return Math.max(0, Math.floor((now.getTime() - card.lastReviewedAt.getTime()) / MS_PER_DAY));
    }

    // Learning and relearning only exist when short-term steps are enabled, so seeing one means the configuration changed.
    private fromLibState(state: State): FsrsState {
        if (state === State.New) {
            return 'NEW';
        }
        if (state === State.Review) {
            return 'REVIEW';
        }

        throw new Error(`Unexpected ts-fsrs state ${State[state]}: short-term learning steps are disabled`);
    }

    private toLibCard(card: FsrsCardState, now: Date): Card {
        return {
            due: card.due,
            stability: card.stability,
            difficulty: card.difficulty,
            elapsed_days: this.elapsedDays(card, now),
            scheduled_days: card.scheduledDays,
            learning_steps: 0,
            reps: card.reps,
            lapses: card.lapses,
            state: STATE_TO_LIB[card.state],
            last_review: card.lastReviewedAt ?? undefined,
        };
    }
}
