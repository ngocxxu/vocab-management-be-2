import { BullAdapter } from '@bull-board/api/bullAdapter';
import { BullBoardModule } from '@bull-board/nestjs';
import { BullModule } from '@nestjs/bull';
import { Module, forwardRef } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { PlanModule } from '../plan/plan.module';
import { EReminderType } from '../reminder/utils';
import { VocabController } from './controllers';
import { VocabTranslationProcessor } from './processors/vocab-translation.processor';
import { VocabRepository, VocabMasteryRepository } from './repositories';
import { VocabService, VocabMasteryService } from './services';

@Module({
    imports: [
        PlanModule,
        forwardRef(() => AiModule),
        BullModule.registerQueue({
            name: EReminderType.VOCAB_TRANSLATION,
        }),
        BullBoardModule.forFeature({
            name: EReminderType.VOCAB_TRANSLATION,
            adapter: BullAdapter,
        }),
    ],
    controllers: [VocabController],
    providers: [
        VocabRepository,
        VocabMasteryRepository,
        VocabService,
        VocabMasteryService,
        VocabTranslationProcessor,
    ],
    exports: [VocabService, VocabMasteryService, VocabRepository],
})
export class VocabModule {}
