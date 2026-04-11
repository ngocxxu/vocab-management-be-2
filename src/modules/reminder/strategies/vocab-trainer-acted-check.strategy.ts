import { Injectable } from '@nestjs/common';
import { VocabTrainerRepository } from '../../vocab-trainer/repositories';
import { ActedCheckStrategy } from './acted-check.strategy';

export const VOCAB_TRAINER_ENTITY = 'vocab_trainer';

@Injectable()
export class VocabTrainerActedCheckStrategy implements ActedCheckStrategy {
    public readonly entityType = VOCAB_TRAINER_ENTITY;

    public constructor(private readonly vocabTrainerRepository: VocabTrainerRepository) {}

    public async hasActedSince(entityId: string, since: Date): Promise<boolean> {
        const trainer = await this.vocabTrainerRepository.findLastExamSubmittedAt(entityId);

        if (!trainer) {
            return true;
        }

        if (!trainer.lastExamSubmittedAt) {
            return false;
        }

        return trainer.lastExamSubmittedAt > since;
    }
}
