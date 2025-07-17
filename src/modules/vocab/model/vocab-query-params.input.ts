import { ApiProperty } from '@nestjs/swagger';
import { QueryParamsInput } from '../../common/model/query-params.input';

export class VocabQueryParamsInput extends QueryParamsInput {
    @ApiProperty({ description: 'Source text of the vocabulary', example: 'Xin chào', required: false })
    public readonly textSource: string;

    @ApiProperty({ description: 'Code of the source language', example: 'vi', required: false })
    public readonly sourceLanguageCode: string;

    @ApiProperty({ description: 'Code of the target language', example: 'en', required: false })
    public readonly targetLanguageCode: string;

    @ApiProperty({
        description: 'List of subject ids',
        type: 'array',
        items: { type: 'string' },
        required: false,
        example: ['Game']
    })
    public readonly subjectIds: string[];

    @ApiProperty({ description: 'User ID', example: 'string', required: false })
    public readonly userId: string;
}