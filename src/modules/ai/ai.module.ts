import { BullModule } from '@nestjs/bull';
import { Module } from '@nestjs/common';
import { CommonModule } from '../common';
import { ConfigModule } from '../config';
import { EventsModule } from '../event/module';
import { EReminderType } from '../reminder/util';
import { AiProcessor } from './processor/ai.processor';
import { AiService } from './service/ai.service';

@Module({
    imports: [
        CommonModule,
        ConfigModule,
        EventsModule,
        BullModule.registerQueue({
            name: EReminderType.AUDIO_EVALUATION,
        }),
    ],
    providers: [AiService, AiProcessor],
    exports: [AiService],
})
export class AiModule {}
