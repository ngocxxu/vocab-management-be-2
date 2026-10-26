import { PublicVocabDto, VocabEntityWithDetails } from '../dto';

export class PublicVocabMapper {
    public toPublicList(rows: readonly VocabEntityWithDetails[]): PublicVocabDto[] {
        return rows.map((row) => new PublicVocabDto(row));
    }
}
