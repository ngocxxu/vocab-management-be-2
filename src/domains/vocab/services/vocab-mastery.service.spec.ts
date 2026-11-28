import { captureSentryException } from '@/shared/utils/sentry.util';
import { VocabMasteryService } from './vocab-mastery.service';

jest.mock('@/shared/utils/sentry.util', () => ({ captureSentryException: jest.fn() }));

type ClassicTrainerRow = { id: string; questionType: string };

const createService = (options: { bellTrainerIds?: string[]; classicTrainers?: ClassicTrainerRow[] } = {}) => {
    const masteryRepository = {
        aggregateByUserId: jest.fn().mockResolvedValue({ _sum: { correctCount: 0, incorrectCount: 0 }, _avg: { masteryScore: 0 } }),
        findLastPracticeAtByUserId: jest.fn().mockResolvedValue(null),
        countHealthByUserId: jest.fn().mockResolvedValue({ criticalCount: 0, warningCount: 0 }),
        getSummarySnapshotAt: jest.fn().mockResolvedValue({ totalVocabs: 0, totalCorrect: 0, totalIncorrect: 0, averageMastery: null, needReviewCount: 0 }),
        findClassicTrainersByIds: jest.fn().mockResolvedValue(options.classicTrainers ?? []),
    };
    const vocabRepository = { countByUserId: jest.fn().mockResolvedValue(0) };
    const fsrsStatsService = { getUserSummary: jest.fn().mockResolvedValue({ fsrsDueToday: 3, fsrsMastered: 7 }) };
    const notificationService = { getOpenReminderBellTrainerIds: jest.fn().mockResolvedValue(options.bellTrainerIds ?? []) };
    const logger = { error: jest.fn() };
    const service = new VocabMasteryService(masteryRepository as never, vocabRepository as never, fsrsStatsService as never, notificationService as never, logger as never);

    return { service, masteryRepository, notificationService, fsrsStatsService, logger };
};

describe('VocabMasteryService.getSummary Classic exam due', () => {
    test('reports no Classic exam due when no open Bell is left', async () => {
        // Arrange
        const { service } = createService({ bellTrainerIds: [], classicTrainers: [] });

        // Act
        const summary = await service.getSummary('user-1');

        // Assert
        expect(summary.classicDueCount).toBe(0);
        expect(summary.classicDueTrainer).toBeNull();
    });

    test('points at the one Classic trainer that is due, with the question type of its row', async () => {
        // Arrange
        const { service } = createService({ bellTrainerIds: ['trainer-1'], classicTrainers: [{ id: 'trainer-1', questionType: 'TRUE_OR_FALSE' }] });

        // Act
        const summary = await service.getSummary('user-1');

        // Assert
        expect(summary.classicDueCount).toBe(1);
        expect(summary.classicDueTrainer).toEqual({ trainerId: 'trainer-1', questionType: 'TRUE_OR_FALSE' });
    });

    test('gives a count and no target when two Classic exams are due', async () => {
        // Arrange
        const { service } = createService({
            bellTrainerIds: ['trainer-1', 'trainer-2'],
            classicTrainers: [
                { id: 'trainer-1', questionType: 'FLIP_CARD' },
                { id: 'trainer-2', questionType: 'MULTIPLE_CHOICE' },
            ],
        });

        // Act
        const summary = await service.getSummary('user-1');

        // Assert
        expect(summary.classicDueCount).toBe(2);
        expect(summary.classicDueTrainer).toBeNull();
    });

    test('looks up the open Bells of the user, then the Classic trainers among those ids', async () => {
        // Arrange
        const { service, notificationService, masteryRepository } = createService({ bellTrainerIds: ['trainer-1', 'trainer-2'] });

        // Act
        await service.getSummary('user-1');

        // Assert
        expect(notificationService.getOpenReminderBellTrainerIds).toHaveBeenCalledWith('user-1');
        expect(masteryRepository.findClassicTrainersByIds).toHaveBeenCalledWith('user-1', ['trainer-1', 'trainer-2']);
    });

    test('keeps the FSRS due and mastered counts as they are', async () => {
        // Arrange
        const { service } = createService({ bellTrainerIds: ['trainer-1'], classicTrainers: [{ id: 'trainer-1', questionType: 'FLIP_CARD' }] });

        // Act
        const summary = await service.getSummary('user-1');

        // Assert
        expect(summary).toMatchObject({ fsrsDueToday: 3, fsrsMastered: 7 });
    });

    test('reports no Classic exam due, and keeps the FSRS counts, when the Bell lookup fails', async () => {
        // Arrange
        const { service, notificationService, logger } = createService();
        const lookupError = new Error('bell lookup down');
        notificationService.getOpenReminderBellTrainerIds.mockRejectedValueOnce(lookupError);

        // Act
        const summary = await service.getSummary('user-1');

        // Assert
        expect(summary).toMatchObject({ classicDueCount: 0, classicDueTrainer: null, fsrsDueToday: 3, fsrsMastered: 7 });
        expect(logger.error).toHaveBeenCalledWith('Classic exam due lookup failed for user user-1: bell lookup down');
        expect(captureSentryException).toHaveBeenCalledWith(lookupError, expect.anything());
    });

    test('reports no Classic exam due when the trainer lookup fails', async () => {
        // Arrange
        const { service, masteryRepository, logger } = createService({ bellTrainerIds: ['trainer-1'] });
        const lookupError = new Error('trainer lookup down');
        masteryRepository.findClassicTrainersByIds.mockRejectedValueOnce(lookupError);

        // Act
        const summary = await service.getSummary('user-1');

        // Assert
        expect(summary.classicDueCount).toBe(0);
        expect(summary.classicDueTrainer).toBeNull();
        expect(logger.error).toHaveBeenCalledWith('Classic exam due lookup failed for user user-1: trainer lookup down');
        expect(captureSentryException).toHaveBeenCalledWith(lookupError, expect.anything());
    });
});
