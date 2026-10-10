import type { FsrsRating } from '@prisma/client';

export type AnswerDiffSegment = { type: 'same' | 'missing' | 'extra'; text: string };

export type AnswerCheck = {
    /** Every accepted answer, as stored, so the UI can show them after the user answered. */
    correctAnswers: string[];
    /** Typed answer against the closest accepted answer, on the normalised text (lower case, no edge punctuation). */
    diff: AnswerDiffSegment[];
    suggestedRating: Extract<FsrsRating, 'AGAIN' | 'HARD' | 'GOOD'>;
};

const EDGE_PUNCTUATION = /^[\s.,!?;:"'“”‘’()[\]-]+|[\s.,!?;:"'“”‘’()[\]-]+$/g;

// A longer word can have more typos before it is simply another word.
const SHORT_WORD_LENGTH = 3;
const MEDIUM_WORD_LENGTH = 7;

function normalize(value: string): string {
    return value.normalize('NFC').toLowerCase().replace(/\s+/g, ' ').replace(EDGE_PUNCTUATION, '');
}

function stripDiacritics(value: string): string {
    return value.normalize('NFD').replace(/\p{M}/gu, '').replace(/đ/g, 'd');
}

function typoTolerance(expected: string): number {
    const length = Array.from(expected).length;
    if (length <= SHORT_WORD_LENGTH) {
        return 0;
    }

    return length <= MEDIUM_WORD_LENGTH ? 1 : 2;
}

function editDistance(a: string[], b: string[]): number {
    let previous = Array.from({ length: b.length + 1 }, (_, j) => j);
    for (let i = 1; i <= a.length; i++) {
        const current = [i];
        for (let j = 1; j <= b.length; j++) {
            const substitution = previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1);
            current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, substitution);
        }
        previous = current;
    }

    return previous[b.length];
}

function diffChars(answer: string[], expected: string[]): AnswerDiffSegment[] {
    const lcs = Array.from({ length: answer.length + 1 }, () => new Array<number>(expected.length + 1).fill(0));
    for (let i = 1; i <= answer.length; i++) {
        for (let j = 1; j <= expected.length; j++) {
            lcs[i][j] = answer[i - 1] === expected[j - 1] ? lcs[i - 1][j - 1] + 1 : Math.max(lcs[i - 1][j], lcs[i][j - 1]);
        }
    }

    const reversed: AnswerDiffSegment[] = [];
    let answerEnd = answer.length;
    let expectedEnd = expected.length;
    while (answerEnd > 0 || expectedEnd > 0) {
        if (answerEnd > 0 && expectedEnd > 0 && answer[answerEnd - 1] === expected[expectedEnd - 1]) {
            reversed.push({ type: 'same', text: expected[expectedEnd - 1] });
            answerEnd--;
            expectedEnd--;
        } else if (expectedEnd > 0 && (answerEnd === 0 || lcs[answerEnd][expectedEnd - 1] >= lcs[answerEnd - 1][expectedEnd])) {
            reversed.push({ type: 'missing', text: expected[expectedEnd - 1] });
            expectedEnd--;
        } else {
            reversed.push({ type: 'extra', text: answer[answerEnd - 1] });
            answerEnd--;
        }
    }

    return reversed.reverse().reduce<AnswerDiffSegment[]>((segments, segment) => {
        const last = segments[segments.length - 1];
        if (last?.type === segment.type) {
            last.text += segment.text;
        } else {
            segments.push({ ...segment });
        }

        return segments;
    }, []);
}

function suggestRating(typed: string, candidates: string[], distances: number[]): AnswerCheck['suggestedRating'] {
    if (typed === '') {
        return 'AGAIN';
    }
    if (candidates.includes(typed)) {
        return 'GOOD';
    }

    const typedWithoutDiacritics = stripDiacritics(typed);
    const isTypo = candidates.some((candidate, index) => stripDiacritics(candidate) === typedWithoutDiacritics || distances[index] <= typoTolerance(candidate));

    return isTypo ? 'HARD' : 'AGAIN';
}

/**
 * Compares a typed answer with every accepted answer, no AI involved. The suggestion is only a default for the rating
 * buttons: exact (ignoring case, spaces and edge punctuation) is Good, a typo or missing diacritics is Hard, anything
 * else is Again. The user's own click is what gets recorded.
 */
export function checkAnswer(answer: string, acceptedAnswers: string[]): AnswerCheck {
    const typed = normalize(answer);
    const candidates = acceptedAnswers.map(normalize);
    const typedChars = Array.from(typed);

    const distances = candidates.map((candidate) => editDistance(typedChars, Array.from(candidate)));
    const closest = distances.indexOf(Math.min(...distances));
    const expected = candidates[closest] ?? '';

    return { correctAnswers: acceptedAnswers, diff: diffChars(typedChars, Array.from(expected)), suggestedRating: suggestRating(typed, candidates, distances) };
}
