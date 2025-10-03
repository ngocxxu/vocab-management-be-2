import { ApiProperty } from '@nestjs/swagger';
import { QueryParamsInput } from '../../common/model/query-params.input';

export class LanguageFolderParamsInput extends QueryParamsInput {
    @ApiProperty({
        description: 'Name of the language folder',
        example: 'My English Folder',
        required: false,
    })
    public readonly name: string;

    @ApiProperty({ description: 'Code of the source language', example: 'en', required: false })
    public readonly sourceLanguageCode: string;

    @ApiProperty({ description: 'Code of the target language', example: 'en', required: false })
    public readonly targetLanguageCode: string;
}
