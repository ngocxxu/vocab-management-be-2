import { chunk } from './chunk.util';

describe('chunk', () => {
    it('splits items into consecutive groups of the given size and keeps a shorter last group', () => {
        expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    });

    it('returns no groups for an empty list', () => {
        expect(chunk([], 500)).toEqual([]);
    });

    it('returns one group when the size is larger than the list', () => {
        expect(chunk(['a', 'b'], 500)).toEqual([['a', 'b']]);
    });

    it('does not change the list it was given', () => {
        const items = [1, 2, 3];

        chunk(items, 2);

        expect(items).toEqual([1, 2, 3]);
    });

    it('rejects a size below one, which would never finish splitting', () => {
        expect(() => chunk([1, 2], 0)).toThrow(RangeError);
    });
});
