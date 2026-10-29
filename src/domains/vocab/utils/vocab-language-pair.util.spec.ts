import { VocabNotFoundException } from '../exceptions';
import { assertLinkedVocabsSharePair } from './vocab-language-pair.util';

const enToVi = { sourceLanguageCode: 'en', targetLanguageCode: 'vi' };

describe('assertLinkedVocabsSharePair', () => {
    test('accepts linked vocabs that have the same source and target language', () => {
        // Arrange
        const linkedVocabs = [
            { id: 'v2', ...enToVi },
            { id: 'v3', ...enToVi },
        ];

        // Act + Assert
        expect(() => assertLinkedVocabsSharePair(['v2', 'v3'], linkedVocabs, enToVi)).not.toThrow();
    });

    test('accepts an empty link list', () => {
        // Act + Assert
        expect(() => assertLinkedVocabsSharePair([], [], enToVi)).not.toThrow();
    });

    test('rejects a linked vocab with another target language and names it', () => {
        // Arrange
        const linkedVocabs = [{ id: 'v2', sourceLanguageCode: 'en', targetLanguageCode: 'fr' }];

        // Act + Assert
        expect(() => assertLinkedVocabsSharePair(['v2'], linkedVocabs, enToVi)).toThrow(VocabNotFoundException);
        expect(() => assertLinkedVocabsSharePair(['v2'], linkedVocabs, enToVi)).toThrow('"v2"');
    });

    test('rejects a linked vocab with another source language', () => {
        // Arrange
        const linkedVocabs = [{ id: 'v2', sourceLanguageCode: 'de', targetLanguageCode: 'vi' }];

        // Act + Assert
        expect(() => assertLinkedVocabsSharePair(['v2'], linkedVocabs, enToVi)).toThrow(VocabNotFoundException);
    });

    test('rejects when a requested linked vocab was not loaded for this user', () => {
        // Arrange: two ids asked, only one came back (missing or owned by someone else)
        const linkedVocabs = [{ id: 'v2', ...enToVi }];

        // Act + Assert
        expect(() => assertLinkedVocabsSharePair(['v2', 'v9'], linkedVocabs, enToVi)).toThrow(VocabNotFoundException);
    });
});
