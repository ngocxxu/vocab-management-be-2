import { ApiProperty, PickType } from '@nestjs/swagger';
import { LanguageFolderDto } from './language-folder.dto';

export class LanguageFolderInput extends PickType(LanguageFolderDto, [
    'name',
    'folderColor',
    'sourceLanguageCode',
    'targetLanguageCode',
] as const) {
    @ApiProperty({
        description: 'Name of the language folder',
        example: 'My English Folder',
        maxLength: 100,
    })
    public readonly name: string;

    @ApiProperty({
        description: 'Color of the folder',
        example: '#FF5733',
        pattern: '^#[0-9A-Fa-f]{6}$',
    })
    public readonly folderColor: string;

    @ApiProperty({
        description: 'Source language code',
        example: 'en-US',
        pattern: '^[a-z]{2,3}(-[A-Z]{2})?$',
    })
    public readonly sourceLanguageCode: string;

    @ApiProperty({
        description: 'Target language code',
        example: 'es-ES',
        pattern: '^[a-z]{2,3}(-[A-Z]{2})?$',
    })
    public readonly targetLanguageCode: string;
}
