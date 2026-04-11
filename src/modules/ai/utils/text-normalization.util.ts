export interface TypoCheckResult {
    isTypo: boolean;
    typoType?: 'substitution' | 'transposition' | 'duplication';
    confidence: number; // 0..1
}

const ZERO_WIDTH_RE = /[\u200B-\u200D\uFEFF]/g;

export function normalizeForCompare(input: string, opts?: { lowercase?: boolean }): string {
    const lowered = opts?.lowercase ? input.toLowerCase() : input;

    return lowered
        .normalize('NFC')
        .replace(ZERO_WIDTH_RE, '')
        .replace(/\u00A0/g, ' ')
        .trim()
        .replace(/\s+/g, ' ');
}

/**
 * Strict typo detection: only accept obvious, unambiguous typos.
 *
 * - Same length + exactly 1 char substitution
 * - Adjacent transposition
 * - Duplication of a neighboring character (length differs by 1)
 */
export function isObviousTypo(userInput: string, correctAnswer: string): TypoCheckResult {
    const a = userInput;
    const b = correctAnswer;

    if (!a || !b) {
        return { isTypo: false, confidence: 0 };
    }

    // Rule 1: Same length, single character substitution
    if (a.length === b.length) {
        let diffCount = 0;
        for (let i = 0; i < a.length; i++) {
            if (a[i] !== b[i]) {
                diffCount++;
                if (diffCount > 1) break;
            }
        }

        if (diffCount === 1) {
            return { isTypo: true, typoType: 'substitution', confidence: 0.8 };
        }
    }

    // Rule 2: Adjacent character transposition
    if (a.length === b.length && a.length > 1) {
        for (let i = 0; i < a.length - 1; i++) {
            if (
                a[i] === b[i + 1] &&
                a[i + 1] === b[i] &&
                a.slice(0, i) === b.slice(0, i) &&
                a.slice(i + 2) === b.slice(i + 2)
            ) {
                return { isTypo: true, typoType: 'transposition', confidence: 0.95 };
            }
        }
    }

    // Rule 3: Duplicate character (ONLY if 1 extra char and it duplicates neighbor)
    if (a.length === b.length + 1) {
        for (let i = 0; i < a.length; i++) {
            const removed = a.slice(0, i) + a.slice(i + 1);
            if (removed === b) {
                const removedChar = a[i];
                const hasDuplicateNeighbor =
                    (i > 0 && a[i - 1] === removedChar) ||
                    (i < a.length - 1 && a[i + 1] === removedChar);
                if (hasDuplicateNeighbor) {
                    return { isTypo: true, typoType: 'duplication', confidence: 0.85 };
                }
            }
        }
    }

    return { isTypo: false, confidence: 0 };
}
