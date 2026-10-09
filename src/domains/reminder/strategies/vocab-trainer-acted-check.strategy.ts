import { FsrsRepository } from '@/domains/vocab/repositories/fsrs.repository';
import { Injectable } from '@nestjs/common';
import { TrainerMode } from '@prisma/client';
import { VocabTrainerRepository } from '../../vocab-trainer/repositories';
import { ActedCheckStrategy } from './acted-check.strategy';

export const VOCAB_TRAINER_ENTITY = 'vocab_trainer';

@Injectable()
export class VocabTrainerActedCheckStrategy implements ActedCheckStrategy {
    public readonly entityType = VOCAB_TRAINER_ENTITY;

    public constructor(
        private readonly vocabTrainerRepository: VocabTrainerRepository,
        private readonly fsrsRepository: FsrsRepository,
    ) {}

    public async hasActedSince(entityId: string, since: Date): Promise<boolean> {
        const trainer = await this.vocabTrainerRepository.findLastExamSubmittedAt(entityId);

        if (!trainer) {
            return true;
        }

        // An FSRS trainer has no exam: the user acted when they reviewed a card.
        if (trainer.mode === TrainerMode.FSRS) {
            return this.fsrsRepository.hasReviewSince(entityId, since);
        }

        if (!trainer.lastExamSubmittedAt) {
            return false;
        }

        return trainer.lastExamSubmittedAt > since;
    }
}
