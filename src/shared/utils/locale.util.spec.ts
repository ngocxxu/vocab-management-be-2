import { DEFAULT_APP_LOCALE, LOCALE_LANGUAGE_NAMES, parseAppLocale } from './locale.util';

describe('parseAppLocale', () => {
    it('returns vi for a plain vi header', () => {
        // Arrange
        const header = 'vi';

        // Act & Assert
        expect(parseAppLocale(header)).toBe('vi');
    });

    it('takes the primary subtag so vi-VN maps to vi', () => {
        // Arrange
        const header = 'vi-VN';

        // Act & Assert
        expect(parseAppLocale(header)).toBe('vi');
    });

    it('reads the first language in a q-weighted list', () => {
        // Arrange
        const header = 'vi-VN,vi;q=0.9,en;q=0.8';

        // Act & Assert
        expect(parseAppLocale(header)).toBe('vi');
    });

    it('is case-insensitive', () => {
        // Arrange
        const header = 'VI';

        // Act & Assert
        expect(parseAppLocale(header)).toBe('vi');
    });

    it('falls back to en for a locale outside en and vi', () => {
        // Arrange
        const header = 'fr-FR';

        // Act & Assert
        expect(parseAppLocale(header)).toBe(DEFAULT_APP_LOCALE);
    });

    it('falls back to en when the header is missing or empty', () => {
        // Act & Assert
        expect(parseAppLocale(undefined)).toBe('en');
        expect(parseAppLocale('')).toBe('en');
    });
});

describe('LOCALE_LANGUAGE_NAMES', () => {
    it('names the language each supported locale writes in', () => {
        // Act & Assert
        expect(LOCALE_LANGUAGE_NAMES).toEqual({ en: 'English', vi: 'Vietnamese' });
    });
});
