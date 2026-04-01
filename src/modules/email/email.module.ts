import { Module } from '@nestjs/common';

import { CommonModule } from '../common';
import { ReminderModule } from '../reminder/reminder.module';
import { EmailProcessor } from './processor';
import { EmailService } from './service';

@Module({
    imports: [CommonModule, ReminderModule],
    providers: [EmailService, EmailProcessor],
    exports: [],
})
export class EmailModule {}
