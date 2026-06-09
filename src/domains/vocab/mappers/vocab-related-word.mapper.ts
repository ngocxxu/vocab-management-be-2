import { RelatedWordDto, VocabAutocompleteDto, VocabRelatedWordsDto } from '../dto';
import { VocabRelatedWordWithLinkedVocab } from '../repositories/vocab-related-word.repository';

export class VocabRelatedWordMapper {
    public toRelatedWordDto(entity: VocabRelatedWordWithLinkedVocab): RelatedWordDto {
        return new RelatedWordDto({
            id: entity.id,
            linkedVocabId: entity.linkedVocabId ?? undefined,
            freeText: entity.freeText ?? undefined,
            word: entity.linkedVocab?.textSource ?? entity.freeText ?? '',
            isSynonym: entity.isSynonym,
            isAntonym: entity.isAntonym,
            isRelated: entity.isRelated,
        });
    }

    public toGroupedDto(entities: VocabRelatedWordWithLinkedVocab[]): VocabRelatedWordsDto {
        const mapped = entities.map((entity) => this.toRelatedWordDto(entity));

        return new VocabRelatedWordsDto({
            synonyms: mapped.filter((item) => item.isSynonym),
            antonyms: mapped.filter((item) => item.isAntonym),
            related: mapped.filter((item) => item.isRelated),
        });
    }

    public toAutocompleteDtos(entities: Array<{ id: string; textSource: string }>): VocabAutocompleteDto[] {
        return entities.map((entity) => new VocabAutocompleteDto({ id: entity.id, sourceText: entity.textSource }));
    }
}
