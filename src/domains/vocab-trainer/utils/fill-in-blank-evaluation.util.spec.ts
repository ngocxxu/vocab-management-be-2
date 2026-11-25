import type { VocabWithTextTargets } from './type.util';
import { toAnswerSubmissions, toFillInBlankEvaluations, toQuestionContent } from './fill-in-blank-evaluation.util';

const vocabWith = (id: string) => ({ id, textSource: id, textTargets: [] }) as unknown as VocabWithTextTargets;

describe('toQuestionContent (#17)', () => {
    test('trims the question text', () => {
        expect(toQuestionContent('  What is "one"?  ')).toBe('What is "one"?');
    });

    test('keeps the spaces inside the question text', () => {
        expect(toQuestionContent(' a  b ')).toBe('a  b');
    });

    test.each([[undefined], [null], [''], ['   ']])('returns null for %p', (value) => {
        expect(toQuestionContent(value)).toBeNull();
    });
});

describe('toAnswerSubmissions (#17)', () => {
    test('keeps every question with its content, and null when the client sent none', () => {
        // Arrange
        const answers = [
            { userAnswer: 'uno', systemAnswer: 'one', content: ' What is "one"? ' },
            { userAnswer: 'dos', systemAnswer: 'two' },
        ];

        // Act
        const stored = toAnswerSubmissions(answers);

        // Assert
        expect(stored).toEqual([
            { userAnswer: 'uno', systemAnswer: 'one', content: 'What is "one"?' },
            { userAnswer: 'dos', systemAnswer: 'two', content: null },
        ]);
    });
});

describe('toFillInBlankEvaluations (#17)', () => {
    test('carries the content of each matched answer and keeps the grading fields', () => {
        // Arrange
        const items = [
            {
                answerSubmission: { userAnswer: 'uno', systemAnswer: 'one', content: 'What is "one"?' },
                vocab: vocabWith('v1'),
                answerType: 'textTarget' as const,
            },
            {
                answerSubmission: { userAnswer: 'dos', systemAnswer: 'two' },
                vocab: vocabWith('v2'),
                answerType: 'textSource' as const,
            },
        ];

        // Act
        const evaluations = toFillInBlankEvaluations(items);

        // Assert
        expect(evaluations[0]).toMatchObject({ userAnswer: 'uno', systemAnswer: 'one', questionType: 'textTarget', vocabId: 'v1', content: 'What is "one"?' });
        expect(evaluations[1]).toMatchObject({ userAnswer: 'dos', systemAnswer: 'two', questionType: 'textSource', vocabId: 'v2', content: null });
    });
});
