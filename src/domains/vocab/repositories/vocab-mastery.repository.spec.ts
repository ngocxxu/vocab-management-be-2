import { TrainerMode } from '@prisma/client';
import { VocabMasteryRepository } from './vocab-mastery.repository';

describe('VocabMasteryRepository.findClassicTrainersByIds', () => {
    test('asks the database for nothing when no trainer id is given', async () => {
        // Arrange
        const prisma = { vocabTrainer: { findMany: jest.fn() } };
        const repository = new VocabMasteryRepository(prisma as never);

        // Act
        const trainers = await repository.findClassicTrainersByIds('user-1', []);

        // Assert
        expect(trainers).toEqual([]);
        expect(prisma.vocabTrainer.findMany).not.toHaveBeenCalled();
    });

    test('reads only the Classic trainers of the user among the given ids, with their question type', async () => {
        // Arrange
        const rows = [{ id: 'trainer-1', questionType: 'FLIP_CARD' }];
        const prisma = { vocabTrainer: { findMany: jest.fn().mockResolvedValue(rows) } };
        const repository = new VocabMasteryRepository(prisma as never);

        // Act
        const trainers = await repository.findClassicTrainersByIds('user-1', ['trainer-1', 'trainer-2']);

        // Assert
        expect(trainers).toEqual(rows);
        expect(prisma.vocabTrainer.findMany).toHaveBeenCalledWith({
            where: { id: { in: ['trainer-1', 'trainer-2'] }, userId: 'user-1', mode: TrainerMode.CLASSIC },
            select: { id: true, questionType: true },
        });
    });
});
