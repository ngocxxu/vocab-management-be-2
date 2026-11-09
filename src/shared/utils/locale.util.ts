export type AppLocale = 'en' | 'vi';

export const SUPPORTED_APP_LOCALES: readonly AppLocale[] = ['en', 'vi'];
export const DEFAULT_APP_LOCALE: AppLocale = 'en';

/** Language name the AI writes explanations and chat replies in, per UI locale. */
export const LOCALE_LANGUAGE_NAMES: Record<AppLocale, string> = {
    en: 'English',
    vi: 'Vietnamese',
};

/**
 * Reads the first language from an Accept-Language header and returns it if the app supports it.
 * Keeps only the primary subtag (`vi-VN` → `vi`) and ignores q-weights.
 * Anything missing or unsupported falls back to the default locale.
 */
export function parseAppLocale(acceptLanguage: string | undefined): AppLocale {
    const firstEntry = acceptLanguage?.split(',')[0]?.split(';')[0]?.trim().toLowerCase();
    const primarySubtag = firstEntry?.split('-')[0];

    return SUPPORTED_APP_LOCALES.find((locale) => locale === primarySubtag) ?? DEFAULT_APP_LOCALE;
}
