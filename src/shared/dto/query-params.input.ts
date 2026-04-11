import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class QueryParamsInput {
    @ApiProperty({ description: 'Page number', example: 1, required: false })
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    public page?: number = 1;

    @ApiProperty({ description: 'Page size', example: 10, required: false })
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(500)
    public pageSize?: number = 10;

    @ApiProperty({ description: 'Sort by', example: 'createdAt', required: false })
    @IsOptional()
    @IsString()
    public sortBy?: string;

    @ApiProperty({ description: 'Sort order', example: 'desc', required: false })
    @IsOptional()
    @IsIn(['asc', 'desc'])
    public sortOrder?: 'asc' | 'desc' = 'desc';
}
