import { Prisma } from '@prisma/client';
import { VocabInUseException } from '../exceptions';
import { VocabService } from './vocab.service';

// The delete path only touches the repository, so the other collaborators are not needed.
const unused = {} as never;

const usageRow = (vocabId: string, trainerId: string, trainerName: string, textSource = 'apple') => ({ vocabId, trainerId, trainerName, textSource });

const foreignKeyError = () => new Prisma.PrismaClientKnownRequestError('Foreign key constraint failed', { code: 'P2003', clientVersion: '6.11.1' });

describe('VocabService delete while the word is in a trainer', () => {
    let repository: {
        findById: jest.Mock;
        findTrainerUsage: jest.Mock;
        delete: jest.Mock;
        clearListCaches: jest.Mock;
    };
    let service: VocabService;

    beforeEach(() => {
        repository = {
            findById: jest.fn().mockResolvedValue({ id: 'v1', textSource: 'apple' }),
            findTrainerUsage: jest.fn().mockResolvedValue([]),
            delete: jest.fn().mockResolvedValue({ id: 'v1', textSource: 'apple' }),
            clearListCaches: jest.fn().mockResolvedValue(undefined),
        };
        service = new VocabService(repository as never, unused, unused, unused, unused, unused, unused, unused, unused, unused);
        jest.spyOn(service as never, 'buildResponse' as never).mockResolvedValue({ id: 'v1' } as never);
    });

    test('deletes a word that is in no trainer', async () => {
        // Act
        await service.delete('v1', 'u1');

        // Assert
        expect(repository.delete).toHaveBeenCalledWith('v1', 'u1');
    });

    test('refuses to delete a word in a trainer and keeps the word', async () => {
        // Arrange
        repository.findTrainerUsage.mockResolvedValue([usageRow('v1', 't1', 'Exam words')]);

        // Act + Assert
        await expect(service.delete('v1', 'u1')).rejects.toBeInstanceOf(VocabInUseException);
        expect(repository.delete).not.toHaveBeenCalled();
    });

    test('counts every trainer of the word and lists at most 3 of them', async () => {
        // Arrange
        repository.findTrainerUsage.mockResolvedValue([usageRow('v1', 't1', 'One'), usageRow('v1', 't2', 'Two'), usageRow('v1', 't3', 'Three'), usageRow('v1', 't4', 'Four')]);

        // Act
        const error = await service.delete('v1', 'u1').catch((e: unknown) => e);

        // Assert
        expect(error).toBeInstanceOf(VocabInUseException);
        const response = (error as VocabInUseException).getResponse() as {
            message: string;
            error: string;
            details: { vocabs: Array<{ trainerCount: number; sampleTrainers: unknown[] }> };
        };
        expect(response.error).toBe('VocabInUse');
        expect(response.message).toBe('Cannot delete vocab. 4 trainers are using it.');
        expect(response.details.vocabs[0]).toMatchObject({ trainerCount: 4 });
        expect(response.details.vocabs[0]?.sampleTrainers).toHaveLength(3);
    });

    test('turns a foreign key violation at delete time into the same conflict', async () => {
        // Arrange: a trainer gets the word after the check, so the database refuses the delete
        repository.delete.mockRejectedValue(foreignKeyError());
        repository.findTrainerUsage.mockResolvedValueOnce([]).mockResolvedValueOnce([usageRow('v1', 't1', 'Late trainer')]);

        // Act + Assert
        await expect(service.delete('v1', 'u1')).rejects.toBeInstanceOf(VocabInUseException);
    });

    test('still reports a conflict when the foreign key fails but the usage check finds nothing', async () => {
        // Arrange
        repository.delete.mockRejectedValue(foreignKeyError());

        // Act + Assert
        await expect(service.delete('v1', 'u1')).rejects.toBeInstanceOf(VocabInUseException);
    });

    test('rethrows other database errors unchanged', async () => {
        // Arrange
        const other = new Error('connection lost');
        repository.delete.mockRejectedValue(other);

        // Act + Assert
        await expect(service.delete('v1', 'u1')).rejects.toBe(other);
    });

    test('bulk delete refuses the whole request when one word is in a trainer and deletes nothing', async () => {
        // Arrange
        repository.findTrainerUsage.mockResolvedValue([usageRow('v2', 't1', 'Exam words', 'river')]);

        // Act + Assert
        await expect(service.deleteBulk({ ids: ['v1', 'v2', 'v3'] }, 'u1')).rejects.toBeInstanceOf(VocabInUseException);
        expect(repository.findTrainerUsage).toHaveBeenCalledWith(['v1', 'v2', 'v3']);
        expect(repository.delete).not.toHaveBeenCalled();
    });

    test('bulk delete reports every blocked word', async () => {
        // Arrange
        repository.findTrainerUsage.mockResolvedValue([usageRow('v1', 't1', 'A'), usageRow('v2', 't1', 'A', 'river')]);

        // Act
        const error = await service.deleteBulk({ ids: ['v1', 'v2'] }, 'u1').catch((e: unknown) => e);

        // Assert
        const response = (error as VocabInUseException).getResponse() as { message: string; details: { vocabs: Array<{ vocabId: string }> } };
        expect(response.message).toBe('Cannot delete 2 vocabs. 2 vocabs are in use by trainers.');
        expect(response.details.vocabs.map((vocab) => vocab.vocabId)).toEqual(['v1', 'v2']);
    });
});
