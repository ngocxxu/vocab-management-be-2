import { VocabTrainerController } from './vocab-trainer.controller';

// The 429 itself comes from UserThrottlerGuard (src/shared/guards/user-throttler.guard.integration.spec.ts). This spec keeps the
// throttle limits on the routes that must stay throttled, so a refactor cannot remove them without a failing test.
const LIMIT_KEY = 'THROTTLER:LIMITdefault';

describe('VocabTrainerController throttled routes', () => {
    const limitOf = (handler: unknown): number | undefined => {
        const limit: unknown = Reflect.getMetadata(LIMIT_KEY, handler as object);
        return typeof limit === 'number' ? limit : undefined;
    };

    test.each([
        ['findOneAndExam', 20],
        ['getExamJobStatus', 30],
        ['getReviewQueue', 30],
        ['getReviewSummary', 60],
        ['getReviewStats', 30],
        ['answerReview', 120],
        ['checkReviewAnswer', 120],
        ['clone', 10],
    ])('%s keeps its limit of %i per minute', (method, limit) => {
        expect(limitOf(Reflect.get(VocabTrainerController.prototype, method))).toBe(limit);
    });

    test('the reminder-prompt route is not throttled (it is a single cheap write)', () => {
        expect(limitOf(Reflect.get(VocabTrainerController.prototype, 'answerReminderPrompt'))).toBeUndefined();
    });
});
