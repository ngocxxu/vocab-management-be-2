import { BullAdapter } from '@bull-board/api/bullAdapter';
import { BullBoardModule } from '@bull-board/nestjs';
import { BullModule } from '@nestjs/bull';
import { Module } from '@nestjs/common';

import { EReminderType } from '../reminder/utils';
import { ReminderModule } from '../reminder/reminder.module';
import { MailProvider } from './providers';
import { EmailProcessor } from './processors';
import { EmailService } from './services';

@Module({
    imports: [
        BullModule.registerQueue({
            name: EReminderType.EMAIL_REMINDER,
        }),
        BullBoardModule.forFeature({
            name: EReminderType.EMAIL_REMINDER,
            adapter: BullAdapter,
        }),
        ReminderModule,
    ],
    providers: [MailProvider, EmailService, EmailProcessor],
    exports: [],
})
export class EmailModule {}
