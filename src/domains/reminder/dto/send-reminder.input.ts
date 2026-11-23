import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsEnum, IsNotEmpty, IsObject, IsString, ValidateBy, ValidationArguments } from 'class-validator';
import { TemplateData } from '../../notification/email/utils/type';
import { EEmailTemplate, TEMPLATE_DATA_FIELDS } from '../utils';

// Longest text a template field may carry. Keeps one request from storing a huge email body.
const TEMPLATE_TEXT_MAX_LENGTH = 2000;

function isTemplateValue(value: unknown): boolean {
    if (typeof value === 'number') {
        return Number.isFinite(value);
    }

    return typeof value === 'string' && value.length <= TEMPLATE_TEXT_MAX_LENGTH;
}

/** `data` may only use the fields the chosen template reads. Each value must be a short string or a finite number. */
function IsTemplateData(): PropertyDecorator {
    return ValidateBy({
        name: 'isTemplateData',
        validator: {
            validate: (value: unknown, args: ValidationArguments): boolean => {
                const { templateName } = args.object as { templateName?: EEmailTemplate };
                const allowedFields = templateName ? TEMPLATE_DATA_FIELDS[templateName] : undefined;
                if (!allowedFields || typeof value !== 'object' || value === null || Array.isArray(value)) {
                    return false;
                }

                return Object.entries(value).every(([key, field]) => allowedFields.includes(key) && isTemplateValue(field));
            },
            defaultMessage: (args: ValidationArguments): string =>
                `data may only use the fields of template '${(args.object as { templateName?: string }).templateName}', with short string or number values`,
        },
    });
}

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
    @IsTemplateData()
    public readonly data: TemplateData;
}
