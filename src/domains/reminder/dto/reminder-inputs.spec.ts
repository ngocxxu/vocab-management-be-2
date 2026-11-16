import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { EEmailTemplate } from '../utils';
import { RecurringReminderInput } from './recurring-reminder.input';
import { SendReminderInput } from './send-reminder.input';

const examInput = {
    userEmail: 'ada@example.com',
    reminderType: 'Vocab Trainer',
    templateName: EEmailTemplate.EXAM_REMINDER,
    data: { firstName: 'Ada', lastName: 'Lovelace', testName: 'Test 1', repeatDays: '1', examUrl: 'https://app.example/exam' },
};

/** Runs class-validator on the plain input and returns the names of the properties that fail. */
async function failingProperties<T extends object>(type: new () => T, input: object): Promise<string[]> {
    const errors = await validate(plainToInstance(type, input));
    return errors.map((error) => error.property);
}

describe('SendReminderInput data', () => {
    test('accepts only the fields the template reads', async () => {
        // Act
        const failing = await failingProperties(SendReminderInput, examInput);

        // Assert
        expect(failing).toEqual([]);
    });

    test('rejects a field the template does not read', async () => {
        // Arrange
        const input = { ...examInput, data: { ...examInput.data, evil: '<script>' } };

        // Act
        const failing = await failingProperties(SendReminderInput, input);

        // Assert
        expect(failing).toEqual(['data']);
    });

    test('rejects an object as a value', async () => {
        // Arrange
        const input = { ...examInput, data: { ...examInput.data, firstName: { nested: true } } };

        // Act
        const failing = await failingProperties(SendReminderInput, input);

        // Assert
        expect(failing).toEqual(['data']);
    });

    test('rejects a string longer than 2000 characters', async () => {
        // Arrange
        const input = { ...examInput, data: { ...examInput.data, testName: 'x'.repeat(2001) } };

        // Act
        const failing = await failingProperties(SendReminderInput, input);

        // Assert
        expect(failing).toEqual(['data']);
    });

    test('rejects a template that has no renderer', async () => {
        // Arrange
        const input = { ...examInput, templateName: EEmailTemplate.PASSWORD_RESET, data: { resetUrl: 'https://app.example/reset' } };

        // Act
        const failing = await failingProperties(SendReminderInput, input);

        // Assert
        expect(failing).toEqual(['data']);
    });
});

describe('RecurringReminderInput cronPattern', () => {
    test.each(['0 9 * * *', '30 8 * * 1-5', '0 */2 * * *'])('accepts %s, which runs at most once an hour', async (cronPattern) => {
        // Act
        const failing = await failingProperties(RecurringReminderInput, { ...examInput, cronPattern });

        // Assert
        expect(failing).toEqual([]);
    });

    test.each(['*/5 * * * *', '0,30 * * * *', '* * * * *', '60 9 * * *', '0 9 * *', 'every day'])('rejects %s', async (cronPattern) => {
        // Act
        const failing = await failingProperties(RecurringReminderInput, { ...examInput, cronPattern });

        // Assert
        expect(failing).toEqual(['cronPattern']);
    });
});
