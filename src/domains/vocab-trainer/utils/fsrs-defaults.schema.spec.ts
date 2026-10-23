import { srsDefaultsSchema } from './fsrs-defaults.schema';

const base = { desiredRetention: 0.9, questionType: 'FLIP_CARD', reminderEnabled: true };

describe('srsDefaultsSchema: Random direction', () => {
    test('Random alone is an accepted list of directions', () => {
        // Act + Assert
        expect(srsDefaultsSchema.safeParse({ ...base, directions: ['RANDOM'] }).success).toBe(true);
    });

    test('Random cannot be combined with another direction', () => {
        // Act + Assert
        expect(srsDefaultsSchema.safeParse({ ...base, directions: ['RANDOM', 'SOURCE_TO_TARGET'] }).success).toBe(false);
    });
});
