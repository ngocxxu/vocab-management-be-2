import { LanguageFolderDto } from '@/domains/catalog/language-folder/dto';
import { ApiProperty } from '@nestjs/swagger';
import { ApiKey, ApiKeyScope, LanguageFolder } from '@prisma/client';

export class ApiKeyDto {
    @ApiProperty({ description: 'Unique identifier for the API key' })
    public readonly id: string;

    @ApiProperty({ description: 'Display name for the API key', example: 'iOS Shortcut' })
    public readonly name: string;

    @ApiProperty({ description: 'Non-secret prefix of the key, for identifying it in a list', example: 'vk_9f8a2b1c' })
    public readonly keyPrefix: string;

    @ApiProperty({ description: 'Scopes granted to this key', enum: ApiKeyScope, isArray: true })
    public readonly scopes: ApiKeyScope[];

    @ApiProperty({ description: 'Language folder this key writes to (required when scope includes QUICK_ADD_VOCAB)', required: false })
    public readonly languageFolderId: string | null;

    @ApiProperty({ description: 'Language folder details', required: false, type: () => LanguageFolderDto })
    public readonly languageFolder?: LanguageFolderDto;

    @ApiProperty({ description: 'Date when the key was created' })
    public readonly createdAt: Date;

    @ApiProperty({ description: 'Date the key was last used to authenticate a request', required: false })
    public readonly lastUsedAt: Date | null;

    public constructor(entity: ApiKey & { languageFolder?: LanguageFolder | null }) {
        this.id = entity.id;
        this.name = entity.name;
        this.keyPrefix = entity.keyPrefix;
        this.scopes = entity.scopes;
        this.languageFolderId = entity.languageFolderId;
        this.languageFolder = entity.languageFolder ? new LanguageFolderDto(entity.languageFolder) : undefined;
        this.createdAt = entity.createdAt;
        this.lastUsedAt = entity.lastUsedAt;
    }
}
