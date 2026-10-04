import { ConfigService } from '@/domains/platform/config/services/config.service';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { FsrsRating, TrainerMode, VocabTrainer } from '@prisma/client';
import { FsrsMapper } from '../mappers/fsrs.mapper';
import { FsrsCardWithWord, FsrsRepository } from '../repositories/fsrs.repository';
import { FsrsPreviewButton, FsrsReviewInput, FsrsReviewQueue, FsrsReviewQueueItem, FsrsReviewResult, FsrsReviewSummary, FsrsSettings } from '../types';
import { AnswerCheck, checkAnswer } from '../utils/fsrs-answer-check.util';
import { DEFAULT_SRS_TIMEZONE, endOfLocalDay, isValidTimezone, startOfLocalDay } from '../utils/fsrs-local-day.util';
import { FsrsReviewService } from './fsrs-review.service';
import { FsrsService } from './fsrs.service';

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const RATINGS: FsrsRating[] = ['AGAIN', 'HARD', 'GOOD', 'EASY'];

export const DEFAULT_SESSION_LIMIT = 20;
const TIMEZONE_CONFIG_KEY = 'srs.timezone';

// A card is mastered once its memory is stable for about 6 months and it was not forgotten in its last 3 reviews.
const MASTERED_MIN_STABILITY_DAYS = 180;
const MASTERED_LAPSE_WINDOW = 3;
const LEECH_MIN_LAPSES = 8;

type Backlog = { overdue: number; dueToday: number; newAvailable: number; newQuota: number };

/** Two cards of the same word next to each other give away each other's answer, so keep them apart when something else is left. */
function spaceSiblings<T extends { vocabId: string }>(cards: T[]): T[] {
    const remaining = [...cards];
    const spaced: T[] = [];
    while (remaining.length > 0) {
        const previous = spaced[spaced.length - 1];
        const index = remaining.findIndex((card) => card.vocabId !== previous?.vocabId);
        spaced.push(...remaining.splice(index === -1 ? 0 : index, 1));
    }

    return spaced;
}

/**
 * Everything the review screen needs: the fixed list of cards for one session, the counts around it, a summary, the check
 * of a typed answer and the recording of an answer for a card of the trainer. It reads cards and review logs only, never VocabMastery.
 */
@Injectable()
export class FsrsSessionService {
    private readonly fsrsMapper = new FsrsMapper();

    public constructor(
        private readonly fsrsRepository: FsrsRepository,
        private readonly fsrsService: FsrsService,
        private readonly fsrsReviewService: FsrsReviewService,
        private readonly configService: ConfigService,
    ) {}

    /** One fixed session list: due cards (lowest recall probability first), then new cards, `limit` cards at most. */
    public async getQueue(userId: string, trainerId: string, options: { limit?: number; ahead?: number } = {}, now: Date = new Date()): Promise<FsrsReviewQueue> {
        const trainer = await this.loadFsrsTrainer(userId, trainerId);
        const settings = this.fsrsMapper.toSettings(trainer);
        if (this.fsrsService.isCycleEnded(settings, now)) {
            return { ended: true, items: [], overdue: 0, dueToday: 0, newAvailable: 0, pendingAfterThisSession: 0 };
        }

        const limit = options.limit ?? DEFAULT_SESSION_LIMIT;
        const { start, end } = await this.localDay(userId, now);
        const dueBefore = new Date(end.getTime() + (options.ahead ?? 0) * MS_PER_DAY);
        const [dueCards, backlog] = await Promise.all([this.fsrsRepository.findDueReviewCards(trainerId, dueBefore), this.countBacklog(trainerId, settings, start, end)]);

        const dueSlots = Math.min(limit, dueCards.length);
        const newSlots = Math.min(backlog.newQuota, limit - dueSlots);
        const newCards = newSlots > 0 ? await this.fsrsRepository.findNewCards(trainerId, newSlots) : [];
        const cards = spaceSiblings([...this.lowestRecallFirst(dueCards, now).slice(0, dueSlots), ...newCards]);

        return {
            ended: false,
            items: cards.map((card) => this.toQueueItem(card, now, settings)),
            overdue: backlog.overdue,
            dueToday: backlog.dueToday,
            newAvailable: backlog.newAvailable,
            pendingAfterThisSession: Math.max(0, dueCards.length + backlog.newAvailable - cards.length),
        };
    }

    public async getSummary(userId: string, trainerId: string, now: Date = new Date()): Promise<FsrsReviewSummary> {
        const trainer = await this.loadFsrsTrainer(userId, trainerId);
        const settings = this.fsrsMapper.toSettings(trainer);
        const [mastered, leech] = await Promise.all([this.countMastered(trainerId), this.fsrsRepository.countLeeches(trainerId, LEECH_MIN_LAPSES)]);

        if (this.fsrsService.isCycleEnded(settings, now)) {
            return { overdue: 0, dueToday: 0, newAvailable: 0, mastered, leech, ended: true, endsAt: settings.endsAt, estimatedDaysToClearBacklog: 0 };
        }

        const { start, end } = await this.localDay(userId, now);
        const { overdue, dueToday, newAvailable } = await this.countBacklog(trainerId, settings, start, end);

        return {
            overdue,
            dueToday,
            newAvailable,
            mastered,
            leech,
            ended: false,
            endsAt: settings.endsAt,
            // One default session a day: a rough figure for the "you are N days behind" hint.
            estimatedDaysToClearBacklog: Math.ceil((overdue + dueToday) / DEFAULT_SESSION_LIMIT),
        };
    }

