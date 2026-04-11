import { REMINDER_CONFIG } from '../config/reminder.config';

export function addUtcDays(base: Date, days: number): Date {
    const d = new Date(base.getTime());
    d.setUTCDate(d.getUTCDate() + days);
    return d;
}

export function computeBackoffMs(attempt: number): number {
    const { baseDelayMs, maxDelayMs, multiplier, jitterFactor } = REMINDER_CONFIG.retry;
    const raw = Math.min(maxDelayMs, baseDelayMs * Math.pow(multiplier, Math.max(0, attempt - 1)));
    const jitter = raw * jitterFactor * (Math.random() * 2 - 1);
    return Math.max(5_000, Math.floor(raw + jitter));
}
