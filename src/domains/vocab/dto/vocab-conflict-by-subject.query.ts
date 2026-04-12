import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsString, IsOptional, IsInt, Min, IsIn } from 'class-validator';

export class VocabConflictBySubjectQuery {
    @ApiProperty({
        description: 'Subject ID to check conflicts for',
        example: 'cmcvuc64d00002dtxq5tkcl27',
    })
    @IsString()
    public readonly subjectId!: string;

    @ApiProperty({
        description: 'Page number',
        example: 1,
        required: false,
    })
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    public readonly page?: number;

    @ApiProperty({
        description: 'Number of items per page',
        example: 10,
        required: false,
    })
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    public readonly pageSize?: number;

    @ApiProperty({
        description: 'Sort by field',
        example: 'createdAt',
        required: false,
    })
    @IsOptional()
    @IsString()
    public readonly sortBy?: string;

    @ApiProperty({
        description: 'Sort order',
        example: 'desc',
        enum: ['asc', 'desc'],
        required: false,
    })
    @IsOptional()
    @IsIn(['asc', 'desc'])
    public readonly sortOrder?: 'asc' | 'desc';
}
