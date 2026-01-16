import { BullAdapter } from '@bull-board/api/bullAdapter';
import { BullBoardModule } from '@bull-board/nestjs';
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
        BullBoardModule.forFeature({
            name: EReminderType.EMAIL_REMINDER,
            adapter: BullAdapter,
        }),
        BullModule.registerQueue({
            name: EReminderType.NOTIFICATION,
        }),
        BullBoardModule.forFeature({
            name: EReminderType.NOTIFICATION,
            adapter: BullAdapter,
        }),
    ],
    controllers: [ReminderController],
    providers: [
        ReminderService
    ],
    exports: [ReminderService]
})
export class ReminderModule { }