    /** Compares a typed answer with every accepted answer of the card. No AI: the same input always gives the same suggestion. */
    public async checkAnswer(userId: string, trainerId: string, input: { cardId: string; answer: string }): Promise<AnswerCheck> {
        const card = await this.loadCardOf(userId, trainerId, input.cardId);

        return checkAnswer(input.answer, this.sidesOf(card).acceptedAnswers);
    }

    /** Records the rating the user chose; the card must belong to this trainer. */
    public async recordAnswer(userId: string, trainerId: string, input: FsrsReviewInput, now: Date = new Date()): Promise<FsrsReviewResult> {
        await this.loadCardOf(userId, trainerId, input.cardId);

        return this.fsrsReviewService.recordReview(userId, input, now);
    }

    private async loadFsrsTrainer(userId: string, trainerId: string): Promise<VocabTrainer> {
        const trainer = await this.fsrsRepository.findTrainerOf(userId, trainerId);
        if (!trainer) {
            throw new NotFoundException(`Vocab trainer ${trainerId} not found`);
        }
        if (trainer.mode !== TrainerMode.FSRS) {
            throw new BadRequestException('This trainer is not an FSRS trainer');
        }

        return trainer;
    }

    private async loadCardOf(userId: string, trainerId: string, cardId: string): Promise<FsrsCardWithWord> {
        const card = await this.fsrsRepository.findCardWithWord(cardId);
        if (!card || card.userId !== userId || card.vocabTrainerId !== trainerId) {
            throw new NotFoundException(`FSRS card ${cardId} not found`);
        }

        return card;
    }

    private async localDay(userId: string, now: Date): Promise<{ start: Date; end: Date }> {
        const configured = await this.configService.getConfig(userId, TIMEZONE_CONFIG_KEY);
        const timeZone = typeof configured === 'string' && isValidTimezone(configured) ? configured : DEFAULT_SRS_TIMEZONE;

        return { start: startOfLocalDay(now, timeZone), end: endOfLocalDay(now, timeZone) };
    }

    private async countBacklog(trainerId: string, settings: FsrsSettings, dayStart: Date, dayEnd: Date): Promise<Backlog> {
        const [overdue, dueToday, newCards, introducedToday] = await Promise.all([
            this.fsrsRepository.countReviewDue(trainerId, { before: dayStart }),
            this.fsrsRepository.countReviewDue(trainerId, { from: dayStart, before: dayEnd }),
            this.fsrsRepository.countNewCards(trainerId),
            this.fsrsRepository.countIntroducedSince(trainerId, dayStart),
        ]);
        // What was not introduced today is not added to tomorrow's quota.
        const newQuota = settings.newPerDay === null ? Number.POSITIVE_INFINITY : Math.max(0, settings.newPerDay - introducedToday);

        return { overdue, dueToday, newAvailable: Math.min(newCards, newQuota), newQuota };
    }

    private async countMastered(trainerId: string): Promise<number> {
        const stable = await this.fsrsRepository.findStableCards(trainerId, MASTERED_MIN_STABILITY_DAYS);
        const lapsed = await Promise.all(stable.map(async (card) => this.fsrsRepository.hasRecentLapse(trainerId, card.vocabId, card.direction, MASTERED_LAPSE_WINDOW)));

        return lapsed.filter((hasLapse) => !hasLapse).length;
    }

    private lowestRecallFirst(cards: FsrsCardWithWord[], now: Date): FsrsCardWithWord[] {
        return cards
            .map((card) => ({ card, recall: this.fsrsService.retrievability(this.fsrsMapper.toCardState(card), now) }))
            .sort((a, b) => a.recall - b.recall || a.card.id.localeCompare(b.card.id))
            .map(({ card }) => card);
    }

    /** The direction decides which side is the question and which side is accepted as the answer. */
    private sidesOf(card: FsrsCardWithWord): Pick<FsrsReviewQueueItem, 'frontText' | 'acceptedAnswers' | 'frontLanguageCode' | 'backLanguageCode'> {
        const vocab = card.trainerWord.vocab;
        const translations = vocab.textTargets.map((target) => target.textTarget);

        if (card.direction === 'SOURCE_TO_TARGET') {
            return { frontText: [vocab.textSource], acceptedAnswers: translations, frontLanguageCode: vocab.sourceLanguageCode, backLanguageCode: vocab.targetLanguageCode };
        }

        return { frontText: translations, acceptedAnswers: [vocab.textSource], frontLanguageCode: vocab.targetLanguageCode, backLanguageCode: vocab.sourceLanguageCode };
    }

    private toQueueItem(card: FsrsCardWithWord, now: Date, settings: FsrsSettings): FsrsReviewQueueItem {
        const outcomes = this.fsrsService.preview(this.fsrsMapper.toCardState(card), now, settings, this.fsrsService.cardSeed(card));
        const preview = Object.fromEntries(RATINGS.map((rating) => [rating, { due: outcomes[rating].card.due, scheduledDays: outcomes[rating].card.scheduledDays }])) as Record<
            FsrsRating,
            FsrsPreviewButton
        >;

        return { cardId: card.id, vocabId: card.vocabId, direction: card.direction, state: card.state, isNew: card.state === 'NEW', ...this.sidesOf(card), preview };
    }
}
