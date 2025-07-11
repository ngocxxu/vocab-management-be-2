import { ApiProperty } from '@nestjs/swagger';
import { WordType } from '@prisma/client';
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

    public constructor(entity: WordType) {
        this.id = entity.id;
        this.name = entity.name;
        this.description = entity.description;
        this.createdAt = entity.createdAt;
        this.updatedAt = entity.updatedAt;
    }
}
