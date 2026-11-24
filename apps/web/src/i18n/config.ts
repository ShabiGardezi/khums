/**
 * Locale configuration — the single place that defines supported languages.
 * Adding a locale = add it here, add content modules, and the coverage test enforces the rest.
 */
export const LOCALES = ['en', 'ur'] as const;

export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'en';

export type TextDirection = 'ltr' | 'rtl';

export interface LocaleDefinition {
  /** BCP 47 tag used for <html lang>, hreflang and Intl formatting. */
  readonly tag: string;
  readonly dir: TextDirection;
  /** Language name in its own language (shown in the language switcher). */
  readonly nativeName: string;
}

export const LOCALE_DEFINITIONS: Readonly<Record<Locale, LocaleDefinition>> = {
  en: { tag: 'en', dir: 'ltr', nativeName: 'English' },
  ur: { tag: 'ur', dir: 'rtl', nativeName: 'اردو' },
};

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}

/** Cookie holding the user's explicit language choice (a preference; the URL is authoritative). */
export const LOCALE_COOKIE = 'NEXT_LOCALE';

/** One year, in seconds. */
export const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;
