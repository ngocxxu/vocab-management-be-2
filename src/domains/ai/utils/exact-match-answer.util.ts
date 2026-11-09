/**
 * Languages where a short answer (one word, no spaces) must match exactly.
 * Hardcoded on purpose for now (Q27 = B). Adding a language means editing this list.
 */
export const EXACT_MATCH_LANGUAGE_CODES: readonly string[] = ['th', 'ko'];

const MAX_EXACT_ANSWER_GRAPHEMES = 12;

function countGraphemes(text: string): number {
    return [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text)].length;
}

/**
 * Returns the accepted meanings when exact matching applies, otherwise null.
 * Applies only when the language is in the list and every meaning (comma-separated) is one short word.
 * Sentence-length answers return null and go to the AI grader.
 */
export function getExactMatchMeanings(languageCode: string, expectedAnswer: string): string[] | null {
    if (!EXACT_MATCH_LANGUAGE_CODES.includes(languageCode)) {
        return null;
    }

    const meanings = expectedAnswer
        .split(',')
        .map((meaning) => meaning.trim())
        .filter(Boolean);

    if (meanings.length === 0) {
        return null;
    }

    const isShortWord = (meaning: string): boolean => !/\s/.test(meaning) && countGraphemes(meaning) <= MAX_EXACT_ANSWER_GRAPHEMES;

    return meanings.every(isShortWord) ? meanings : null;
}
