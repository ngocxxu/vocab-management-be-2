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
    poller: {
        intervalMs: 5_000,
        batchSize: 50,
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
