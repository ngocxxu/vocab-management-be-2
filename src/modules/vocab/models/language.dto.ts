import { ApiProperty } from '@nestjs/swagger';
import { Language } from '@prisma/client';

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

    public constructor(entity: Language) {
        this.id = entity.id;
        this.code = entity.code;
        this.name = entity.name;
        this.createdAt = entity.createdAt;
        this.updatedAt = entity.updatedAt;
    }
}
