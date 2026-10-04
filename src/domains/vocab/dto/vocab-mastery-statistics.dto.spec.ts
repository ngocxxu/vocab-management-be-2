// Through the barrel, like the rest of the code: importing the file alone hits an import cycle between the DTO files.
import { ProgressOverTimeDto } from '.';

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
