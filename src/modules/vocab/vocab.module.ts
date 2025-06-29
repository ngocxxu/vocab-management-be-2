import { Module } from '@nestjs/common';
import { CommonModule } from '../common';
import { VocabController } from './controller';
import { VocabService } from './service';

@Module({
    imports: [CommonModule],
    controllers: [VocabController],
    providers: [VocabService],
    exports: [VocabService],
})
export class VocabModule {}
