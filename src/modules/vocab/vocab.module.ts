import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { CommonModule } from '../common';
import { VocabController } from './controller';
import { VocabService } from './service';

@Module({
    imports: [CommonModule, AiModule],
    controllers: [VocabController],
    providers: [VocabService],
    exports: [VocabService],
})
export class VocabModule {}
