import { BullModule } from '@nestjs/bull';
import { Module, forwardRef } from '@nestjs/common';
import { AiModule } from '../ai';
import { PlanModule } from '../catalog/plan';
import { SubjectModule } from '../catalog/subject';
import { EventsModule } from '../platform/events/events.module';
import { EReminderType } from '../reminder/utils';
import { TextTargetController, VocabController } from './controllers';
import { VocabGenerateTextTargetProcessor } from './processors/vocab-generate-text-target.processor';
import { VocabTranslationProcessor } from './processors/vocab-translation.processor';
import { VocabMasteryRepository, VocabRelatedWordRepository, VocabRepository } from './repositories';
import { VocabMasteryService, VocabRelatedWordService, VocabService } from './services';
import { VocabTextTargetService } from './services/vocab-text-target.service';

@Module({
    imports: [PlanModule, SubjectModule, forwardRef(() => AiModule), EventsModule, BullModule.registerQueue({ name: EReminderType.VOCAB_GENERATE_TEXT_TARGET })],
    controllers: [VocabController, TextTargetController],
    providers: [
        VocabRepository,
        VocabMasteryRepository,
        VocabRelatedWordRepository,
        VocabService,
        VocabMasteryService,
        VocabRelatedWordService,
        VocabTextTargetService,
        VocabTranslationProcessor,
        VocabGenerateTextTargetProcessor,
    ],
    exports: [VocabService, VocabMasteryService, VocabRelatedWordService, VocabRepository, VocabRelatedWordRepository],
})
export class VocabModule {}
