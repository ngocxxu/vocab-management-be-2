import { ApiProperty } from '@nestjs/swagger';

export class VocabAutocompleteDto {
    @ApiProperty({ description: 'Unique vocab identifier' })
    public readonly id: string;

    @ApiProperty({ description: 'Source text for the vocab' })
    public readonly sourceText: string;

    public constructor(entity: { id: string; sourceText: string }) {
        this.id = entity.id;
        this.sourceText = entity.sourceText;
    }
}
