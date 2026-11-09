import { resolveIsCorrect } from './ai-fill-in-blank-grading.service';

describe('resolveIsCorrect', () => {
    it('keeps the verdict for a correct answer with no difference label', () => {
        // Act & Assert
        expect(resolveIsCorrect({ answerIndex: 0, isCorrect: true }, false)).toBe(true);
    });

    it('marks an answer INCORRECT when its difference is a wrong word or a meaning change, even if the model said CORRECT', () => {
        // Act & Assert
        expect(resolveIsCorrect({ answerIndex: 0, isCorrect: true, difference: 'wrong_word' }, true)).toBe(false);
        expect(resolveIsCorrect({ answerIndex: 0, isCorrect: true, difference: 'meaning_change' }, true)).toBe(false);
    });

    it('accepts a misspelling only for Latin-script answers', () => {
        // Act & Assert
        expect(resolveIsCorrect({ answerIndex: 0, isCorrect: true, difference: 'misspelling' }, true)).toBe(true);
        expect(resolveIsCorrect({ answerIndex: 0, isCorrect: true, difference: 'misspelling' }, false)).toBe(false);
    });

    it('accepts a grammar variant for a non-Latin answer', () => {
        // Act & Assert
        expect(resolveIsCorrect({ answerIndex: 0, isCorrect: true, difference: 'grammar_variant' }, false)).toBe(true);
    });

    it('keeps INCORRECT when the model said so', () => {
        // Act & Assert
        expect(resolveIsCorrect({ answerIndex: 0, isCorrect: false, difference: 'synonym' }, true)).toBe(false);
    });
});
