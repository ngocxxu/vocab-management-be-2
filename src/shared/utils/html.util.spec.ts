import { escapeHtml, toSafeHttpUrl } from './html.util';

describe('escapeHtml', () => {
    test('escapes the characters that can break out of text or an attribute', () => {
        // Act
        const escaped = escapeHtml(`<a href="x">Tom & 'Jerry'</a>`);

        // Assert
        expect(escaped).toBe('&lt;a href=&quot;x&quot;&gt;Tom &amp; &#39;Jerry&#39;&lt;/a&gt;');
    });

    test('turns a missing value into an empty string', () => {
        // Assert
        expect(escapeHtml(undefined)).toBe('');
        expect(escapeHtml(null)).toBe('');
    });

    test('leaves a number readable', () => {
        // Assert
        expect(escapeHtml(12)).toBe('12');
    });
});

describe('toSafeHttpUrl', () => {
    test('returns an https link unchanged', () => {
        // Assert
        expect(toSafeHttpUrl('https://app.example/review')).toBe('https://app.example/review');
    });

    test('escapes ampersands so the link stays valid in an attribute', () => {
        // Assert
        expect(toSafeHttpUrl('https://app.example/x?a=1&b=2')).toBe('https://app.example/x?a=1&amp;b=2');
    });

    test.each(['javascript:alert(1)', 'data:text/html,<b>x</b>', '/relative/path', 'not a url', ''])('rejects %j', (value) => {
        // Assert
        expect(toSafeHttpUrl(value)).toBeNull();
    });

    test('rejects values that are not strings', () => {
        // Assert
        expect(toSafeHttpUrl(undefined)).toBeNull();
        expect(toSafeHttpUrl(42)).toBeNull();
    });
});
