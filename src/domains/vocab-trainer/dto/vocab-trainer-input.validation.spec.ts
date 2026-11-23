import { QuestionType, TrainerStatus } from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import { validate, ValidationError } from 'class-validator';
import { ReminderPromptInput } from './reminder-prompt.input';
import { VocabTrainerDeleteBulkInput } from './vocab-trainer-delete-bulk.input';
import { VocabTrainerInput } from './vocab-trainer.input';

const errorFor = (errors: ValidationError[], property: string): ValidationError | undefined => errors.find((error) => error.property === property);

const trainerWith = (overrides: Record<string, unknown>) =>
    plainToInstance(VocabTrainerInput, { name: 'Week 1', status: TrainerStatus.PENDING, questionType: QuestionType.MULTIPLE_CHOICE, ...overrides });

describe('VocabTrainerDeleteBulkInput', () => {
    test('rejects a bulk delete of more than 100 ids', async () => {
        // Arrange
        const body = plainToInstance(VocabTrainerDeleteBulkInput, { ids: Array.from({ length: 101 }, (_, index) => `t${index}`) });

        // Act
        const errors = await validate(body);

        // Assert
        expect(errorFor(errors, 'ids')).toBeDefined();
    });

    test('accepts exactly 100 ids', async () => {
        // Arrange
        const body = plainToInstance(VocabTrainerDeleteBulkInput, { ids: Array.from({ length: 100 }, (_, index) => `t${index}`) });

        // Act
        const errors = await validate(body);

        // Assert
        expect(errorFor(errors, 'ids')).toBeUndefined();
    });

    test('rejects an empty list', async () => {
        const errors = await validate(plainToInstance(VocabTrainerDeleteBulkInput, { ids: [] }));

        expect(errorFor(errors, 'ids')).toBeDefined();
    });
});

describe('VocabTrainerInput reminder ranges', () => {
    test.each([
        [{ reminderSpacingDays: 1 }, 'reminderSpacingDays', false],
        [{ reminderSpacingDays: 2 }, 'reminderSpacingDays', true],
        [{ reminderSpacingDays: 30 }, 'reminderSpacingDays', true],
        [{ reminderSpacingDays: 31 }, 'reminderSpacingDays', false],
        [{ reminderMaxRepeat: 2 }, 'reminderMaxRepeat', false],
        [{ reminderMaxRepeat: 3 }, 'reminderMaxRepeat', true],
        [{ reminderMaxRepeat: 20 }, 'reminderMaxRepeat', true],
        [{ reminderMaxRepeat: 21 }, 'reminderMaxRepeat', false],
    ])('%j is valid for %s: %s', async (overrides, property, valid) => {
        // Act
        const errors = await validate(trainerWith(overrides));

        // Assert
        expect(errorFor(errors, property) === undefined).toBe(valid);
    });

    test('status is optional, so an update that leaves it out is accepted', async () => {
        const errors = await validate(trainerWith({ status: undefined }));

        expect(errorFor(errors, 'status')).toBeUndefined();
    });
});

describe('ReminderPromptInput', () => {
    test('needs a boolean continueReminders', async () => {
        const missing = await validate(plainToInstance(ReminderPromptInput, {}));
        const wrongType = await validate(plainToInstance(ReminderPromptInput, { continueReminders: 'yes' }));
        const valid = await validate(plainToInstance(ReminderPromptInput, { continueReminders: false }));

        expect(errorFor(missing, 'continueReminders')).toBeDefined();
        expect(errorFor(wrongType, 'continueReminders')).toBeDefined();
        expect(valid).toHaveLength(0);
    });
});
