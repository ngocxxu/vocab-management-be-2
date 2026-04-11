import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsEnum, IsISO8601, IsNotEmpty, IsObject, IsString } from 'class-validator';
import { TemplateData } from '../../notification/email/utils/type';
import { EReminderTitle } from '../utils';

export class CreateNotificationReminderInput {
    @ApiProperty({ description: 'Recipient user IDs', example: ['1', '2'], required: true })
    @IsArray()
    @IsString({ each: true })
    public readonly recipientUserIds: string[];

    @ApiProperty({ description: 'Reminder type', example: EReminderTitle.VOCAB_TRAINER, required: true })
    @IsEnum(EReminderTitle)
    public readonly reminderType: EReminderTitle;

    @ApiProperty({ description: 'Data', example: { trainerName: 'Vocab Trainer 1', scorePercentage: 80 }, required: true })
    @IsObject()
    public readonly data: TemplateData;

    @ApiProperty({ description: 'Schedule time', example: '2025-01-01T00:00:00Z', required: true })
    @IsNotEmpty()
    @IsISO8601()
    public readonly scheduleTime: string;
}
