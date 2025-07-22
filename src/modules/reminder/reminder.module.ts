import { BullModule } from '@nestjs/bull';
import { Module } from '@nestjs/common';

import { CommonModule } from '../common';
import { ReminderController } from './controller';
import { ReminderService } from './service';
import { EReminderType } from './util';

@Module({
    imports: [
        CommonModule,
        BullModule.registerQueue({
            name: EReminderType.EMAIL_REMINDER,
        }),
        BullModule.registerQueue({
            name: EReminderType.NOTIFICATION,
        }),
    ],
    controllers: [ReminderController],
    providers: [
        ReminderService
    ],
    exports: [ReminderService]
})
export class ReminderModule { }
