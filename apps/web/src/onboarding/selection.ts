import { listMarjaCatalogue } from '@khums/core';
import type { MarjaCatalogueEntry } from '@khums/shared-types';

import type { Locale } from '@/i18n/config';

/** Catalogue in neutral alphabetical order for the locale (no ranking or recommendation). */
export function sortedCatalogue(locale: Locale, tag: string): MarjaCatalogueEntry[] {
  const collator = new Intl.Collator(tag);
  return [...listMarjaCatalogue()].sort((a, b) =>
    collator.compare(a.sortName[locale], b.sortName[locale]),
  );
}
