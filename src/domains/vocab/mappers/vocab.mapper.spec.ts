import { VocabMapper } from './vocab.mapper';

describe('VocabMapper.buildUpdateInput', () => {
    const mapper = new VocabMapper();

    test('connects the new language folder when languageFolderId is given', () => {
        // Act
        const input = mapper.buildUpdateInput({ languageFolderId: 'folder-2' });

        // Assert
        expect(input).toEqual({ languageFolder: { connect: { id: 'folder-2' } } });
    });

    test('leaves the folder alone when languageFolderId is absent', () => {
        // Act
        const input = mapper.buildUpdateInput({ textSource: 'apple' });

        // Assert
        expect(input).not.toHaveProperty('languageFolder');
    });
});
