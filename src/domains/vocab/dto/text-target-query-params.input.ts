import { QueryParamsInput } from '@/shared/dto/query-params.input';
import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class TextTargetQueryParamsInput extends QueryParamsInput {
    @ApiProperty({ description: 'Filter by text target value (partial match)', example: 'hello', required: false })
    @IsOptional()
    @IsString()
    public readonly textTarget?: string;

    @ApiProperty({ description: 'Filter by grammar value (partial match)', example: 'noun', required: false })
    @IsOptional()
    @IsString()
    public readonly grammar?: string;

    @ApiProperty({ description: 'Filter by word type ID', required: false })
    @IsOptional()
    @IsString()
    public readonly wordTypeId?: string;
}
