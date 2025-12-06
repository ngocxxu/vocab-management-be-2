import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { CommonModule } from '../common';
import { VocabController } from './controller';
import { VocabService, VocabMasteryService } from './service';

@Module({
    imports: [CommonModule, AiModule],
    controllers: [VocabController],
    providers: [VocabService, VocabMasteryService],
    exports: [VocabService, VocabMasteryService],
})
export class VocabModule {}
