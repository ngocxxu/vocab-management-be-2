export const OUT_OF_SCOPE_MARKER = 'OUT_OF_SCOPE';

/**
 * True when the whole reply is the out-of-scope marker, ignoring case, spaces and wrapping punctuation.
 * A reply that only mentions the marker inside a longer sentence is not a match.
 */
export function isOutOfScopeMarker(content: string | null | undefined): boolean {
    if (!content) return false;

    const normalized = content.trim().replace(/^["'`([{<]+|["'`)\]}>.!?]+$/g, '');

    return normalized.toUpperCase() === OUT_OF_SCOPE_MARKER;
}
