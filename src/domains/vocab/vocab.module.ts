import { Module, forwardRef } from '@nestjs/common';
import { AiModule } from '../ai';
import { PlanModule } from '../catalog/plan';
import { SubjectModule } from '../catalog/subject';
import { VocabController } from './controllers';
import { VocabTranslationProcessor } from './processors/vocab-translation.processor';
import { VocabMasteryRepository, VocabRelatedWordRepository, VocabRepository } from './repositories';
import { VocabMasteryService, VocabRelatedWordService, VocabService } from './services';

@Module({
    imports: [PlanModule, SubjectModule, forwardRef(() => AiModule)],
    controllers: [VocabController],
    providers: [VocabRepository, VocabMasteryRepository, VocabRelatedWordRepository, VocabService, VocabMasteryService, VocabRelatedWordService, VocabTranslationProcessor],
    exports: [VocabService, VocabMasteryService, VocabRelatedWordService, VocabRepository, VocabRelatedWordRepository],
})
export class VocabModule {}
