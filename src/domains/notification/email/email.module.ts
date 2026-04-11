import { BullAdapter } from '@bull-board/api/bullAdapter';
import { BullBoardModule } from '@bull-board/nestjs';
import { BullModule } from '@nestjs/bull';
import { Module, forwardRef } from '@nestjs/common';

import { EReminderType } from '../../reminder/utils';
import { ReminderModule } from '../../reminder';
import { MailProvider } from './providers';
import { EmailProcessor } from './processors';
import { EmailService } from './services';

const emailReminderQueue = BullModule.registerQueue({
    name: EReminderType.EMAIL_REMINDER,
});

@Module({
    imports: [
        emailReminderQueue,
        BullBoardModule.forFeature({
            name: EReminderType.EMAIL_REMINDER,
            adapter: BullAdapter,
        }),
        forwardRef(() => ReminderModule),
    ],
    providers: [MailProvider, EmailService, EmailProcessor],
    exports: [emailReminderQueue],
})
export class EmailModule {}
