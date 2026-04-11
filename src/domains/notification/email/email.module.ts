import { Module, forwardRef } from '@nestjs/common';
import { ReminderModule } from '../../reminder';
import { MailProvider } from './providers';
import { EmailProcessor } from './processors';
import { EmailService } from './services';

@Module({
    imports: [forwardRef(() => ReminderModule)],
    providers: [MailProvider, EmailService, EmailProcessor],
    exports: [EmailService],
})
export class EmailModule {}
