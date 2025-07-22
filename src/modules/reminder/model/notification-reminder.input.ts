import { ApiProperty } from '@nestjs/swagger';
import { TemplateData } from '../../email/util/type';
import { EReminderTitle } from '../util';

export class CreateNotificationReminderInput {
    @ApiProperty({ description: 'Recipient user IDs', example: ['1', '2'], required: true })
    public readonly recipientUserIds: string[];

    @ApiProperty({ description: 'Reminder type', example: EReminderTitle, required: true })
    public readonly reminderType: EReminderTitle;

    @ApiProperty({ description: 'Data', example: { trainerName: 'Vocab Trainer 1', scorePercentage: 80 }, required: true })
    public readonly data: TemplateData;
}