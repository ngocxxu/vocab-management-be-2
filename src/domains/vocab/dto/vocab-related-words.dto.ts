import { ApiProperty } from '@nestjs/swagger';
import { RelatedWordDto } from './related-word.dto';

export class VocabRelatedWordsDto {
    @ApiProperty({ type: () => [RelatedWordDto] })
    public readonly synonyms: RelatedWordDto[];

    @ApiProperty({ type: () => [RelatedWordDto] })
    public readonly antonyms: RelatedWordDto[];

    @ApiProperty({ type: () => [RelatedWordDto] })
    public readonly related: RelatedWordDto[];

    public constructor(data?: Partial<VocabRelatedWordsDto>) {
        this.synonyms = data?.synonyms ?? [];
        this.antonyms = data?.antonyms ?? [];
        this.related = data?.related ?? [];
    }
}
