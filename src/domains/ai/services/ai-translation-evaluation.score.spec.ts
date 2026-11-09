import { computeOverallScore } from './ai-translation-evaluation.service';

describe('computeOverallScore', () => {
    it('returns 100 when every dimension is 10', () => {
        // Arrange
        const scores = { accuracy: 10, fluency: 10, register: 10, completeness: 10 };

        // Act & Assert
        expect(computeOverallScore(scores)).toBe(100);
    });

    it('returns 0 when every dimension is 0', () => {
        // Arrange
        const scores = { accuracy: 0, fluency: 0, register: 0, completeness: 0 };

        // Act & Assert
        expect(computeOverallScore(scores)).toBe(0);
    });

    it('weights the dimensions as accuracy*2.5 + fluency*2 + register*1.5 + completeness*4', () => {
        // Arrange: 8*2.5 + 6*2 + 4*1.5 + 5*4 = 20 + 12 + 6 + 20 = 58
        const scores = { accuracy: 8, fluency: 6, register: 4, completeness: 5 };

        // Act & Assert
        expect(computeOverallScore(scores)).toBe(58);
    });

    it('clamps each dimension to the 0-10 range before weighting', () => {
        // Arrange: out-of-range values from the model
        const scores = { accuracy: 12, fluency: -3, register: 10, completeness: 10 };

        // Act & Assert: 10*2.5 + 0*2 + 10*1.5 + 10*4 = 25 + 0 + 15 + 40 = 80
        expect(computeOverallScore(scores)).toBe(80);
    });

    it('treats missing or non-numeric dimensions as 0', () => {
        // Arrange
        const scores = { accuracy: 10, fluency: undefined, register: 'high', completeness: 10 } as never;

        // Act & Assert: 10*2.5 + 0 + 0 + 10*4 = 65
        expect(computeOverallScore(scores)).toBe(65);
    });

    it('returns 0 when scores are absent', () => {
        // Act & Assert
        expect(computeOverallScore(undefined as never)).toBe(0);
    });
});
