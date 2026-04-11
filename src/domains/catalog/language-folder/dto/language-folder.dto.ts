import { ApiProperty } from '@nestjs/swagger';
import { LanguageFolder } from '@prisma/client';

export class LanguageFolderDto {
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

    public constructor(entity: LanguageFolder) {
        this.id = entity.id;
        this.name = entity.name;
        this.folderColor = entity.folderColor;
        this.createdAt = entity.createdAt;
        this.updatedAt = entity.updatedAt;
        this.userId = entity.userId;
        this.sourceLanguageCode = entity.sourceLanguageCode;
        this.targetLanguageCode = entity.targetLanguageCode;
    }
}
