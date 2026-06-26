import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsISO8601, IsOptional, Max, Min } from 'class-validator';
import { CHAT_HISTORY_DEFAULT_LIMIT, CHAT_HISTORY_MAX_LIMIT } from '../constants';

export class QueryMessagesDto {
    @ApiPropertyOptional({ description: 'ISO timestamp cursor — returns messages older than this' })
    @IsOptional()
    @IsISO8601()
    public readonly cursor?: string;

    @ApiPropertyOptional({ description: 'Number of messages to return', default: CHAT_HISTORY_DEFAULT_LIMIT, minimum: 1, maximum: CHAT_HISTORY_MAX_LIMIT })
    @IsOptional()
    @IsInt()
    @Min(1)
    @Max(CHAT_HISTORY_MAX_LIMIT)
    @Type(() => Number)
    public readonly limit?: number;
}
