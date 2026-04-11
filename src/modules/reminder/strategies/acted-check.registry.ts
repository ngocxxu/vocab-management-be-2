import { Injectable, OnModuleInit } from '@nestjs/common';
import { ActedCheckStrategy } from './acted-check.strategy';
import { VocabTrainerActedCheckStrategy } from './vocab-trainer-acted-check.strategy';

@Injectable()
export class ActedCheckRegistry implements OnModuleInit {
    private readonly strategies = new Map<string, ActedCheckStrategy>();

    public constructor(private readonly vocabTrainerActedCheck: VocabTrainerActedCheckStrategy) {}

    public onModuleInit(): void {
        this.register(this.vocabTrainerActedCheck);
    }

    public register(strategy: ActedCheckStrategy): void {
        this.strategies.set(strategy.entityType, strategy);
    }

    public async hasActedSince(
        entityType: string | null | undefined,
        entityId: string | null | undefined,
        since: Date,
    ): Promise<boolean> {
        if (!entityType || !entityId) {
            return false;
        }
        const strategy = this.strategies.get(entityType);
        if (!strategy) {
            return false;
        }
        return strategy.hasActedSince(entityId, since);
    }
}
