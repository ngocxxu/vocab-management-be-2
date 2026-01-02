import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { CommonModule } from '../common';
import { LanguageModule } from '../language/language.module';
import { NotificationModule } from '../notification/notification.module';
import { ReminderModule } from '../reminder/reminder.module';
import { VocabModule } from '../vocab/vocab.module';
import { VocabTrainerController } from './controller';
import { VocabTrainerRepository } from './repository';
import { VocabTrainerService } from './service';

@Module({
    imports: [
        CommonModule,
        ReminderModule,
        AiModule,
        LanguageModule,
        NotificationModule,
        VocabModule,
    ],
    controllers: [VocabTrainerController],
    providers: [VocabTrainerRepository, VocabTrainerService],
    exports: [VocabTrainerService],
})
export class VocabTrainerModule {}
