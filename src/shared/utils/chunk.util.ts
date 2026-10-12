/** Splits `items` into consecutive groups of at most `size`. Only the last group can be shorter. */
export function chunk<T>(items: readonly T[], size: number): T[][] {
    if (size < 1) {
        throw new RangeError(`Chunk size must be at least 1, got ${size}`);
    }

    const groups: T[][] = [];
    for (let start = 0; start < items.length; start += size) {
        groups.push(items.slice(start, start + size));
    }

    return groups;
}
