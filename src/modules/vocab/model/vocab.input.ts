// eslint-disable-next-line max-classes-per-file
import { ApiProperty, PickType } from '@nestjs/swagger';
import { VocabExampleDto } from './vocab-example.dto';
import { VocabDto } from './vocab.dto';

export class VocabInput extends PickType(VocabDto, [
    'textSource',
    'sourceLanguageCode',
    'targetLanguageCode',
] as const) {
    @ApiProperty({
        description: 'List of text targets for this vocabulary',
        type: 'array',
        items: { type: 'object' },
        example: [
            {
                wordTypeId: 'cmcw657mf0000hczy22gs0lmg',
                textTarget: 'Hello',
                grammar: 'interjection',
                explanationSource: 'Lời chào thân thiện',
                explanationTarget: 'A friendly greeting',
                subjectIds: ['cmcvuc64d00002dtxq5tkcl27'],
                vocabExamples: [
                    {
                        source: 'Xin chào bạn!',
                        target: 'Hello friend!',
                    },
                ],
            },
        ],
    })
    public readonly textTargets: CreateTextTargetInput[];

    @ApiProperty({
        description: 'User ID',
        example: 'string',
    })
    public readonly userId: string;
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
        description: 'List of vocabExamples for this text target',
        type: 'array',
        items: { type: 'object' },
        required: false,
    })
    public readonly vocabExamples?: VocabExampleDto[];
}
