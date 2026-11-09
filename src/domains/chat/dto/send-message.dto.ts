import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { CHAT_LOCALE_MAX_LENGTH, CHAT_MAX_MESSAGE_LENGTH } from '../constants';

export class SendMessageDto {
    @ApiProperty({ description: 'User message content', maxLength: CHAT_MAX_MESSAGE_LENGTH })
    @IsString()
    @IsNotEmpty()
    @MaxLength(CHAT_MAX_MESSAGE_LENGTH)
    public readonly message: string;

    @ApiProperty({ description: 'UI language of the user (en or vi). Unknown values fall back to en.', required: false, example: 'vi' })
    @IsOptional()
    @IsString()
    @MaxLength(CHAT_LOCALE_MAX_LENGTH)
    public readonly locale?: string;
}
