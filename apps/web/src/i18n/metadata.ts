import type { Metadata } from 'next';

import { LOCALE_DEFINITIONS, LOCALES, type Locale } from './config';
import { localizePath } from './paths';

/** Canonical + hreflang alternates for a page available in every locale. */
export function localizedAlternates(
  locale: Locale,
  path: string,
): NonNullable<Metadata['alternates']> {
  return {
    canonical: localizePath(locale, path),
    languages: Object.fromEntries(
      LOCALES.map((l) => [LOCALE_DEFINITIONS[l].tag, localizePath(l, path)]),
    ),
  };
}
