import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { CommonModule } from '../common';
import { ReminderModule } from '../reminder/reminder.module';
import { VocabTrainerController } from './controller';
import { VocabTrainerService } from './service';

@Module({
    imports: [CommonModule, ReminderModule, AiModule],
    controllers: [VocabTrainerController],
    providers: [VocabTrainerService],
    exports: [VocabTrainerService],
})
export class VocabTrainerModule {}
