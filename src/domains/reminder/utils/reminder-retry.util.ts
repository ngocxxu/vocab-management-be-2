import { REMINDER_CONFIG } from '../config/reminder.config';
import { computeBackoffMs } from './reminder-date.util';

export interface ReminderRetryDecision {
    terminal: boolean;
    nextAttempt: number;
    nextAttemptAt: Date;
}

/**
 * The one retry rule for a failed reminder attempt. The next attempt is attempt + 1.
 * The row is terminal once that reaches the maximum, or when the caller says the failure cannot be retried.
 */
export function decideReminderRetry(attempt: number, now: Date, forceTerminal = false): ReminderRetryDecision {
    const nextAttempt = attempt + 1;

    return {
        terminal: forceTerminal || nextAttempt >= REMINDER_CONFIG.retry.maxAttempts,
        nextAttempt,
        nextAttemptAt: new Date(now.getTime() + computeBackoffMs(nextAttempt)),
    };
}
