import { BadRequestException } from '@nestjs/common';
import { FsrsDefaultsService } from './fsrs-defaults.service';

describe('FsrsDefaultsService', () => {
    const store = new Map<string, unknown>();
    // A fake ConfigService that keeps the values in memory. These functions have nothing to await, which rules out `async`.
    const configService = {
        // eslint-disable-next-line @typescript-eslint/promise-function-async
        getConfig: jest.fn((_userId: string | null, key: string) => Promise.resolve(store.get(key) ?? null)),
        // eslint-disable-next-line @typescript-eslint/promise-function-async
        setUserConfig: jest.fn((_userId: string, key: string, value: unknown) => {
            store.set(key, value);

            return Promise.resolve();
        }),
    };
    const service = new FsrsDefaultsService(configService as never);

    const SYSTEM = { desiredRetention: 0.9, directions: ['SOURCE_TO_TARGET', 'TARGET_TO_SOURCE'], questionType: 'FLIP_CARD', reminderEnabled: true };

    beforeEach(() => {
        store.clear();
        jest.clearAllMocks();
    });

    describe('getSettings', () => {
        test('falls back to the system defaults when nothing is stored', async () => {
            // Act
            const settings = await service.getSettings('u1');

            // Assert
            expect(settings).toEqual({ defaults: SYSTEM, timezone: null });
        });

        test('uses what the user stored and keeps the system default for a missing field', async () => {
            // Arrange
            store.set('srs.defaults', { desiredRetention: 0.85, directions: ['TARGET_TO_SOURCE'] });
            store.set('srs.timezone', 'America/Los_Angeles');

            // Act
            const settings = await service.getSettings('u1');

            // Assert
            expect(settings.defaults).toEqual({ ...SYSTEM, desiredRetention: 0.85, directions: ['TARGET_TO_SOURCE'] });
            expect(settings.timezone).toBe('America/Los_Angeles');
        });

        test.each([
            ['a string', 'oops'],
            ['a retention out of range', { desiredRetention: 5 }],
            ['an empty direction list', { directions: [] }],
            ['an unknown key', { desiredRetention: 0.8, surprise: true }],
        ])('a stored value that is %s never breaks the app: the system defaults are used', async (_name, stored) => {
            // Arrange
            store.set('srs.defaults', stored);
            store.set('srs.timezone', 'Mars/Olympus');

            // Act
            const settings = await service.getSettings('u1');

            // Assert
            expect(settings).toEqual({ defaults: SYSTEM, timezone: null });
        });
    });

    describe('updateSettings', () => {
        test('saves the defaults and the timezone', async () => {
            // Act
            const settings = await service.updateSettings('u1', { defaults: { desiredRetention: 0.8, questionType: 'FILL_IN_THE_BLANK' }, timezone: 'Asia/Tokyo' });

            // Assert
            expect(settings.defaults).toEqual({ ...SYSTEM, desiredRetention: 0.8, questionType: 'FILL_IN_THE_BLANK' });
            expect(settings.timezone).toBe('Asia/Tokyo');
            expect(store.get('srs.timezone')).toBe('Asia/Tokyo');
            expect(await service.getSettings('u1')).toEqual(settings);
        });

        test('a partial update keeps the values saved before', async () => {
            // Arrange
            await service.updateSettings('u1', { defaults: { desiredRetention: 0.8, reminderEnabled: false } });

            // Act
            const settings = await service.updateSettings('u1', { defaults: { directions: ['SOURCE_TO_TARGET'] } });

            // Assert
            expect(settings.defaults).toEqual({ ...SYSTEM, desiredRetention: 0.8, reminderEnabled: false, directions: ['SOURCE_TO_TARGET'] });
        });

        test.each([
            ['a retention below 0.70', { defaults: { desiredRetention: 0.5 } }],
            ['a retention above 0.97', { defaults: { desiredRetention: 0.99 } }],
            ['no direction', { defaults: { directions: [] } }],
            ['a repeated direction', { defaults: { directions: ['SOURCE_TO_TARGET', 'SOURCE_TO_TARGET'] } }],
            ['a question type FSRS cannot review', { defaults: { questionType: 'MULTIPLE_CHOICE' } }],
            ['an unknown field', { defaults: { weights: [1, 2, 3] } }],
            ['a timezone that does not exist', { timezone: 'Mars/Olympus' }],
        ])('rejects %s and saves nothing', async (_name, input) => {
            // Act
            const attempt = service.updateSettings('u1', input as never);

            // Assert
            await expect(attempt).rejects.toBeInstanceOf(BadRequestException);
            expect(configService.setUserConfig).not.toHaveBeenCalled();
        });
    });

    describe('resolveForCreate', () => {
        test('fills what the create request left out from the defaults of the user', async () => {
            // Arrange
            store.set('srs.defaults', { desiredRetention: 0.85, directions: ['TARGET_TO_SOURCE'], reminderEnabled: false });

            // Act
            const resolved = await service.resolveForCreate('u1', {});

            // Assert
            expect(resolved).toEqual({ fsrsDesiredRetention: 0.85, fsrsDirections: ['TARGET_TO_SOURCE'], reminderDisabled: true });
        });

        test('what the request carries wins over the defaults', async () => {
            // Arrange
            store.set('srs.defaults', { desiredRetention: 0.85, directions: ['TARGET_TO_SOURCE'], reminderEnabled: false });

            // Act
            const resolved = await service.resolveForCreate('u1', { fsrsDesiredRetention: 0.95, fsrsDirections: ['SOURCE_TO_TARGET'], reminderDisabled: false });

            // Assert
            expect(resolved).toEqual({ fsrsDesiredRetention: 0.95, fsrsDirections: ['SOURCE_TO_TARGET'], reminderDisabled: false });
        });

        test('uses the system defaults when the user has none', async () => {
            // Act
            const resolved = await service.resolveForCreate('u1', {});

            // Assert
            expect(resolved).toEqual({ fsrsDesiredRetention: 0.9, fsrsDirections: ['SOURCE_TO_TARGET', 'TARGET_TO_SOURCE'], reminderDisabled: false });
        });
    });
});
