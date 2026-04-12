import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsString, ValidateNested } from 'class-validator';
import { VocabUpdateInput } from './vocab-update.input';

export class BulkUpdateItemInput {
    @ApiProperty({
        description: 'Vocabulary ID to update',
        example: 'cmgg412zo0001uuyr8uc1ahvs',
    })
    @IsString()
    public readonly id!: string;

    @ApiProperty({
        description: 'Updated vocabulary data',
        type: VocabUpdateInput,
    })
    @ValidateNested()
    @Type(() => VocabUpdateInput)
    public readonly data!: VocabUpdateInput;
}

export class BulkUpdateInput {
    @ApiProperty({
        description: 'Array of vocabulary updates',
        type: 'array',
        items: { type: 'object' },
        example: [
            {
                id: 'cmgg412zo0001uuyr8uc1ahvs',
                data: {
                    textSource: 'hello',
                    sourceLanguageCode: 'en',
                    targetLanguageCode: 'vi',
                    languageFolderId: 'folder-1',
                    textTargets: [
                        {
                            textTarget: 'xin chào',
                            grammar: 'interjection',
                            explanationSource: 'greeting',
                            explanationTarget: 'lời chào',
                            subjectIds: ['subject-1'],
                        },
                    ],
                },
            },
        ],
    })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => BulkUpdateItemInput)
    public readonly updates!: BulkUpdateItemInput[];
}
