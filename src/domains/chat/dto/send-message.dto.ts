import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { CHAT_MAX_MESSAGE_LENGTH } from '../constants';

export class SendMessageDto {
    @ApiProperty({ description: 'User message content', maxLength: CHAT_MAX_MESSAGE_LENGTH })
    @IsString()
    @IsNotEmpty()
    @MaxLength(CHAT_MAX_MESSAGE_LENGTH)
    public readonly content: string;
}
