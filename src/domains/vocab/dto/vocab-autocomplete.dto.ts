import { ApiProperty } from '@nestjs/swagger';

export class VocabAutocompleteDto {
    @ApiProperty({ description: 'Unique vocab identifier' })
    public readonly id: string;

    @ApiProperty({ description: 'Source text for the vocab' })
    public readonly sourceText: string;

    @ApiProperty({ description: 'Language folder that owns the vocab. Differs from the source folder for cross-folder matches' })
    public readonly languageFolderId: string;

    @ApiProperty({ description: 'Name of the language folder that owns the vocab' })
    public readonly languageFolderName: string;

    public constructor(entity: { id: string; sourceText: string; languageFolderId: string; languageFolderName: string }) {
        this.id = entity.id;
        this.sourceText = entity.sourceText;
        this.languageFolderId = entity.languageFolderId;
        this.languageFolderName = entity.languageFolderName;
    }
}
