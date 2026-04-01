import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/provider';
import { ActedCheckStrategy } from './acted-check.strategy';

export const VOCAB_TRAINER_ENTITY = 'vocab_trainer';

@Injectable()
export class VocabTrainerActedCheckStrategy implements ActedCheckStrategy {
    public readonly entityType = VOCAB_TRAINER_ENTITY;

    public constructor(private readonly prisma: PrismaService) {}

    public async hasActedSince(entityId: string, since: Date): Promise<boolean> {
        const trainer = await this.prisma.vocabTrainer.findUnique({
            where: { id: entityId },
            select: { lastExamSubmittedAt: true },
        });

        if (!trainer) {
            return true;
        }

        if (!trainer.lastExamSubmittedAt) {
            return false;
        }

        return trainer.lastExamSubmittedAt > since;
    }
}
