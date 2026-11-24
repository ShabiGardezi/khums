import { DEFAULT_LOCALE, isLocale, LOCALES, type Locale } from './config';

interface WeightedLanguage {
  readonly tag: string;
  readonly quality: number;
}

/** Parses an Accept-Language header into tags ordered by quality (stable for equal weights). */
export function parseAcceptLanguage(header: string | null | undefined): WeightedLanguage[] {
  if (header === null || header === undefined || header.trim() === '') return [];
  return header
    .split(',')
    .map((part, index) => {
      const [rawTag = '', ...params] = part.trim().split(';');
      const qParam = params.map((p) => p.trim()).find((p) => p.startsWith('q='));
      const quality = qParam === undefined ? 1 : Number.parseFloat(qParam.slice(2));
      return {
        tag: rawTag.trim().toLowerCase(),
        quality: Number.isFinite(quality) ? quality : 0,
        index,
      };
    })
    .filter((entry) => entry.tag !== '' && entry.tag !== '*' && entry.quality > 0)
    .sort((a, b) => b.quality - a.quality || a.index - b.index)
    .map(({ tag, quality }) => ({ tag, quality }));
}

/** Maps a language tag (e.g. "ur-PK") to a supported locale by its primary subtag. */
export function matchLocale(tag: string): Locale | null {
  const primary = tag.toLowerCase().split('-')[0];
  return LOCALES.find((locale) => locale === primary) ?? null;
}

/**
 * Chooses the locale for a request that has no locale in its URL:
 * explicit cookie preference → Accept-Language → default.
 */
export function negotiateLocale(input: {
  readonly cookie: string | null | undefined;
  readonly acceptLanguage: string | null | undefined;
}): Locale {
  if (isLocale(input.cookie)) return input.cookie;
  for (const { tag } of parseAcceptLanguage(input.acceptLanguage)) {
    const match = matchLocale(tag);
    if (match !== null) return match;
  }
  return DEFAULT_LOCALE;
}
