import { QueryParamsInput } from '@/shared/dto/query-params.input';
import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsArray, IsOptional, IsString } from 'class-validator';

export class VocabQueryParamsInput extends QueryParamsInput {
    @ApiProperty({ description: 'Source text of the vocabulary', example: 'Xin chào', required: false })
    @IsOptional()
    @IsString()
    public readonly textSource: string;

    @ApiProperty({ description: 'Code of the source language', example: 'vi', required: false })
    @IsOptional()
    @IsString()
    public readonly sourceLanguageCode: string;

    @ApiProperty({ description: 'Code of the target language', example: 'en', required: false })
    @IsOptional()
    @IsString()
    public readonly targetLanguageCode: string;

    @ApiProperty({ description: 'Language folder id', example: 'string', required: false })
    @IsOptional()
    @IsString()
    public readonly languageFolderId: string;

    @ApiProperty({
        description: 'Subject ids (repeat subjectIds= for multiple, or a single value)',
        oneOf: [{ type: 'array', items: { type: 'string' } }, { type: 'string' }],
        required: false,
        example: ['cmjpsfjj10005jhb5hdwsl2je'],
    })
    @IsOptional()
    @Transform(({ value }: { value: string | string[] | undefined }) => {
        if (value === undefined || value === null) {
            return value;
        }
        if (Array.isArray(value)) {
            return value;
        }
        if (typeof value === 'string') {
            return value
                .split(',')
                .map((s) => s.trim())
                .filter(Boolean);
        }
        return value;
    })
    @IsArray()
    @IsString({ each: true })
    public readonly subjectIds?: string[];

    @ApiProperty({ description: 'User ID', example: 'string', required: false })
    @IsOptional()
    @IsString()
    public readonly userId: string;
}
