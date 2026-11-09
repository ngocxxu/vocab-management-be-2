import type { ExecutionContext } from '@nestjs/common';
import { resolveRequestLocale } from './locale.decorator';

function contextWithAcceptLanguage(value: string | undefined): ExecutionContext {
    return {
        switchToHttp: () => ({ getRequest: () => ({ headers: { 'accept-language': value } }) }),
    } as unknown as ExecutionContext;
}

describe('resolveRequestLocale', () => {
    it('maps a regional Vietnamese header to vi', () => {
        // Act & Assert
        expect(resolveRequestLocale(contextWithAcceptLanguage('vi-VN'))).toBe('vi');
    });

    it('falls back to en for a language the app does not support', () => {
        // Act & Assert
        expect(resolveRequestLocale(contextWithAcceptLanguage('fr'))).toBe('en');
    });

    it('falls back to en when the header is missing', () => {
        // Act & Assert
        expect(resolveRequestLocale(contextWithAcceptLanguage(undefined))).toBe('en');
    });
});
