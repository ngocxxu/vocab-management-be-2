import { BullAdapter } from '@bull-board/api/bullAdapter';
import { BullBoardModule } from '@bull-board/nestjs';
import { BullModule } from '@nestjs/bull';
import { Module, forwardRef } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { CommonModule } from '../common';
import { PlanModule } from '../plan/plan.module';
import { EReminderType } from '../reminder/util';
import { VocabController } from './controller';
import { VocabTranslationProcessor } from './processor/vocab-translation.processor';
import { VocabRepository, VocabMasteryRepository } from './repository';
import { VocabService, VocabMasteryService } from './service';

@Module({
    imports: [
        CommonModule,
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
