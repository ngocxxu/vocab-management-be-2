import { capItemsToBytes } from './response-cap.util';

describe('capItemsToBytes', () => {
    it('keeps every item when the list fits', () => {
        const items = [{ a: 1 }, { a: 2 }];

        const result = capItemsToBytes(items, 1024);

        expect(result).toEqual({ items, truncated: false });
    });

    it('drops trailing items until the JSON fits and reports truncation', () => {
        const items = Array.from({ length: 10 }, (_, index) => ({ text: 'x'.repeat(100), index }));

        const result = capItemsToBytes(items, 400);

        expect(Buffer.byteLength(JSON.stringify(result.items))).toBeLessThanOrEqual(400);
        expect(result.items).toEqual(items.slice(0, result.items.length));
        expect(result.truncated).toBe(true);
    });

    it('always keeps the first item, even when it alone is too large', () => {
        const items = [{ text: 'x'.repeat(500) }, { text: 'y' }];

        const result = capItemsToBytes(items, 100);

        expect(result.items).toEqual([items[0]]);
        expect(result.truncated).toBe(true);
    });
});
