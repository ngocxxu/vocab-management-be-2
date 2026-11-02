import { VocabNotFoundException } from '../exceptions';
import { VocabService } from './vocab.service';

// The related-word paths only touch the repositories, so the other collaborators are not needed.
const unused = {} as never;

const tx = { name: 'tx' };

const linkedVocab = (overrides: Partial<{ id: string; languageFolderId: string; sourceLanguageCode: string; targetLanguageCode: string }>) => ({
    id: 'v2',
    userId: 'u1',
    languageFolderId: 'folder-b',
    sourceLanguageCode: 'en',
    targetLanguageCode: 'vi',
    ...overrides,
});

const linkWord = (linkedVocabId: string) => ({ linkedVocabId, isSynonym: true, isAntonym: false, isRelated: false });

describe('VocabService related-word link rule', () => {
    let vocabRepository: {
        findById: jest.Mock;
        findLanguageFolderById: jest.Mock;
        inTransaction: jest.Mock;
        createInTransaction: jest.Mock;
        updateInTransaction: jest.Mock;
        findByIdsInTransaction: jest.Mock;
        setCacheById: jest.Mock;
        clearListCaches: jest.Mock;
    };
    let relatedWordRepository: {
        upsertSymmetricSetInTransaction: jest.Mock;
        upgradeFreeTextToLinkedInTransaction: jest.Mock;
        clearCacheByVocabIds: jest.Mock;
    };
    let service: VocabService;

    beforeEach(() => {
        vocabRepository = {
            findById: jest.fn().mockResolvedValue({ id: 'v1', userId: 'u1', languageFolderId: 'folder-a', sourceLanguageCode: 'en', targetLanguageCode: 'vi' }),
            findLanguageFolderById: jest.fn().mockResolvedValue({ id: 'folder-a' }),
            inTransaction: jest.fn(async (callback: (client: unknown) => Promise<unknown>) => callback(tx)),
            createInTransaction: jest.fn().mockResolvedValue({ id: 'v3', userId: 'u1', languageFolderId: 'folder-a', sourceLanguageCode: 'en', targetLanguageCode: 'vi' }),
            updateInTransaction: jest.fn().mockResolvedValue({ id: 'v1', userId: 'u1', languageFolderId: 'folder-a', sourceLanguageCode: 'en', targetLanguageCode: 'vi' }),
            findByIdsInTransaction: jest.fn().mockResolvedValue([linkedVocab({})]),
            setCacheById: jest.fn().mockResolvedValue(undefined),
            clearListCaches: jest.fn().mockResolvedValue(undefined),
        };
        relatedWordRepository = {
            upsertSymmetricSetInTransaction: jest.fn().mockResolvedValue([]),
            upgradeFreeTextToLinkedInTransaction: jest.fn().mockResolvedValue([]),
            clearCacheByVocabIds: jest.fn().mockResolvedValue(undefined),
        };
        service = new VocabService(vocabRepository as never, unused, unused, unused, unused, relatedWordRepository as never, unused, unused, unused, unused);
        jest.spyOn(service as never, 'buildResponse' as never).mockResolvedValue({ id: 'v1' } as never);
    });

    describe('update with relatedWords', () => {
        test('links a vocab from another folder when it has the same language pair', async () => {
            // Act
            await service.update('v1', { relatedWords: [linkWord('v2')] } as never, 'u1');

            // Assert
            expect(relatedWordRepository.upsertSymmetricSetInTransaction).toHaveBeenCalledWith(tx, 'v1', [expect.objectContaining({ linkedVocabId: 'v2' })]);
        });

        test('rejects a linked vocab with another target language', async () => {
            // Arrange
            vocabRepository.findByIdsInTransaction.mockResolvedValue([linkedVocab({ targetLanguageCode: 'fr' })]);

            // Act + Assert
            await expect(service.update('v1', { relatedWords: [linkWord('v2')] } as never, 'u1')).rejects.toBeInstanceOf(VocabNotFoundException);
            expect(relatedWordRepository.upsertSymmetricSetInTransaction).not.toHaveBeenCalled();
        });

        test('checks the pair the vocab has after the update, not the pair before it', async () => {
            // Arrange: the update moves the vocab to en -> fr, so the en -> vi link no longer fits
            vocabRepository.updateInTransaction.mockResolvedValue({
                id: 'v1',
                userId: 'u1',
                languageFolderId: 'folder-a',
                sourceLanguageCode: 'en',
                targetLanguageCode: 'fr',
            });

            // Act + Assert
            await expect(service.update('v1', { targetLanguageCode: 'fr', relatedWords: [linkWord('v2')] } as never, 'u1')).rejects.toBeInstanceOf(VocabNotFoundException);
            expect(relatedWordRepository.upsertSymmetricSetInTransaction).not.toHaveBeenCalled();
        });
    });

    describe('create with relatedWords', () => {
        const createInput = {
            textSource: 'apple',
            sourceLanguageCode: 'en',
            targetLanguageCode: 'vi',
            languageFolderId: 'folder-a',
            textTargets: [{ textTarget: 'quả táo', grammar: '', explanationSource: '', explanationTarget: '' }],
            relatedWords: [linkWord('v2')],
        };

        test('links a vocab from another folder when it has the same language pair', async () => {
            // Act
            await service.create(createInput as never, 'u1');

            // Assert
            expect(relatedWordRepository.upsertSymmetricSetInTransaction).toHaveBeenCalledWith(tx, 'v3', [expect.objectContaining({ linkedVocabId: 'v2' })]);
        });

        test('keeps the free-text backfill scoped to the vocab folder', async () => {
            // Act
            await service.create(createInput as never, 'u1');

            // Assert
            expect(relatedWordRepository.upgradeFreeTextToLinkedInTransaction).toHaveBeenCalledWith(tx, expect.objectContaining({ id: 'v3', languageFolderId: 'folder-a' }));
        });

        test('rejects a linked vocab with another source language', async () => {
            // Arrange
            vocabRepository.findByIdsInTransaction.mockResolvedValue([linkedVocab({ sourceLanguageCode: 'de' })]);

            // Act + Assert
            await expect(service.create(createInput as never, 'u1')).rejects.toBeInstanceOf(VocabNotFoundException);
            expect(relatedWordRepository.upsertSymmetricSetInTransaction).not.toHaveBeenCalled();
        });
    });
});
