import { getExactMatchMeanings } from './exact-match-answer.util';

describe('getExactMatchMeanings', () => {
    it('returns the single accepted meaning for a one-word Thai answer', () => {
        // Arrange
        const languageCode = 'th';
        const expectedAnswer = 'ตัวเลข';

        // Act & Assert
        expect(getExactMatchMeanings(languageCode, expectedAnswer)).toEqual(['ตัวเลข']);
    });

    it('returns every meaning when the expected answer lists several', () => {
        // Arrange
        const languageCode = 'ko';
        const expectedAnswer = '과다하게, 지나치게';

        // Act & Assert
        expect(getExactMatchMeanings(languageCode, expectedAnswer)).toEqual(['과다하게', '지나치게']);
    });

    it('returns null for a language outside the exact-match list', () => {
        // Act & Assert
        expect(getExactMatchMeanings('vi', 'ghế')).toBeNull();
        expect(getExactMatchMeanings('ja', '食べる')).toBeNull();
    });

    it('returns null when the expected answer contains a space (sentence-length)', () => {
        // Arrange
        const expectedAnswer = '과다하게 투자되는 걸 원하지 않다';

        // Act & Assert
        expect(getExactMatchMeanings('ko', expectedAnswer)).toBeNull();
    });

    it('returns null when a meaning is longer than 12 graphemes', () => {
        // Arrange
        const expectedAnswer = 'กกกกกกกกกกกกกกกกกกกก';

        // Act & Assert
        expect(getExactMatchMeanings('th', expectedAnswer)).toBeNull();
    });

    it('returns null for an empty expected answer', () => {
        // Act & Assert
        expect(getExactMatchMeanings('th', '')).toBeNull();
    });
});
