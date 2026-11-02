import { VocabNotFoundException } from '../exceptions';
import { VocabRelatedWordService } from './vocab-related-word.service';

const sourceVocab = {
    id: 'v1',
    userId: 'u1',
    languageFolderId: 'folder-a',
    sourceLanguageCode: 'en',
    targetLanguageCode: 'vi',
};

const linkedVocab = (overrides: Partial<{ id: string; languageFolderId: string; sourceLanguageCode: string; targetLanguageCode: string }>) => ({
    id: 'v2',
    userId: 'u1',
    languageFolderId: 'folder-b',
    sourceLanguageCode: 'en',
    targetLanguageCode: 'vi',
    ...overrides,
});

const linkInput = (linkedVocabId: string) => ({
    words: [{ linkedVocabId, isSynonym: true, isAntonym: false, isRelated: false }],
});

describe('VocabRelatedWordService link rule', () => {
    let vocabRepository: { findById: jest.Mock; findByIds: jest.Mock };
    let relatedWordRepository: { findByVocabId: jest.Mock; upsertSymmetricSet: jest.Mock; autocomplete: jest.Mock };
    let service: VocabRelatedWordService;

    beforeEach(() => {
        vocabRepository = {
            findById: jest.fn().mockResolvedValue(sourceVocab),
            findByIds: jest.fn().mockResolvedValue([linkedVocab({})]),
        };
        relatedWordRepository = {
            findByVocabId: jest.fn().mockResolvedValue([]),
            upsertSymmetricSet: jest.fn().mockResolvedValue(undefined),
            autocomplete: jest.fn().mockResolvedValue([]),
        };
        service = new VocabRelatedWordService(vocabRepository as never, relatedWordRepository as never);
    });

    describe('upsertRelatedWords', () => {
        test('links a vocab from another folder when it has the same language pair', async () => {
            // Arrange: linked vocab sits in folder-b, source is in folder-a, same en -> vi

            // Act
            await service.upsertRelatedWords('v1', 'u1', linkInput('v2'));

            // Assert
            expect(relatedWordRepository.upsertSymmetricSet).toHaveBeenCalledWith('v1', [expect.objectContaining({ linkedVocabId: 'v2' })]);
        });

        test('rejects a linked vocab with another target language', async () => {
            // Arrange
            vocabRepository.findByIds.mockResolvedValue([linkedVocab({ targetLanguageCode: 'fr' })]);

            // Act + Assert
            await expect(service.upsertRelatedWords('v1', 'u1', linkInput('v2'))).rejects.toBeInstanceOf(VocabNotFoundException);
            expect(relatedWordRepository.upsertSymmetricSet).not.toHaveBeenCalled();
        });

        test('rejects a linked vocab with another source language', async () => {
            // Arrange
            vocabRepository.findByIds.mockResolvedValue([linkedVocab({ sourceLanguageCode: 'de' })]);

            // Act + Assert
            await expect(service.upsertRelatedWords('v1', 'u1', linkInput('v2'))).rejects.toBeInstanceOf(VocabNotFoundException);
            expect(relatedWordRepository.upsertSymmetricSet).not.toHaveBeenCalled();
        });

        test('rejects a linked vocab that the user does not own or that does not exist', async () => {
            // Arrange: lookup is scoped to the user, so nothing comes back
            vocabRepository.findByIds.mockResolvedValue([]);

            // Act + Assert
            await expect(service.upsertRelatedWords('v1', 'u1', linkInput('v2'))).rejects.toBeInstanceOf(VocabNotFoundException);
            expect(relatedWordRepository.upsertSymmetricSet).not.toHaveBeenCalled();
        });
    });

    describe('autocomplete', () => {
        test('keeps the folder scope when crossFolder is off', async () => {
            // Act
            await service.autocomplete('v1', 'u1', 'ap');

            // Assert
            expect(relatedWordRepository.autocomplete).toHaveBeenCalledWith({
                userId: 'u1',
                languageFolderId: 'folder-a',
                sourceLanguageCode: 'en',
                targetLanguageCode: 'vi',
                query: 'ap',
                excludeIds: ['v1'],
                crossFolder: false,
            });
        });

        test('passes the language pair and the crossFolder flag when crossFolder is on', async () => {
            // Act
            await service.autocomplete('v1', 'u1', 'ap', true);

            // Assert
            expect(relatedWordRepository.autocomplete).toHaveBeenCalledWith(
                expect.objectContaining({
                    sourceLanguageCode: 'en',
                    targetLanguageCode: 'vi',
                    crossFolder: true,
                }),
            );
        });

        test('returns the folder id and folder name of each match', async () => {
            // Arrange
            relatedWordRepository.autocomplete.mockResolvedValue([{ id: 'v2', textSource: 'apple', languageFolderId: 'folder-b', languageFolder: { name: 'Trip words' } }]);

            // Act
            const results = await service.autocomplete('v1', 'u1', 'ap', true);

            // Assert
            expect(results).toEqual([expect.objectContaining({ id: 'v2', sourceText: 'apple', languageFolderId: 'folder-b', languageFolderName: 'Trip words' })]);
        });
    });
});
