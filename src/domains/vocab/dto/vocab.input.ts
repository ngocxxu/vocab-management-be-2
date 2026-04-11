// eslint-disable-next-line max-classes-per-file
import { ApiProperty, PickType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsNotEmpty, IsOptional, IsString, ValidateNested } from 'class-validator';
import { VocabDto } from './vocab.dto';

export class CreateVocabExampleInput {
    @ApiProperty({ description: 'Source example text', example: 'Hello, how are you?' })
    @IsString()
    @IsNotEmpty()
    public source: string;

    @ApiProperty({ description: 'Target example text', example: 'Xin chào, bạn khỏe không?' })
    @IsString()
    @IsNotEmpty()
    public target: string;
}

export class VocabInput extends PickType(VocabDto, ['textSource', 'sourceLanguageCode', 'targetLanguageCode', 'languageFolderId'] as const) {
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
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => CreateTextTargetInput)
    public readonly textTargets: CreateTextTargetInput[];

    @ApiProperty({
        description: 'List of subject ids (used when textTargets is empty and AI translation is needed)',
        type: 'array',
        items: { type: 'string' },
        required: false,
    })
    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    public readonly subjectIds?: string[];
}

export class CreateTextTargetInput {
    @ApiProperty({ description: 'ID of the word type' })
    @IsOptional()
    @IsString()
    public wordTypeId?: string;

    @ApiProperty({ description: 'Target text (translation/definition)', example: 'Hello' })
    @IsString()
    @IsNotEmpty()
    public textTarget: string;

    @ApiProperty({ description: 'Grammar information', example: 'interjection' })
    @IsString()
    @IsNotEmpty()
    public grammar: string;

    @ApiProperty({ description: 'Explanation in source language' })
    @IsString()
    @IsNotEmpty()
    public explanationSource: string;

    @ApiProperty({ description: 'Explanation in target language' })
    @IsString()
    @IsNotEmpty()
    public explanationTarget: string;

    @ApiProperty({
        description: 'List of subject ids',
        type: 'array',
        items: { type: 'string' },
        required: false,
    })
    @IsArray()
    @IsString({ each: true })
    public readonly subjectIds: string[];

    @ApiProperty({
        description: 'List of vocabExamples for this text target',
        type: 'array',
        items: { type: 'object' },
        required: false,
    })
    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => CreateVocabExampleInput)
    public readonly vocabExamples?: CreateVocabExampleInput[];
}
