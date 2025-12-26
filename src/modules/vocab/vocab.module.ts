import { Module, forwardRef } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { CommonModule } from '../common';
import { VocabController } from './controller';
import { VocabRepository, VocabMasteryRepository } from './repository';
import { VocabService, VocabMasteryService } from './service';

@Module({
    imports: [CommonModule, forwardRef(() => AiModule)],
    controllers: [VocabController],
    providers: [VocabRepository, VocabMasteryRepository, VocabService, VocabMasteryService],
    exports: [VocabService, VocabMasteryService],
})
export class VocabModule {}
