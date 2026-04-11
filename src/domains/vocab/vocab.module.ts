import { Module, forwardRef } from '@nestjs/common';
import { AiModule } from '../ai';
import { PlanModule } from '../catalog/plan';
import { VocabController } from './controllers';
import { VocabTranslationProcessor } from './processors/vocab-translation.processor';
import { VocabRepository, VocabMasteryRepository } from './repositories';
import { VocabService, VocabMasteryService } from './services';

@Module({
    imports: [
        PlanModule,
        forwardRef(() => AiModule),
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
