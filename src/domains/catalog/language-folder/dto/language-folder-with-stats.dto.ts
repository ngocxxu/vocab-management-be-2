import { ApiProperty } from '@nestjs/swagger';
import { type FolderStatus } from '../types/folder-status';
import { type FolderWithStatsRaw } from '../types/folder-with-stats.raw';

export class LanguageFolderWithStatsDto {
    @ApiProperty({ description: 'Unique identifier for the language folder' })
    public readonly id: string;

    @ApiProperty({ description: 'Name of the language folder', example: 'My English Folder' })
    public readonly name: string;

    @ApiProperty({ description: 'Color of the folder', example: '#FF5733' })
    public readonly folderColor: string;

    @ApiProperty({ description: 'Date when the folder was created' })
    public readonly createdAt: Date;

    @ApiProperty({ description: 'Date when the folder was last updated' })
    public readonly updatedAt: Date;

    @ApiProperty({ description: 'User ID who owns this folder' })
    public readonly userId: string;

    @ApiProperty({ description: 'Source language code', example: 'en-US' })
    public readonly sourceLanguageCode: string;

    @ApiProperty({ description: 'Target language code', example: 'es-ES' })
    public readonly targetLanguageCode: string;

    @ApiProperty({ description: 'Source language name', nullable: true, example: 'English' })
    public readonly sourceLanguageName: string | null;

    @ApiProperty({ description: 'Target language name', nullable: true, example: 'Vietnamese' })
    public readonly targetLanguageName: string | null;

    @ApiProperty({ description: 'Number of vocabs in this folder', example: 42, minimum: 0 })
    public readonly vocabCount: number;

    @ApiProperty({
        description: 'Average mastery score (same scale as masteryScore: 0..10). Null when vocabCount=0.',
        example: 3.5,
        nullable: true,
        minimum: 0,
        maximum: 10,
    })
    public readonly averageMastery: number | null;

    @ApiProperty({
        description: 'Derived from averageMastery and vocabCount (thresholds 0/4/8 on 0..10 scale).',
        enum: ['Unstarted', 'Beginner', 'Learning', 'Mastered'],
        example: 'Beginner',
    })
    public readonly status: FolderStatus;

    public constructor(raw: FolderWithStatsRaw, status: FolderStatus) {
        this.id = raw.id;
        this.name = raw.name;
        this.folderColor = raw.folderColor;
        this.createdAt = raw.createdAt;
        this.updatedAt = raw.updatedAt;
        this.userId = raw.userId;
        this.sourceLanguageCode = raw.sourceLanguageCode;
        this.targetLanguageCode = raw.targetLanguageCode;
        this.sourceLanguageName = raw.sourceLanguageName;
        this.targetLanguageName = raw.targetLanguageName;
        this.vocabCount = raw.vocabCount;
        this.averageMastery = raw.averageMastery;
        this.status = status;
    }
}
