// eslint-disable-next-line max-classes-per-file
import { ApiProperty } from '@nestjs/swagger';
import { Language, TextTarget, Vocab, VocabMastery } from '@prisma/client';
import { LanguageDto, TextTargetDto } from '.';

export class VocabDto {
    @ApiProperty({ description: 'Unique identifier for the vocabulary' })
    public id: string;

    @ApiProperty({ description: 'Source text of the vocabulary', example: 'Xin chào' })
    public readonly textSource: string;

    @ApiProperty({ description: 'Code of the source language', example: 'vi' })
    public readonly sourceLanguageCode: string;

    @ApiProperty({
        description: 'Source language details',
        required: false,
        type: () => LanguageDto,
    })
    public readonly sourceLanguage?: LanguageDto;

    @ApiProperty({ description: 'Code of the target language', example: 'en' })
    public readonly targetLanguageCode: string;

    @ApiProperty({
        description: 'Target language details',
        required: false,
        type: () => LanguageDto,
    })
    public readonly targetLanguage?: LanguageDto;

    @ApiProperty({ description: 'User ID', example: 'string' })
    public readonly userId: string;

    @ApiProperty({ description: 'Language folder id', example: 'string' })
    public readonly languageFolderId: string;

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

    @ApiProperty({
        description: 'Mastery score for this vocabulary',
        example: 5,
        required: false,
    })
    public readonly masteryScore?: number;

    public constructor(
        entity: Vocab & {
            sourceLanguage?: Language;
            targetLanguage?: Language;
            textTargets?: TextTarget[];
            vocabMasteries?: VocabMastery[];
        },
    ) {
        this.id = entity.id;
        this.textSource = entity.textSource;
        this.sourceLanguageCode = entity.sourceLanguageCode;
        this.targetLanguageCode = entity.targetLanguageCode;
        this.userId = entity.userId;
        this.languageFolderId = entity.languageFolderId;
        this.createdAt = entity.createdAt;
        this.updatedAt = entity.updatedAt;
        this.sourceLanguage = entity.sourceLanguage
            ? new LanguageDto(entity.sourceLanguage)
            : undefined;
        this.targetLanguage = entity.targetLanguage
            ? new LanguageDto(entity.targetLanguage)
            : undefined;
        this.textTargets = entity.textTargets?.map((target) => new TextTargetDto(target)) ?? [];
        this.masteryScore = entity.vocabMasteries?.[0]?.masteryScore;
    }
}
