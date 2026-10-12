import { UserRole } from '@prisma/client';

/** -1 in a plan's limits means no cap. */
export const UNLIMITED_LIMIT = -1;

/** Largest accepted limit (int32). Keeps absurd values such as 1e21 out of the JSON column. */
export const MAX_PLAN_LIMIT = 2_147_483_647;

export const PLAN_LIMIT_KEYS = ['vocabPerDay', 'languageFolders', 'subjects', 'requestsPerMinute'] as const;

/** Keys that gate creation. requestsPerMinute is stored and documented, not enforced here. */
export type TQuotaLimitKey = 'vocabPerDay' | 'languageFolders' | 'subjects';

export type TPlanLimits = Partial<Record<(typeof PLAN_LIMIT_KEYS)[number], number>>;

/** Used when no active plan row exists or a key is missing or invalid. ADMIN is never read from a plan. */
export const DEFAULT_QUOTA_LIMITS: Record<UserRole, Record<TQuotaLimitKey, number>> = {
    [UserRole.ADMIN]: { vocabPerDay: UNLIMITED_LIMIT, languageFolders: UNLIMITED_LIMIT, subjects: UNLIMITED_LIMIT },
    [UserRole.MEMBER]: { vocabPerDay: UNLIMITED_LIMIT, languageFolders: UNLIMITED_LIMIT, subjects: UNLIMITED_LIMIT },
    [UserRole.GUEST]: { vocabPerDay: 20, languageFolders: 2, subjects: 5 },
};

function isValidLimit(value: unknown): value is number {
    return typeof value === 'number' && Number.isInteger(value) && value >= UNLIMITED_LIMIT && value <= MAX_PLAN_LIMIT;
}

/** Reads one stored quota limit. Returns undefined for a missing or invalid value so the caller applies its default. */
export function readQuotaLimit(stored: unknown, key: TQuotaLimitKey): number | undefined {
    if (typeof stored !== 'object' || stored === null) {
        return undefined;
    }
    const value = (stored as Record<string, unknown>)[key];

    return isValidLimit(value) ? value : undefined;
}

/** Keeps only the known keys that are set, so unknown keys never reach the JSON column. */
export function pickKnownPlanLimits(limits: object): TPlanLimits {
    const source = limits as Record<string, unknown>;
    const picked: Record<string, unknown> = {};

    for (const key of PLAN_LIMIT_KEYS) {
        if (source[key] !== undefined) {
            picked[key] = source[key];
        }
    }

    return picked as TPlanLimits;
}
