import { notFound } from 'next/navigation';
import { locale as rootLocale } from 'next/root-params';

import { CONTENT } from '@/content';

import { isLocale, LOCALE_DEFINITIONS, type Locale } from './config';
import { localizePath } from './paths';

/**
 * Server-side locale access. Uses `next/root-params`, so any Server Component can read the
 * current locale without prop drilling. Client Components receive what they need as props
 * (or read `useParams()`).
 */
export async function getLocale(): Promise<Locale> {
  const value = await rootLocale();
  if (!isLocale(value)) notFound();
  return value;
}

/** Everything a Server Component needs to render localized UI. */
export async function getI18n() {
  const locale = await getLocale();
  return {
    locale,
    definition: LOCALE_DEFINITIONS[locale],
    site: CONTENT.site[locale],
    landing: CONTENT.landing[locale],
    pages: CONTENT.pages[locale],
    onboarding: CONTENT.onboarding[locale],
    facts: CONTENT.facts[locale],
    admin: CONTENT.admin[locale],
    results: CONTENT.results[locale],
    console: CONTENT.console[locale],
    research: CONTENT.research[locale],
    history: CONTENT.history[locale],
    rules: CONTENT.rules[locale],
    /** Locale-prefixed app path. */
    href: (path: string) => localizePath(locale, path),
  };
}
