import { ApiProperty } from '@nestjs/swagger';
import { QueryParamsInput } from '../../common/model/query-params.input';

export class VocabQueryParamsInput extends QueryParamsInput {
    @ApiProperty({ description: 'Source text of the vocabulary', example: 'Hello' })
    public readonly textSource: string;

    @ApiProperty({ description: 'Code of the source language', example: 'vi' })
    public readonly sourceLanguageCode: string;

    @ApiProperty({ description: 'Code of the target language', example: 'en' })
    public readonly targetLanguageCode: string;

    @ApiProperty({
        description: 'List of subject ids',
        type: 'array',
        items: { type: 'string' },
        required: false,
        example: ['subjectId1', 'subjectId2']
    })
    public readonly subjectIds: string[];
}