// eslint-disable-next-line max-classes-per-file
import { ApiProperty, PickType } from '@nestjs/swagger';
import { VocabDto, VocabExampleDto } from './vocab.data';

export class VocabInput extends PickType(VocabDto, [
    'textSource',
    'sourceLanguageId',
    'targetLanguageId',
] as const) {
    @ApiProperty({
        description: 'List of text targets for this vocabulary',
        type: 'array',
        items: { type: 'object' },
    })
    public readonly textTargets: CreateTextTargetInput[];
}

export class CreateTextTargetInput {
    @ApiProperty({ description: 'ID of the word type' })
    public wordTypeId: string;

    @ApiProperty({ description: 'Target text (translation/definition)', example: 'Hello' })
    public textTarget: string;

    @ApiProperty({ description: 'Grammar information', example: 'interjection' })
    public grammar: string;

    @ApiProperty({ description: 'Explanation in source language' })
    public explanationSource: string;

    @ApiProperty({ description: 'Explanation in target language' })
    public explanationTarget: string;

    @ApiProperty({
        description: 'List of subject ids',
        type: 'array',
        items: { type: 'string' },
        required: false,
    })
    public readonly subjectIds: string[];

    @ApiProperty({
        description: 'List of examples for this text target',
        type: 'array',
        items: { type: 'object' },
        required: false,
    })
    public readonly examples?: VocabExampleDto[];
}
