import { Module } from '@nestjs/common';
import { CommonModule } from '../common';
import { VocabTrainerController } from './controller';
import { VocabTrainerService } from './service';

@Module({
    imports: [CommonModule],
    controllers: [VocabTrainerController],
    providers: [VocabTrainerService],
    exports: [VocabTrainerService],
})
export class VocabTrainerModule {}