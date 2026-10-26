/**
 * Drops trailing items until the JSON of the list fits in `maxBytes`. The first item always stays,
 * so a single oversized item is left for the caller to refuse.
 */
export function capItemsToBytes<T>(items: readonly T[], maxBytes: number): { items: T[]; truncated: boolean } {
    let kept = [...items];
    // ponytail: re-serialises per dropped item. The lists are at most 20 long; use a running size if that ever grows.
    while (kept.length > 1 && Buffer.byteLength(JSON.stringify(kept)) > maxBytes) {
        kept = kept.slice(0, -1);
    }
    return { items: kept, truncated: kept.length < items.length };
}
