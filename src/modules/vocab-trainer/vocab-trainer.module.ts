import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { CommonModule } from '../common';
import { NotificationModule } from '../notification/notification.module';
import { ReminderModule } from '../reminder/reminder.module';
import { VocabTrainerController } from './controller';
import { VocabTrainerService } from './service';

@Module({
    imports: [CommonModule, ReminderModule, AiModule, NotificationModule],
    controllers: [VocabTrainerController],
    providers: [VocabTrainerService],
    exports: [VocabTrainerService],
})
export class VocabTrainerModule {}
