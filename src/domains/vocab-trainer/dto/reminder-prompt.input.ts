import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class ReminderPromptInput {
    @ApiProperty({ description: 'true keeps reminders on; false turns them off', example: true })
    @IsBoolean()
    public continueReminders: boolean;
}
