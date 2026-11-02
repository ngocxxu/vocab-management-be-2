import { LanguageFolderNotFoundException } from '../../catalog/language-folder/exceptions';
import { VocabFolderLanguageMismatchException } from '../exceptions';
import { VocabService } from './vocab.service';

// The folder move only touches the vocab and language folder repositories, so the other collaborators are not needed.
const unused = {} as never;

const existingVocab = { id: 'v1', userId: 'u1', textSource: 'apple', sourceLanguageCode: 'en', targetLanguageCode: 'vi', languageFolderId: 'f1' };

describe('VocabService.update when the word changes folder', () => {
    let repository: {
        findById: jest.Mock;
        update: jest.Mock;
        clearListCaches: jest.Mock;
    };
    let languageFolderRepository: { findById: jest.Mock };
    let service: VocabService;

    beforeEach(() => {
        repository = {
            findById: jest.fn().mockResolvedValue(existingVocab),
            update: jest.fn().mockResolvedValue(existingVocab),
            clearListCaches: jest.fn().mockResolvedValue(undefined),
        };
        languageFolderRepository = {
            findById: jest.fn().mockResolvedValue({ id: 'f2', userId: 'u1', sourceLanguageCode: 'en', targetLanguageCode: 'vi' }),
        };
        service = new VocabService(repository as never, unused, unused, unused, unused, unused, unused, unused, unused, languageFolderRepository as never);
        jest.spyOn(service as never, 'buildResponse' as never).mockResolvedValue({ id: 'v1' } as never);
    });

    test('moves the word to a folder with the same language pair', async () => {
        // Act
        await service.update('v1', { languageFolderId: 'f2' }, 'u1');

        // Assert
        expect(languageFolderRepository.findById).toHaveBeenCalledWith('f2', 'u1');
        expect(repository.update).toHaveBeenCalledWith('v1', expect.objectContaining({ languageFolder: { connect: { id: 'f2' } } }));
    });

    test('refuses a folder with another language pair and keeps the word', async () => {
        // Arrange
        languageFolderRepository.findById.mockResolvedValue({ id: 'f2', userId: 'u1', sourceLanguageCode: 'en', targetLanguageCode: 'ko' });

        // Act + Assert
        await expect(service.update('v1', { languageFolderId: 'f2' }, 'u1')).rejects.toBeInstanceOf(VocabFolderLanguageMismatchException);
        expect(repository.update).not.toHaveBeenCalled();
    });

    test('refuses a folder the user does not own', async () => {
        // Arrange
        languageFolderRepository.findById.mockResolvedValue(null);

        // Act + Assert
        await expect(service.update('v1', { languageFolderId: 'f2' }, 'u1')).rejects.toBeInstanceOf(LanguageFolderNotFoundException);
        expect(repository.update).not.toHaveBeenCalled();
    });

    test('skips the folder check when the word stays in its folder', async () => {
        // Act
        await service.update('v1', { languageFolderId: 'f1', textSource: 'apple pie' }, 'u1');

        // Assert
        expect(languageFolderRepository.findById).not.toHaveBeenCalled();
        expect(repository.update).toHaveBeenCalledTimes(1);
    });
});
