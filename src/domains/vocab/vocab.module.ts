import { BullModule } from '@nestjs/bull';
import { Module, forwardRef } from '@nestjs/common';
import { AiModule } from '../ai';
import { LanguageFolderModule } from '../catalog/language-folder';
import { PlanModule } from '../catalog/plan';
import { SubjectModule } from '../catalog/subject';
import { ApiKeyModule } from '../identity/api-key';
import { EventsModule } from '../platform/events/events.module';
import { EReminderType } from '../reminder/utils';
import { TextTargetController, VocabController } from './controllers';
import { CdcWebhookController } from './controllers/cdc-webhook.controller';
import { VocabGenerateTextTargetProcessor } from './processors/vocab-generate-text-target.processor';
import { VocabTranslationProcessor } from './processors/vocab-translation.processor';
import { VocabEmbeddingRepository, VocabMasteryRepository, VocabRelatedWordRepository, VocabRepository } from './repositories';
import { VocabMasteryService, VocabRelatedWordService, VocabService } from './services';
import { QdrantService } from './services/qdrant.service';
import { VocabEmbeddingWorkerService } from './services/vocab-embedding-worker.service';
import { VocabTextTargetService } from './services/vocab-text-target.service';

@Module({
    imports: [
        PlanModule,
        forwardRef(() => SubjectModule),
        forwardRef(() => AiModule),
        forwardRef(() => LanguageFolderModule),
        ApiKeyModule,
        EventsModule,
        BullModule.registerQueue({ name: EReminderType.VOCAB_GENERATE_TEXT_TARGET }),
    ],
    controllers: [VocabController, TextTargetController, CdcWebhookController],
    providers: [
        VocabRepository,
        VocabMasteryRepository,
        VocabRelatedWordRepository,
        VocabEmbeddingRepository,
        VocabService,
        VocabMasteryService,
        VocabRelatedWordService,
        VocabTextTargetService,
        VocabTranslationProcessor,
        VocabGenerateTextTargetProcessor,
        QdrantService,
        VocabEmbeddingWorkerService,
    ],
    exports: [VocabService, VocabMasteryService, VocabRelatedWordService, VocabRepository, VocabRelatedWordRepository],
})
export class VocabModule {}
