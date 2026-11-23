import { QuestionType } from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import { validate, ValidationError } from 'class-validator';
import { SubmitExamBodyInput } from './submit-exam.dto';

const fillInBlankWith = (content?: unknown) =>
    plainToInstance(SubmitExamBodyInput, {
        questionType: QuestionType.FILL_IN_THE_BLANK,
        wordTestInputs: [{ userAnswer: 'uno', systemAnswer: 'one', ...(content === undefined ? {} : { content }) }],
    });

const flatten = (errors: ValidationError[]): ValidationError[] => errors.flatMap((error) => [error, ...flatten(error.children ?? [])]);

const contentErrorOf = (errors: ValidationError[]) => flatten(errors).find((error) => error.property === 'content');

describe('SubmitExamBodyInput fill-in-blank content (#17)', () => {
    test('accepts an answer without content, as old clients send it', async () => {
        // Arrange
        const body = fillInBlankWith();

        // Act
        const errors = await validate(body);

        // Assert
        expect(errors).toHaveLength(0);
        expect(body.wordTestInputs?.[0].content).toBeUndefined();
    });

    test('accepts content of exactly 500 characters', async () => {
        // Act
        const errors = await validate(fillInBlankWith('a'.repeat(500)));

        // Assert
        expect(errors).toHaveLength(0);
    });

    test('rejects content longer than 500 characters', async () => {
        // Act
        const errors = await validate(fillInBlankWith('a'.repeat(501)));

        // Assert
        expect(contentErrorOf(errors)).toBeDefined();
    });

    test('trims the content before it is stored', async () => {
        // Arrange
        const body = fillInBlankWith('   What is "one"?   ');

        // Act
        const errors = await validate(body);

        // Assert
        expect(errors).toHaveLength(0);
        expect(body.wordTestInputs?.[0].content).toBe('What is "one"?');
    });

    test('checks the 500-character limit after trimming', async () => {
        // Act
        const errors = await validate(fillInBlankWith(` ${'a'.repeat(500)} `));

        // Assert
        expect(errors).toHaveLength(0);
    });

    test('rejects content that is not a string', async () => {
        // Act
        const errors = await validate(fillInBlankWith(42));

        // Assert
        expect(contentErrorOf(errors)).toBeDefined();
    });
});
