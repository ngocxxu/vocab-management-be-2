import { ApiProperty } from '@nestjs/swagger';
import { IsISO8601, IsNotEmpty } from 'class-validator';
import { SendReminderInput } from './send-reminder.input';

export class ScheduleReminderInput extends SendReminderInput {
    @ApiProperty({ description: 'Schedule time', example: '2025-01-01T00:00:00Z', required: true })
    @IsNotEmpty()
    @IsISO8601()
    public readonly scheduleTime: string;
}
