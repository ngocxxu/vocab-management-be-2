import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class SubjectRefInput {
    @ApiPropertyOptional({ description: 'ID of an existing subject' })
    @IsOptional()
    @IsString()
    @IsNotEmpty()
    public readonly id?: string;

    @ApiPropertyOptional({ description: 'Name for a new subject (auto-created if it does not exist)', maxLength: 100 })
    @IsOptional()
    @IsString()
    @IsNotEmpty()
    @MaxLength(100)
    public readonly name?: string;
}
