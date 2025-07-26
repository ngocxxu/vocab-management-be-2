import { ApiProperty } from '@nestjs/swagger';
import { TemplateData } from '../../email/util/type';
import { EEmailTemplate } from '../util';

export class SendReminderInput {
    @ApiProperty({ description: 'Email of the user', example: 'test@gmail.com', required: true })
    public readonly userEmail: string;

    @ApiProperty({ description: 'Reminder type', example: 'daily', required: true })
    public readonly reminderType: string;

    @ApiProperty({
        description: 'Template name',
        example: EEmailTemplate.EXAM_REMINDER,
        required: true,
    })
    public readonly templateName: string;

    @ApiProperty({
        description: 'Reminder data',
        example: {
            firstName: 'John',
            lastName: 'Doe',
            testName: 'Test 1',
            repeatDays: '1',
            examUrl: 'https://example.com/exam',
        },
        required: true,
    })
    public readonly data: TemplateData;
}
