import { appMessage } from './app-messages.util';

describe('appMessage', () => {
    it('returns the Vietnamese text for vi', () => {
        // Act & Assert
        expect(appMessage('correct', 'vi')).toBe('Đúng.');
    });

    it('returns the English text for en', () => {
        // Act & Assert
        expect(appMessage('correct', 'en')).toBe('Correct.');
    });

    it('uses English when no locale is given', () => {
        // Act & Assert
        expect(appMessage('nearCorrect')).toBe('Near correct (typing error).');
    });
});
