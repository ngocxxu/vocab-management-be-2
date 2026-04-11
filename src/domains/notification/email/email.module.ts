import { Module, forwardRef } from '@nestjs/common';
import { ReminderModule } from '../../reminder';
import { EmailProcessor } from './processors';
import { MailProvider } from './providers';
import { EmailService } from './services';

@Module({
    imports: [forwardRef(() => ReminderModule)],
    providers: [MailProvider, EmailService, EmailProcessor],
    exports: [EmailService],
})
export class EmailModule {}
