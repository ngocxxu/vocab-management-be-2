import { checkAnswer } from './fsrs-answer-check.util';

const text = (segments: Array<{ type: string; text: string }>, type: string): string =>
    segments
        .filter((s) => s.type === type)
        .map((s) => s.text)
        .join('');

describe('checkAnswer', () => {
    test('an exact answer suggests Good and shows no difference', () => {
        // Act
        const result = checkAnswer('hello', ['hello']);

        // Assert
        expect(result.suggestedRating).toBe('GOOD');
        expect(result.correctAnswers).toEqual(['hello']);
        expect(result.diff).toEqual([{ type: 'same', text: 'hello' }]);
    });

    test('ignores case, surrounding spaces and punctuation, and repeated spaces', () => {
        // Act + Assert
        expect(checkAnswer('  Hello! ', ['hello']).suggestedRating).toBe('GOOD');
        expect(checkAnswer('good   morning', ['Good morning']).suggestedRating).toBe('GOOD');
    });

    test('one typo in a longer word suggests Hard and shows what is missing', () => {
        // Act
        const result = checkAnswer('helo', ['hello']);

        // Assert
        expect(result.suggestedRating).toBe('HARD');
        expect(text(result.diff, 'missing')).toBe('l');
        expect(text(result.diff, 'extra')).toBe('');
    });

    test('an extra letter is shown as extra', () => {
        // Act
        const result = checkAnswer('helllo', ['hello']);

        // Assert
        expect(result.suggestedRating).toBe('HARD');
        expect(text(result.diff, 'extra')).toBe('l');
    });

    test('missing diacritics count as a typo, not as wrong', () => {
        // Act
        const result = checkAnswer('xin chao', ['xin chào']);

        // Assert
        expect(result.suggestedRating).toBe('HARD');
    });

    test('a different word suggests Again', () => {
        // Act
        const result = checkAnswer('goodbye', ['hello']);

        // Assert
        expect(result.suggestedRating).toBe('AGAIN');
        expect(result.correctAnswers).toEqual(['hello']);
    });

    test('a short word is exact or wrong: one letter off is not a typo', () => {
        // Act + Assert
        expect(checkAnswer('cut', ['cat']).suggestedRating).toBe('AGAIN');
        expect(checkAnswer('cat', ['cat']).suggestedRating).toBe('GOOD');
    });

    test('a word with several translations accepts any of them', () => {
        // Arrange
        const accepted = ['xin chào', 'chào', 'alo'];

        // Act + Assert
        expect(checkAnswer('chào', accepted).suggestedRating).toBe('GOOD');
        expect(checkAnswer('alo', accepted).suggestedRating).toBe('GOOD');
        expect(checkAnswer('xin chaò', accepted).suggestedRating).toBe('HARD');
        expect(checkAnswer('tạm biệt', accepted).suggestedRating).toBe('AGAIN');
        expect(checkAnswer('alo', accepted).correctAnswers).toEqual(accepted);
    });

    test('the diff is against the closest accepted answer', () => {
        // Act
        const result = checkAnswer('alloo', ['xin chào', 'allo']);

        // Assert
        expect(text(result.diff, 'missing')).toBe('');
        expect(text(result.diff, 'extra')).toBe('o');
    });

    test('a long word tolerates two typos but not three', () => {
        // Act + Assert
        expect(checkAnswer('acommodaton', ['accommodation']).suggestedRating).toBe('HARD');
        expect(checkAnswer('acomodaton', ['accommodation']).suggestedRating).toBe('AGAIN');
    });

    test('an empty answer suggests Again and everything is missing', () => {
        // Act
        const result = checkAnswer('   ', ['hello']);

        // Assert
        expect(result.suggestedRating).toBe('AGAIN');
        expect(text(result.diff, 'missing')).toBe('hello');
    });
});
