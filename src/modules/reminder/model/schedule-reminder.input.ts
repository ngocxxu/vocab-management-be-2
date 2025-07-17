import { ApiProperty } from '@nestjs/swagger';
import { SendReminderInput } from './send-reminder.input';

export class ScheduleReminderInput extends SendReminderInput {
    @ApiProperty({ description: 'Schedule time', example: '2025-01-01T00:00:00Z', required: true })
    public readonly scheduleTime: string;
}