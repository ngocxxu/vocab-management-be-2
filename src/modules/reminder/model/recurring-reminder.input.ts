import { ApiProperty } from '@nestjs/swagger';
import { SendReminderInput } from './send-reminder.input';

export class RecurringReminderInput extends SendReminderInput {
    @ApiProperty({ description: 'Cron pattern', example: '0 9 * * *', required: true })
    public readonly cronPattern: string;
}