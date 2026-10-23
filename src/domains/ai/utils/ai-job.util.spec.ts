import { AiCallTimeoutError, classifyAiJobFailure, StaleAiJobError, withAiCallTimeout } from './ai-job.util';

describe('ai-job.util', () => {
    describe('withAiCallTimeout', () => {
        afterEach(() => {
            jest.useRealTimers();
        });

        test('returns the value when the call settles in time', async () => {
            // Act
            const result = await withAiCallTimeout(Promise.resolve('ok'), 'call', 50);

            // Assert
            expect(result).toBe('ok');
        });

        test('rejects with AiCallTimeoutError when the call never settles', async () => {
            // Arrange
            jest.useFakeTimers();
            const hung = new Promise<string>(() => undefined);

            // Act
            const pending = withAiCallTimeout(hung, 'Gemini call', 1000);
            const assertion = expect(pending).rejects.toBeInstanceOf(AiCallTimeoutError);
            await jest.advanceTimersByTimeAsync(1000);

            // Assert
            await assertion;
        });

        test('propagates the original error when the call fails first', async () => {
            // Act + Assert
            await expect(withAiCallTimeout(Promise.reject(new Error('boom')), 'call', 50)).rejects.toThrow('boom');
        });
    });

    describe('classifyAiJobFailure', () => {
        const job = (attemptsMade: number, attempts = 3): Parameters<typeof classifyAiJobFailure>[0] => ({ attemptsMade, opts: { attempts } }) as never;

        test('is neither permanent nor final on an early attempt', () => {
            expect(classifyAiJobFailure(job(0), new Error('flaky'))).toEqual({ permanent: false, finalAttempt: false });
        });

        test('is final, not permanent, on the last attempt', () => {
            expect(classifyAiJobFailure(job(2), new Error('flaky'))).toEqual({ permanent: false, finalAttempt: true });
        });

        test('treats a rate limit as permanent and final even on the first attempt', () => {
            expect(classifyAiJobFailure(job(0), new Error('[429 Too Many Requests] slow down'))).toEqual({ permanent: true, finalAttempt: true });
        });

        test('treats a stale job as permanent and final', () => {
            expect(classifyAiJobFailure(job(0), new StaleAiJobError('j1', 'u1'))).toEqual({ permanent: true, finalAttempt: true });
        });

        test('defaults to a single attempt when the job has no attempts option', () => {
            expect(classifyAiJobFailure({ attemptsMade: 0, opts: {} } as never, new Error('x'))).toEqual({ permanent: false, finalAttempt: true });
        });
    });
});
