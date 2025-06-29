// eslint-disable-next-line max-classes-per-file
import { ApiProperty } from '@nestjs/swagger';

export class VocabDto {
    @ApiProperty({ description: 'Unique identifier for the vocabulary' })
    public id: string;

    @ApiProperty({ description: 'Source text of the vocabulary', example: 'Hello' })
    public readonly textSource: string;

    @ApiProperty({ description: 'ID of the source language' })
    public readonly sourceLanguageId: string;

    @ApiProperty({ description: 'Source language details', required: false })
    public readonly sourceLanguage?: LanguageDto;

    @ApiProperty({ description: 'ID of the target language' })
    public readonly targetLanguageId: string;

    @ApiProperty({ description: 'Target language details', required: false })
    public readonly targetLanguage?: LanguageDto;

    @ApiProperty({ description: 'Date when the vocabulary was created' })
    public readonly createdAt: Date;

    @ApiProperty({ description: 'Date when the vocabulary was last updated' })
    public readonly updatedAt: Date;

    @ApiProperty({
        description: 'List of text targets (translations/definitions) for this vocabulary',
        type: 'array',
        items: { type: 'object' },
        required: false,
    })
    public readonly textTargets: TextTargetDto[];

    // @ApiProperty({
    //     description: 'List of trainer assignments for this vocabulary',
    //     type: 'array',
    //     items: { type: 'object' },
    //     required: false,
    // })
    // public readonly trainerAssignments?: VocabTrainerWordDto[];
}

// DTO for Language
export class LanguageDto {
    @ApiProperty({ description: 'Unique identifier for the language' })
    public id: string;

    @ApiProperty({ description: 'Language code', example: 'en' })
    public code: string;

    @ApiProperty({ description: 'Language name', example: 'English' })
    public name: string;

    @ApiProperty({ description: 'Date when the language was created' })
    public readonly createdAt: Date;

    @ApiProperty({ description: 'Date when the language was last updated' })
    public readonly updatedAt: Date;
}

// DTO for VocabTrainerWord relation
export class VocabTrainerWordDto {
    @ApiProperty({ description: 'Unique identifier for the trainer-word assignment' })
    public id: string;

    @ApiProperty({ description: 'ID of the vocabulary trainer' })
    public vocabTrainerId: string;

    @ApiProperty({ description: 'ID of the vocabulary' })
    public vocabId: string;

    @ApiProperty({ description: 'Date when the assignment was created' })
    public readonly createdAt: Date;

    @ApiProperty({ description: 'Date when the assignment was last updated' })
    public readonly updatedAt: Date;

    @ApiProperty({
        description: 'Vocabulary trainer details',
        required: false,
    })
    public readonly vocabTrainer?: VocabTrainerDto;
}

// DTO for TextTarget relation
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
}

// DTO hỗ trợ khác
export class VocabTrainerDto {
    @ApiProperty({ description: 'Unique identifier for the vocabulary trainer' })
    public id: string;

    @ApiProperty({ description: 'Name of the trainer', example: 'Daily English Practice' })
    public name: string;

    @ApiProperty({
        description: 'Current status of the trainer',
        enum: ['PENDING', 'IN_PROCESS', 'COMPLETED', 'CANCELLED', 'FAILED', 'PASSED'],
    })
    public status: string;

    @ApiProperty({ description: 'Duration in minutes', example: 30 })
    public duration: number;

    @ApiProperty({ description: 'Current count time', example: 0 })
    public countTime: number;

    @ApiProperty({ description: 'Set count time', example: 0 })
    public setCountTime: number;

    @ApiProperty({ description: 'Whether reminder is disabled', example: false })
    public reminderDisabled: boolean;

    @ApiProperty({ description: 'Reminder repeat count', example: 2 })
    public reminderRepeat: number;

    @ApiProperty({ description: 'Last reminder date' })
    public reminderLastRemind: Date;

    @ApiProperty({ description: 'Date when the trainer was created' })
    public readonly createdAt: Date;

    @ApiProperty({ description: 'Date when the trainer was last updated' })
    public readonly updatedAt: Date;
}

export class WordTypeDto {
    @ApiProperty({ description: 'Unique identifier for the word type' })
    public id: string;

    @ApiProperty({ description: 'Name of the word type', example: 'noun' })
    public name: string;

    @ApiProperty({ description: 'Description of the word type' })
    public description: string;

    @ApiProperty({ description: 'Date when the word type was created' })
    public readonly createdAt: Date;

    @ApiProperty({ description: 'Date when the word type was last updated' })
    public readonly updatedAt: Date;
}

export class VocabExampleDto {
    @ApiProperty({ description: 'Unique identifier for the example' })
    public id: string;

    @ApiProperty({ description: 'ID of the text target' })
    public textTargetId: string;

    @ApiProperty({ description: 'Source example text', example: 'Hello, how are you?' })
    public source: string;

    @ApiProperty({ description: 'Target example text', example: 'Xin chào, bạn khỏe không?' })
    public target: string;

    @ApiProperty({ description: 'Date when the example was created' })
    public readonly createdAt: Date;

    @ApiProperty({ description: 'Date when the example was last updated' })
    public readonly updatedAt: Date;
}

export class TextTargetSubjectDto {
    @ApiProperty({ description: 'Unique identifier for the subject assignment' })
    public id: string;

    @ApiProperty({ description: 'ID of the text target' })
    public textTargetId: string;

    @ApiProperty({ description: 'ID of the subject' })
    public subjectId: string;

    @ApiProperty({ description: 'Date when the assignment was created' })
    public readonly createdAt: Date;

    @ApiProperty({ description: 'Date when the assignment was last updated' })
    public readonly updatedAt: Date;

    @ApiProperty({
        description: 'Subject details',
        required: false,
    })
    public readonly subject?: SubjectDto;
}

export class SubjectDto {
    @ApiProperty({ description: 'Unique identifier for the subject' })
    public id: string;

    @ApiProperty({ description: 'Name of the subject', example: 'Greetings' })
    public name: string;

    @ApiProperty({ description: 'Display order', example: 1 })
    public order: number;

    @ApiProperty({ description: 'Date when the subject was created' })
    public readonly createdAt: Date;

    @ApiProperty({ description: 'Date when the subject was last updated' })
    public readonly updatedAt: Date;
}
