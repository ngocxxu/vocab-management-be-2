import { findItemArray, unwrapItems } from './ai-items.util';

const isAnswerIndexItem = (item: unknown): item is { answerIndex: number } =>
    typeof item === 'object' && item !== null && typeof (item as { answerIndex?: unknown }).answerIndex === 'number';

describe('findItemArray', () => {
    it('returns the array for a bare array reply', () => {
        // Act & Assert
        expect(findItemArray([1, 2])).toEqual([1, 2]);
    });

    it('returns the items array for an object reply', () => {
        // Act & Assert
        expect(findItemArray({ items: ['a'] })).toEqual(['a']);
    });

    it('returns undefined for a reply with neither shape', () => {
        // Act & Assert
        expect(findItemArray({ results: [] })).toBeUndefined();
        expect(findItemArray(null)).toBeUndefined();
    });
});

describe('unwrapItems', () => {
    it('returns the array when the model replies with a bare array', () => {
        // Act & Assert
        expect(unwrapItems([{ answerIndex: 0 }], isAnswerIndexItem)).toEqual([{ answerIndex: 0 }]);
    });

    it('returns the items array when the model wraps it in an object', () => {
        // Act & Assert
        expect(unwrapItems({ items: [{ answerIndex: 0 }] }, isAnswerIndexItem)).toEqual([{ answerIndex: 0 }]);
    });

    it('throws when the reply is an object without an items array', () => {
        // Act & Assert
        expect(() => unwrapItems({ results: [] }, isAnswerIndexItem)).toThrow('neither a JSON array');
    });

    it('throws for null or primitive replies', () => {
        // Act & Assert
        expect(() => unwrapItems(null, isAnswerIndexItem)).toThrow();
        expect(() => unwrapItems('text', isAnswerIndexItem)).toThrow();
    });

    it('throws when one item has the wrong shape', () => {
        // Act & Assert
        expect(() => unwrapItems({ items: [{ answerIndex: 0 }, { answerIndex: '1' }] }, isAnswerIndexItem)).toThrow('unexpected shape');
    });
});
