export function normalizeSubjectName(raw: string): string {
    return raw
        .trim()
        .replace(/[^\p{L}\p{N}\s]/gu, '')
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/\S+/g, (word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase());
}
