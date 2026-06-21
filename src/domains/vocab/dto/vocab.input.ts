// eslint-disable-next-line max-classes-per-file
import { ApiProperty, ApiPropertyOptional, PickType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsNotEmpty, IsOptional, IsString, ValidateNested } from 'class-validator';
import { SubjectRefInput } from './subject-ref.input';
import { CreateRelatedWordInput } from './upsert-related-words.input';
import { VocabDto } from './vocab.dto';

export class CreateVocabExampleInput {
    @ApiProperty({ description: 'Source example text', example: 'Hello, how are you?' })
    @IsString()
    public source: string;

    @ApiProperty({ description: 'Target example text', example: 'Xin chào, bạn khỏe không?' })
    @IsString()
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

    @ApiPropertyOptional({
        description: 'Subject references (used when textTargets is empty and AI translation is needed)',
        type: () => [SubjectRefInput],
    })
    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => SubjectRefInput)
    public readonly subjects?: SubjectRefInput[];

    @ApiPropertyOptional({
        description: 'Optional initial related words created atomically with the vocab. If any related word is invalid, the vocab is not created.',
        type: () => [CreateRelatedWordInput],
    })
    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => CreateRelatedWordInput)
    public readonly relatedWords?: CreateRelatedWordInput[];
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
    public grammar: string;

    @ApiProperty({ description: 'Explanation in source language' })
    @IsString()
    public explanationSource: string;

    @ApiProperty({ description: 'Explanation in target language' })
    @IsString()
    public explanationTarget: string;

    @ApiPropertyOptional({
        description: 'Subject references (by id for existing, by name for auto-create)',
        type: () => [SubjectRefInput],
    })
    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => SubjectRefInput)
    public readonly subjects?: SubjectRefInput[];

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
