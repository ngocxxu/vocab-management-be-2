import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsEnum, IsNotEmpty, IsObject, IsString } from 'class-validator';
import { TemplateData } from '../../notification/email/utils/type';
import { EEmailTemplate } from '../utils';

export class SendReminderInput {
    @ApiProperty({ description: 'Email of the user', example: 'test@gmail.com', required: true })
    @IsEmail()
    @IsNotEmpty()
    public readonly userEmail: string;

    @ApiProperty({ description: 'Reminder type', example: 'daily', required: true })
    @IsString()
    @IsNotEmpty()
    public readonly reminderType: string;

    @ApiProperty({
        description: 'Template name',
        example: EEmailTemplate.EXAM_REMINDER,
        required: true,
    })
    @IsEnum(EEmailTemplate)
    public readonly templateName: EEmailTemplate;

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
    @IsObject()
    public readonly data: TemplateData;
}
