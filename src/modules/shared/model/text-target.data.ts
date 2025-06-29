import { ApiProperty } from '@nestjs/swagger';
import { TextTarget, VocabExample, WordType } from '@prisma/client';
import { VocabExampleDto, WordTypeDto } from '.';
import { TextTargetSubjectDto } from '.';

export class TextTargetDto {
    @ApiProperty({ description: 'Unique identifier for the text target' })
    public id: string;

    @ApiProperty({ description: 'ID of the vocabulary' })
    public vocabId: string;

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

    @ApiProperty({ description: 'Date when the text target was created' })
    public readonly createdAt: Date;

    @ApiProperty({ description: 'Date when the text target was last updated' })
    public readonly updatedAt: Date;

    @ApiProperty({
        description: 'Word type details',
        required: false,
    })
    public readonly wordType?: WordTypeDto;

    @ApiProperty({
        description: 'List of examples for this text target',
        type: 'array',
        items: { type: 'object' },
        required: false,
    })
    public readonly examples?: VocabExampleDto[];

    @ApiProperty({
        description: 'List of subject assignments',
        type: 'array',
        items: { type: 'object' },
        required: false,
    })
    public readonly subjectAssignments?: TextTargetSubjectDto[];

    public constructor(
        entity: TextTarget & {
            wordType?: WordType;
            examples?: VocabExample[];
            subjectAssignments?: TextTargetSubjectDto[];
        },
    ) {
        this.id = entity.id;
        this.vocabId = entity.vocabId;
        this.wordTypeId = entity.wordTypeId;
        this.textTarget = entity.textTarget;
        this.grammar = entity.grammar;
        this.explanationSource = entity.explanationSource;
        this.explanationTarget = entity.explanationTarget;
        this.createdAt = entity.createdAt;
        this.updatedAt = entity.updatedAt;
        this.wordType = entity.wordType ? new WordTypeDto(entity.wordType) : undefined;
        this.examples = entity.examples?.map((example) => new VocabExampleDto(example)) ?? [];
        this.subjectAssignments =
            entity.subjectAssignments?.map((assignment) => new TextTargetSubjectDto(assignment)) ??
            [];
    }
}
