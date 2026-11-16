import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Matches } from 'class-validator';
import { SendReminderInput } from './send-reminder.input';

const CRON_FIELD = '[0-9*/,-]+';
// Five fields. The minute must be one fixed number, so a repeat runs at most once an hour.
const RECURRING_CRON_PATTERN = new RegExp(`^([0-5]?[0-9]) ${CRON_FIELD} ${CRON_FIELD} ${CRON_FIELD} ${CRON_FIELD}$`);

export class RecurringReminderInput extends SendReminderInput {
    @ApiProperty({ description: 'Cron pattern. Five fields with one fixed minute (at most once an hour)', example: '0 9 * * *', required: true })
    @IsString()
    @IsNotEmpty()
    @Matches(RECURRING_CRON_PATTERN, { message: 'cronPattern must have five fields and one fixed minute (at most once an hour)' })
    public readonly cronPattern: string;
}
