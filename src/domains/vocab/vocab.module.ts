import { Module, forwardRef } from '@nestjs/common';
import { AiModule } from '../ai';
import { PlanModule } from '../catalog/plan';
import { SubjectModule } from '../catalog/subject';
import { TextTargetController, VocabController } from './controllers';
import { VocabTranslationProcessor } from './processors/vocab-translation.processor';
import { VocabMasteryRepository, VocabRelatedWordRepository, VocabRepository } from './repositories';
import { VocabMasteryService, VocabRelatedWordService, VocabService } from './services';
import { VocabTextTargetService } from './services/vocab-text-target.service';

@Module({
    imports: [PlanModule, SubjectModule, forwardRef(() => AiModule)],
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
    ],
    exports: [VocabService, VocabMasteryService, VocabRelatedWordService, VocabRepository, VocabRelatedWordRepository],
})
export class VocabModule {}
