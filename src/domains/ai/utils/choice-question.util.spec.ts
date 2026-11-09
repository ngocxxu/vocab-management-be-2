import { buildChoiceQuestions, isAiChoiceItem } from './choice-question.util';

const validItem = {
    vocabIndex: 0,
    content: 'Please sit on the ___.',
    options: [
        { label: ' chair ', value: ' chair ' },
        { label: 'table', value: 'table' },
    ],
    correctAnswer: 'chair',
};

describe('buildChoiceQuestions', () => {
    it('keeps an item whose correct answer is among the options, with trimmed options', () => {
        // Act
        const { questions, droppedQuestions } = buildChoiceQuestions([validItem], 1);

        // Assert
        expect(droppedQuestions).toEqual([]);
        expect(questions).toHaveLength(1);
        expect(questions[0].options.map((option) => option.value).sort()).toEqual(['chair', 'table']);
    });

    it('drops an item whose correct answer is not among the options and reports it', () => {
        // Act
        const { questions, droppedQuestions } = buildChoiceQuestions([{ ...validItem, correctAnswer: 'lamp' }], 1);

        // Assert
        expect(questions).toEqual([]);
        expect(droppedQuestions).toEqual([{ vocabIndex: 0, reason: 'correct answer is not among options' }]);
    });

    it('drops an item that points at a vocab outside the batch', () => {
        // Act
        const { questions, droppedQuestions } = buildChoiceQuestions([{ ...validItem, vocabIndex: 5 }], 1);

        // Assert
        expect(questions).toEqual([]);
        expect(droppedQuestions).toEqual([{ vocabIndex: 5, reason: 'vocab index out of range' }]);
    });
});

describe('isAiChoiceItem', () => {
    it('accepts an item with string labels and values', () => {
        // Act & Assert
        expect(isAiChoiceItem(validItem)).toBe(true);
    });

    it('rejects an item whose option value is not a string', () => {
        // Act & Assert
        expect(isAiChoiceItem({ ...validItem, options: [{ label: 'chair', value: 1 }] })).toBe(false);
    });

    it('rejects an item without options', () => {
        // Act & Assert
        expect(isAiChoiceItem({ vocabIndex: 0, content: 'x', correctAnswer: 'x' })).toBe(false);
    });
});
