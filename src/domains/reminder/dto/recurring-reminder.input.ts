import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';
import { SendReminderInput } from './send-reminder.input';

export class RecurringReminderInput extends SendReminderInput {
    @ApiProperty({ description: 'Cron pattern', example: '0 9 * * *', required: true })
    @IsString()
    @IsNotEmpty()
    public readonly cronPattern: string;
}
