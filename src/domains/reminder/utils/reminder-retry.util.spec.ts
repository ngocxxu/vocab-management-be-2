import { REMINDER_CONFIG } from '../config/reminder.config';
import { decideReminderRetry } from './reminder-retry.util';

describe('decideReminderRetry', () => {
    const now = new Date('2026-11-16T10:00:00.000Z');

    it('sends a first failure back for another attempt, not terminal', () => {
        // Act
        const decision = decideReminderRetry(0, now);

        // Assert
        expect(decision.nextAttempt).toBe(1);
        expect(decision.terminal).toBe(false);
        expect(decision.nextAttemptAt.getTime()).toBeGreaterThan(now.getTime());
    });

    it('is terminal when the next attempt reaches the maximum', () => {
        // Act
        const decision = decideReminderRetry(REMINDER_CONFIG.retry.maxAttempts - 1, now);

        // Assert
        expect(decision.nextAttempt).toBe(REMINDER_CONFIG.retry.maxAttempts);
        expect(decision.terminal).toBe(true);
    });

    it('is terminal when the caller says the failure cannot be retried', () => {
        // Act
        const decision = decideReminderRetry(0, now, true);

        // Assert
        expect(decision.terminal).toBe(true);
        expect(decision.nextAttempt).toBe(1);
    });
});
