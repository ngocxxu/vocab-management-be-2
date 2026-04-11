import { extractHttpExceptionMessage } from './error-response.util';

describe('extractHttpExceptionMessage', () => {
    it('returns string response as-is', () => {
        expect(extractHttpExceptionMessage('plain')).toBe('plain');
    });

    it('extracts string message from object', () => {
        expect(extractHttpExceptionMessage({ message: 'one' })).toBe('one');
    });

    it('extracts string array from object', () => {
        expect(extractHttpExceptionMessage({ message: ['a', 'b'] })).toEqual(['a', 'b']);
    });

    it('filters non-strings from message array', () => {
        expect(
            extractHttpExceptionMessage({ message: ['ok', 1 as unknown as string, 'x'] }),
        ).toEqual(['ok', 'x']);
    });

    it('returns Error when message missing', () => {
        expect(extractHttpExceptionMessage({})).toBe('Error');
    });
});
