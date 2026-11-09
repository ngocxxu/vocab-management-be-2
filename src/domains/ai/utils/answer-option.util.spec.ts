import { hasCorrectAnswerInOptions, normalizeAnswerOption } from './answer-option.util';

describe('normalizeAnswerOption', () => {
    it('keeps a normal label and value, trimmed', () => {
        // Act & Assert
        expect(normalizeAnswerOption({ label: ' ghế ', value: ' ghế ' })).toEqual({ label: 'ghế', value: 'ghế' });
    });

    it('uses the label as the value when the value is empty', () => {
        // Act & Assert
        expect(normalizeAnswerOption({ label: 'bàn', value: '   ' })).toEqual({ label: 'bàn', value: 'bàn' });
    });

    it('replaces a placeholder label (A-D, correct_answer, wrong_option_N) with the value', () => {
        // Act & Assert
        expect(normalizeAnswerOption({ label: 'B', value: 'cái ghế' })).toEqual({ label: 'cái ghế', value: 'cái ghế' });
        expect(normalizeAnswerOption({ label: 'wrong_option_2', value: 'bàn' })).toEqual({ label: 'bàn', value: 'bàn' });
    });
});

describe('hasCorrectAnswerInOptions', () => {
    const options = [
        { label: 'ghế', value: 'ghế' },
        { label: 'bàn', value: 'bàn' },
    ];

    it('returns true when the correct answer matches an option value', () => {
        // Act & Assert
        expect(hasCorrectAnswerInOptions(' ghế ', options)).toBe(true);
    });

    it('returns false when the correct answer is not among the options', () => {
        // Act & Assert
        expect(hasCorrectAnswerInOptions('giường', options)).toBe(false);
    });
});
