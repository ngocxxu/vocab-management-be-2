import { Prisma } from '@prisma/client';
import { LanguageFolderInUseException } from '../exceptions';
import { LanguageFolderService } from './language-folder.service';

const folder = { id: 'f1', name: 'Fruit', userId: 'u1', sourceLanguageCode: 'en', targetLanguageCode: 'vi' };

const foreignKeyError = () => new Prisma.PrismaClientKnownRequestError('Foreign key constraint failed', { code: 'P2003', clientVersion: '6.11.1' });

describe('LanguageFolderService delete while a word is in a trainer', () => {
    let repository: { findById: jest.Mock; findVocabsInTrainers: jest.Mock; delete: jest.Mock };
    let service: LanguageFolderService;

    beforeEach(() => {
        repository = {
            findById: jest.fn().mockResolvedValue(folder),
            findVocabsInTrainers: jest.fn().mockResolvedValue([]),
            delete: jest.fn().mockResolvedValue(folder),
        };
        service = new LanguageFolderService(repository as never, {} as never);
        jest.spyOn(service as never, 'findOne' as never).mockResolvedValue({ id: 'f1', name: 'Fruit' } as never);
    });

    test('deletes a folder whose words are in no trainer', async () => {
        // Act
        await service.delete('f1', 'u1');

        // Assert
        expect(repository.delete).toHaveBeenCalledWith('f1', 'u1');
    });

    test('refuses to delete a folder with a word in a trainer and deletes nothing', async () => {
        // Arrange
        repository.findVocabsInTrainers.mockResolvedValue([{ vocabId: 'v1', textSource: 'apple', trainerId: 't1' }]);

        // Act + Assert
        await expect(service.delete('f1', 'u1')).rejects.toBeInstanceOf(LanguageFolderInUseException);
        expect(repository.delete).not.toHaveBeenCalled();
    });

    test('counts each blocked word once, however many trainers it is in', async () => {
        // Arrange
        repository.findVocabsInTrainers.mockResolvedValue([
            { vocabId: 'v1', textSource: 'apple', trainerId: 't1' },
            { vocabId: 'v1', textSource: 'apple', trainerId: 't2' },
            { vocabId: 'v2', textSource: 'river', trainerId: 't1' },
        ]);

        // Act
        const error = await service.delete('f1', 'u1').catch((e: unknown) => e);

        // Assert
        const response = (error as LanguageFolderInUseException).getResponse() as {
            message: string;
            error: string;
            details: { blockedVocabCount: number };
        };
        expect(response.error).toBe('LanguageFolderInUse');
        expect(response.message).toBe('Cannot delete folder. 2 vocabs in it are used by trainers.');
        expect(response.details.blockedVocabCount).toBe(2);
    });

    test('turns a foreign key violation at delete time into the same conflict', async () => {
        // Arrange: a word joins a trainer after the check
        repository.delete.mockRejectedValue(foreignKeyError());
        repository.findVocabsInTrainers.mockResolvedValueOnce([]).mockResolvedValueOnce([{ vocabId: 'v1', textSource: 'apple', trainerId: 't1' }]);

        // Act + Assert
        await expect(service.delete('f1', 'u1')).rejects.toBeInstanceOf(LanguageFolderInUseException);
    });

    test('rethrows other database errors unchanged', async () => {
        // Arrange
        const other = new Error('connection lost');
        repository.delete.mockRejectedValue(other);

        // Act + Assert
        await expect(service.delete('f1', 'u1')).rejects.toBe(other);
    });
});
