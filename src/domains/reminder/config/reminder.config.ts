export const REMINDER_CONFIG = {
    chain: {
        maxCycles: 30,
        initialDelayDays: 2,
    },
    escalation: {
        maxEscalations: 3,
        intervalDays: 1,
        enabledTemplates: ['exam_reminder'] as const,
    },
    fsrs: {
        // Stop after this many reminders in a row without a review; the next review starts them again.
        maxIgnoredInRow: 3,
        // The review day starts at 04:00 local time; the email goes out this many hours later (09:00).
        sendHoursAfterDayStart: 5,
    },
    poller: {
        intervalMs: 10_000,
        batchSize: 30,
        lockTimeoutMs: 180_000,
    },
    retry: {
        maxAttempts: 3,
        baseDelayMs: 30_000,
        maxDelayMs: 600_000,
        multiplier: 2,
        jitterFactor: 0.2,
    },
    reconciliation: {
        intervalMs: 60_000,
        staleClaimedAfterMs: 180_000,
        missingEscalationAfterMs: 3_600_000,
    },
} as const;

export const ESCALATION_CONFIG = {
    maxEscalations: 3,
    escalationIntervalDays: 1,
    enabledTemplates: ['exam_reminder'] as const,
    overrides: {
        exam_reminder: { maxEscalations: 3, escalationIntervalDays: 1 },
    },
} as const;
