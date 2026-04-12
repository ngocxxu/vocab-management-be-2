import { Module, forwardRef } from '@nestjs/common';
import { AiModule } from '../ai';
import { PlanModule } from '../catalog/plan';
import { SubjectModule } from '../catalog/subject';
import { VocabController } from './controllers';
import { VocabTranslationProcessor } from './processors/vocab-translation.processor';
import { VocabRepository, VocabMasteryRepository } from './repositories';
import { VocabService, VocabMasteryService } from './services';

@Module({
    imports: [PlanModule, SubjectModule, forwardRef(() => AiModule)],
    controllers: [VocabController],
    providers: [VocabRepository, VocabMasteryRepository, VocabService, VocabMasteryService, VocabTranslationProcessor],
    exports: [VocabService, VocabMasteryService, VocabRepository],
})
export class VocabModule {}
