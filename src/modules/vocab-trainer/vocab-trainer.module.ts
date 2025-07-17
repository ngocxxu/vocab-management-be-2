import { Module } from '@nestjs/common';
import { CommonModule } from '../common';
import { ReminderModule } from '../reminder/reminder.module';
import { VocabTrainerController } from './controller';
import { VocabTrainerService } from './service';

@Module({
    imports: [CommonModule, ReminderModule],
    controllers: [VocabTrainerController],
    providers: [VocabTrainerService],
    exports: [VocabTrainerService],
})
export class VocabTrainerModule {}