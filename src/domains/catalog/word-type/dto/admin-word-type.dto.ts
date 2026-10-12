import { ApiProperty } from '@nestjs/swagger';

/** A word type as the admin catalog shows it: the public fields plus how many text targets use it. */
export class AdminWordTypeDto {
    @ApiProperty({ description: 'Unique identifier for the word type' })
    public id: string;

    @ApiProperty({ description: 'Name of the word type', example: 'Noun' })
    public name: string;

    @ApiProperty({ description: 'Description of the word type' })
    public description: string;

    @ApiProperty({ description: 'Text targets tagged with this word type', example: 12, minimum: 0 })
    public textTargetCount: number;

    @ApiProperty({ description: 'Date when the word type was created' })
    public createdAt: Date;

    @ApiProperty({ description: 'Date when the word type was last updated' })
    public updatedAt: Date;
}
