import { ApiProperty } from '@nestjs/swagger';

/** A language as the admin catalog shows it: the public fields plus how many rows use it. */
export class AdminLanguageDto {
    @ApiProperty({ description: 'Unique identifier for the language' })
    public id: string;

    @ApiProperty({ description: 'Language code in ISO format', example: 'en-US' })
    public code: string;

    @ApiProperty({ description: 'Display name of the language', example: 'English (United States)' })
    public name: string;

    @ApiProperty({ description: 'Vocabs that use this language as source or target', example: 42, minimum: 0 })
    public vocabCount: number;

    @ApiProperty({ description: 'Language folders that use this language as source or target', example: 3, minimum: 0 })
    public folderCount: number;

    @ApiProperty({ description: 'Date when the language was created' })
    public createdAt: Date;

    @ApiProperty({ description: 'Date when the language was last updated' })
    public updatedAt: Date;
}
