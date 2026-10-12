/** Rows grouped by their source and target language codes. `count` is how many rows the group holds. */
export type TLanguageUsagePair = {
    sourceLanguageCode: string;
    targetLanguageCode: string;
    count: number;
};

/** How many vocabs and language folders use one language, as source or target. */
export type TLanguageUsage = {
    vocabCount: number;
    folderCount: number;
};

/**
 * Rows that use `code` on either side. A group is counted once however many sides hold the code,
 * so a row with the same language as source and target is not counted twice.
 */
export function countUsageForCode(pairs: readonly TLanguageUsagePair[], code: string): number {
    return pairs.filter((pair) => pair.sourceLanguageCode === code || pair.targetLanguageCode === code).reduce((total, pair) => total + pair.count, 0);
}
