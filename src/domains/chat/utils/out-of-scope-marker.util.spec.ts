import { isOutOfScopeMarker } from './out-of-scope-marker.util';

describe('isOutOfScopeMarker', () => {
    it('matches the bare marker', () => {
        // Act & Assert
        expect(isOutOfScopeMarker('OUT_OF_SCOPE')).toBe(true);
    });

    it('matches the marker with trailing punctuation or quotes', () => {
        // Act & Assert
        expect(isOutOfScopeMarker('OUT_OF_SCOPE.')).toBe(true);
        expect(isOutOfScopeMarker('"OUT_OF_SCOPE"')).toBe(true);
    });

    it('matches the marker regardless of case and surrounding spaces', () => {
        // Act & Assert
        expect(isOutOfScopeMarker('  out_of_scope \n')).toBe(true);
    });

    it('does not match a normal answer that merely mentions the marker', () => {
        // Act & Assert
        expect(isOutOfScopeMarker('OUT_OF_SCOPE because this is a coding question')).toBe(false);
        expect(isOutOfScopeMarker('Sure, OUT_OF_SCOPE')).toBe(false);
    });

    it('does not match empty or missing content', () => {
        // Act & Assert
        expect(isOutOfScopeMarker('')).toBe(false);
        expect(isOutOfScopeMarker(undefined)).toBe(false);
        expect(isOutOfScopeMarker(null)).toBe(false);
    });
});
