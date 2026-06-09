import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RelatedWordDto {
    @ApiProperty({ description: 'Unique identifier for the relation row' })
    public readonly id: string;

    @ApiPropertyOptional({ description: 'Linked vocab identifier when the relation points to another vocab' })
    public readonly linkedVocabId?: string;

    @ApiPropertyOptional({ description: 'Free-text value when the relation is not linked to a vocab yet' })
    public readonly freeText?: string;

    @ApiProperty({ description: 'Display word for the related entry' })
    public readonly word: string;

    @ApiProperty({ description: 'Whether the relation is a synonym' })
    public readonly isSynonym: boolean;

    @ApiProperty({ description: 'Whether the relation is an antonym' })
    public readonly isAntonym: boolean;

    @ApiProperty({ description: 'Whether the relation is related' })
    public readonly isRelated: boolean;

    public constructor(entity: { id: string; linkedVocabId?: string; freeText?: string; word: string; isSynonym: boolean; isAntonym: boolean; isRelated: boolean }) {
        this.id = entity.id;
        this.linkedVocabId = entity.linkedVocabId;
        this.freeText = entity.freeText;
        this.word = entity.word;
        this.isSynonym = entity.isSynonym;
        this.isAntonym = entity.isAntonym;
        this.isRelated = entity.isRelated;
    }
}
