import { QueryParamsInput } from '@/shared/dto/query-params.input';
import { ApiProperty } from '@nestjs/swagger';

export class VocabQueryParamsInput extends QueryParamsInput {
    @ApiProperty({ description: 'Source text of the vocabulary', example: 'Xin chào', required: false })
    public readonly textSource: string;

    @ApiProperty({ description: 'Code of the source language', example: 'vi', required: false })
    public readonly sourceLanguageCode: string;

    @ApiProperty({ description: 'Code of the target language', example: 'en', required: false })
    public readonly targetLanguageCode: string;

    @ApiProperty({ description: 'Language folder id', example: 'string', required: false })
    public readonly languageFolderId: string;

    @ApiProperty({
        description: 'Subject ids (repeat subjectIds= for multiple, or a single value)',
        oneOf: [{ type: 'array', items: { type: 'string' } }, { type: 'string' }],
        required: false,
        example: ['cmjpsfjj10005jhb5hdwsl2je'],
    })
    public readonly subjectIds?: string | string[];

    @ApiProperty({ description: 'User ID', example: 'string', required: false })
    public readonly userId: string;
}
