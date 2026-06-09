import { CreateRelatedWordInput } from '../dto/upsert-related-words.input';
import { VocabRelatedWordBadRequestException } from '../exceptions';

export interface NormalizedRelatedWordInput {
    linkedVocabId?: string;
    freeText?: string;
    isSynonym: boolean;
    isAntonym: boolean;
    isRelated: boolean;
}

export function normalizeAndValidateRelatedWords(vocabId: string, words: CreateRelatedWordInput[]): NormalizedRelatedWordInput[] {
    const seenLinkedVocabIds = new Set<string>();
    const seenFreeTexts = new Set<string>();

    return words.map((word) => {
        const linkedVocabId = word.linkedVocabId?.trim() || undefined;
        const freeText = word.freeText?.trim() || undefined;
        const hasLinkedVocab = Boolean(linkedVocabId);
        const hasFreeText = Boolean(freeText);

        if (hasLinkedVocab === hasFreeText) {
            throw new VocabRelatedWordBadRequestException('Each related word must provide exactly one of linkedVocabId or freeText');
        }

        if (linkedVocabId === vocabId) {
            throw new VocabRelatedWordBadRequestException('Cannot link vocab to itself');
        }

        if (linkedVocabId) {
            if (seenLinkedVocabIds.has(linkedVocabId)) {
                throw new VocabRelatedWordBadRequestException(`Duplicate linked vocab identifier "${linkedVocabId}"`);
            }

            seenLinkedVocabIds.add(linkedVocabId);
        }

        if (freeText) {
            const normalizedFreeText = freeText.toLocaleLowerCase();

            if (seenFreeTexts.has(normalizedFreeText)) {
                throw new VocabRelatedWordBadRequestException(`Duplicate free-text related word "${freeText}"`);
            }

            seenFreeTexts.add(normalizedFreeText);
        }

        if (word.isSynonym && word.isAntonym) {
            throw new VocabRelatedWordBadRequestException('Synonym and antonym are mutually exclusive');
        }

        if (!word.isSynonym && !word.isAntonym && !word.isRelated) {
            throw new VocabRelatedWordBadRequestException('At least one relation type is required');
        }

        return {
            linkedVocabId,
            freeText,
            isSynonym: word.isSynonym,
            isAntonym: word.isAntonym,
            isRelated: word.isRelated,
        };
    });
}
