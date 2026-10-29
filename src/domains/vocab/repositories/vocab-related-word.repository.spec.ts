import { VocabRelatedWordRepository } from './vocab-related-word.repository';

type FindManyArgs = { where: Record<string, unknown>; select: Record<string, unknown> };

const baseParams = {
    userId: 'u1',
    languageFolderId: 'folder-a',
    sourceLanguageCode: 'en',
    targetLanguageCode: 'vi',
    query: 'ap',
    excludeIds: ['v1'],
};

describe('VocabRelatedWordRepository autocomplete', () => {
    let prisma: { vocab: { findMany: jest.Mock } };
    let repository: VocabRelatedWordRepository;

    const lastFindManyArgs = (): FindManyArgs => prisma.vocab.findMany.mock.calls[0][0] as FindManyArgs;

    beforeEach(() => {
        prisma = { vocab: { findMany: jest.fn().mockResolvedValue([]) } };
        repository = new VocabRelatedWordRepository(prisma as never, {} as never);
    });

    test('keeps the folder filter and leaves the language codes out when crossFolder is not set', async () => {
        // Act
        await repository.autocomplete(baseParams);

        // Assert
        const { where } = lastFindManyArgs();
        expect(where).toMatchObject({ userId: 'u1', languageFolderId: 'folder-a' });
        expect(where).not.toHaveProperty('sourceLanguageCode');
        expect(where).not.toHaveProperty('targetLanguageCode');
    });

    test('drops the folder filter and filters by the language pair when crossFolder is on', async () => {
        // Act
        await repository.autocomplete({ ...baseParams, crossFolder: true });

        // Assert
        const { where } = lastFindManyArgs();
        expect(where).toMatchObject({ userId: 'u1', sourceLanguageCode: 'en', targetLanguageCode: 'vi' });
        expect(where).not.toHaveProperty('languageFolderId');
    });

    test('selects the folder id and folder name of each match', async () => {
        // Act
        await repository.autocomplete({ ...baseParams, crossFolder: true });

        // Assert
        const { select } = lastFindManyArgs();
        expect(select).toMatchObject({
            id: true,
            textSource: true,
            languageFolderId: true,
            languageFolder: { select: { name: true } },
        });
    });
});
