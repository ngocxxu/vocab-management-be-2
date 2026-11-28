// Through the barrel, like the rest of the code: importing the file alone hits an import cycle between the DTO files.
import { DashboardStatisticsDto, MasterySummaryDto, ProgressOverTimeDto } from '.';

describe('ProgressOverTimeDto', () => {
    test('rounds the mastery average to one decimal', () => {
        // Act
        const dto = new ProgressOverTimeDto({ date: '2026-09-01', averageMastery: 7.26, practiceCount: 3 });

        // Assert
        expect(dto).toEqual({ date: '2026-09-01', averageMastery: 7.3, practiceCount: 3 });
    });

    test('keeps null for a day without Classic practice instead of turning it into 0', () => {
        // Act
        const dto = new ProgressOverTimeDto({ date: '2026-09-02', averageMastery: null, practiceCount: 2 });

        // Assert
        expect(dto.averageMastery).toBeNull();
        expect(dto.practiceCount).toBe(2);
    });
});

describe('MasterySummaryDto Classic exam due', () => {
    const summary = {
        totalVocabs: 10,
        totalCorrect: 4,
        totalIncorrect: 1,
        averageMastery: 5,
        lastPracticeAt: null,
        criticalCount: 0,
        warningCount: 0,
        fsrsDueToday: 3,
        fsrsMastered: 7,
        trends: { totalVocabsPercentDelta: null, averageMasteryDelta: null, accuracyPercentDelta: null, needReviewDelta: null },
    };

    test('keeps the count and the one Classic trainer to open', () => {
        // Act
        const dto = new MasterySummaryDto({ ...summary, classicDueCount: 1, classicDueTrainer: { trainerId: 'trainer-1', questionType: 'TRUE_OR_FALSE' } });

        // Assert
        expect(dto.classicDueCount).toBe(1);
        expect(dto.classicDueTrainer).toEqual({ trainerId: 'trainer-1', questionType: 'TRUE_OR_FALSE' });
    });

    test('keeps the count with no trainer to open when more than one Classic exam is due', () => {
        // Act
        const dto = new MasterySummaryDto({ ...summary, classicDueCount: 2, classicDueTrainer: null });

        // Assert
        expect(dto.classicDueCount).toBe(2);
        expect(dto.classicDueTrainer).toBeNull();
    });

    test('keeps the FSRS due and mastered counts unchanged next to the Classic fields', () => {
        // Act
        const dto = new MasterySummaryDto({ ...summary, classicDueCount: 0, classicDueTrainer: null });

        // Assert
        expect(dto).toMatchObject({ fsrsDueToday: 3, fsrsMastered: 7 });
    });

    test('the dashboard keeps the Classic fields of its summary', () => {
        // Act
        const dashboard = new DashboardStatisticsDto({
            summary: { ...summary, classicDueCount: 1, classicDueTrainer: { trainerId: 'trainer-1', questionType: 'FLIP_CARD' } },
        });

        // Assert
        expect(dashboard.summary).toMatchObject({ classicDueCount: 1, classicDueTrainer: { trainerId: 'trainer-1', questionType: 'FLIP_CARD' } });
    });
});
