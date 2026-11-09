/**
 * Returns the item list from an AI reply: a bare array, or an object `{ "items": [...] }`.
 * JSON mode needs an object at the top level, so list prompts return `{ items }`.
 * Returns undefined when the reply has neither shape.
 */
export function findItemArray(value: unknown): unknown[] | undefined {
    if (Array.isArray(value)) {
        return value as unknown[];
    }

    if (value && typeof value === 'object' && Array.isArray((value as { items?: unknown }).items)) {
        return (value as { items: unknown[] }).items;
    }

    return undefined;
}

/**
 * Unwraps an AI list reply and checks every item with `isItem`.
 * Throws when there is no list or an item has the wrong shape, so bad output fails the job
 * instead of being used as if it were valid.
 */
export function unwrapItems<T>(value: unknown, isItem: (item: unknown) => item is T): T[] {
    const items = findItemArray(value);
    if (!items) {
        throw new Error('AI reply is neither a JSON array nor an object with an items array');
    }

    const validItems: T[] = [];
    for (const item of items) {
        if (!isItem(item)) {
            throw new Error('AI reply contains an item with an unexpected shape');
        }
        validItems.push(item);
    }

    return validItems;
}
