import { ApiProperty } from '@nestjs/swagger';
import { TemplateData } from '../../email/util/type';
import { EEmailTemplate } from '../util';

export class SendReminderInput {
    @ApiProperty({ description: 'Email of the user', example: 'test@gmail.com', required: true })
    public readonly userEmail: string;

    @ApiProperty({ description: 'Reminder type', example: 'daily', required: true })
    public readonly reminderType: string;

    @ApiProperty({ description: 'Template name', example: EEmailTemplate.TEST_REMINDER, required: true })
    public readonly templateName: string;

    @ApiProperty({ description: 'Reminder data', example: { userName: 'John Doe', dueDate: '2025-01-01' }, required: true })
    public readonly data: TemplateData;
}