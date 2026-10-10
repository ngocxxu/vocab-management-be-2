import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { VocabFsrsCard, VocabFsrsReviewLog } from '@prisma/client';
import { FsrsMapper } from '../mappers/fsrs.mapper';
import { FsrsRepository } from '../repositories/fsrs.repository';
import { FsrsReviewInput, FsrsReviewResult } from '../types';
import { FsrsService } from './fsrs.service';

/**
 * Records one answer to an FSRS card: one card update and one log row, atomically, and only once per `answerId`.
 * It never touches VocabMastery / masteryScore: Classic and FSRS statistics stay separate.
 */
@Injectable()
export class FsrsReviewService {
    private readonly fsrsMapper = new FsrsMapper();

    public constructor(
        private readonly fsrsRepository: FsrsRepository,
        private readonly fsrsService: FsrsService,
    ) {}

    /** `now` is the server time of the review; it is a parameter only so tests can move the clock. */
    public async recordReview(userId: string, input: FsrsReviewInput, now: Date = new Date()): Promise<FsrsReviewResult> {
        return this.fsrsRepository.inTransaction(async (tx) => {
            const card = await this.fsrsRepository.lockCard(tx, input.cardId);
            if (!card || card.userId !== userId) {
                throw new NotFoundException(`FSRS card ${input.cardId} not found`);
            }

            // The lock above serializes requests for one card, so a repeat always sees the log of the first one.
            const previous = await this.fsrsRepository.findLogByAnswerId(tx, input.answerId);
            if (previous) {
                return this.toDuplicateResult(card, previous);
            }

            const trainer = await this.fsrsRepository.findTrainer(tx, card.vocabTrainerId);
            if (!trainer) {
                throw new NotFoundException(`Vocab trainer ${card.vocabTrainerId} not found`);
            }

            const settings = this.fsrsMapper.toSettings(trainer);
            if (this.fsrsService.isCycleEnded(settings, now)) {
                throw new ConflictException('CycleEnded');
            }

            const { card: next, log } = this.fsrsService.schedule(this.fsrsMapper.toCardState(card), input.rating, now, settings, this.fsrsService.cardSeed(card));

            await this.fsrsRepository.createLog(tx, {
                ...log,
                answerId: input.answerId,
                userId,
                vocabId: card.vocabId,
                vocabTrainerId: card.vocabTrainerId,
                direction: card.direction,
                desiredRetentionAtReview: settings.desiredRetention,
                durationMs: input.durationMs,
                questionType: input.questionType,
                isAhead: now.getTime() < card.due.getTime(),
                reviewedAt: now,
            });
            await this.fsrsRepository.updateCard(tx, card.id, next);

            return {
                cardId: card.id,
                rating: input.rating,
                state: next.state,
                due: next.due,
                stability: next.stability,
                difficulty: next.difficulty,
                scheduledDays: next.scheduledDays,
                isDuplicate: false,
            };
        });
    }

    private toDuplicateResult(card: VocabFsrsCard, log: VocabFsrsReviewLog): FsrsReviewResult {
        const isSameCard = log.vocabTrainerId === card.vocabTrainerId && log.vocabId === card.vocabId && log.direction === card.direction;
        if (!isSameCard) {
            throw new ConflictException('AnswerIdReused');
        }

        return {
            cardId: card.id,
            rating: log.rating,
            state: log.stateAfter,
            due: log.dueAfter,
            stability: log.stabilityAfter,
            difficulty: log.difficultyAfter,
            scheduledDays: log.scheduledDaysAfter,
            isDuplicate: true,
        };
    }
}
