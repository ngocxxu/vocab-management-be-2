import { VocabNotFoundException } from '../exceptions';

export interface LanguagePair {
    sourceLanguageCode: string;
    targetLanguageCode: string;
}

/**
 * Checks that every linked vocab has the same language pair as the source vocab.
 * Folders do not matter here: two folders with the same pair can link their words.
 * Callers load `linkedVocabs` scoped to the user, so only the user's own vocabs reach this check.
 */
export function assertLinkedVocabsSharePair(linkedVocabIds: string[], linkedVocabs: Array<LanguagePair & { id: string }>, sourcePair: LanguagePair): void {
    if (linkedVocabs.length !== linkedVocabIds.length) {
        throw new VocabNotFoundException('one or more linked vocabs');
    }

    const otherPairVocab = linkedVocabs.find(
        (linkedVocab) => linkedVocab.sourceLanguageCode !== sourcePair.sourceLanguageCode || linkedVocab.targetLanguageCode !== sourcePair.targetLanguageCode,
    );
    if (otherPairVocab) {
        throw new VocabNotFoundException(otherPairVocab.id);
    }
}
