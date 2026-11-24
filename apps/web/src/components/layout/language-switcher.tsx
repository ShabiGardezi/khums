'use client';

import { Languages } from 'lucide-react';
import { usePathname } from 'next/navigation';

import { cn } from '@khums/ui/lib/utils';

import {
  LOCALE_COOKIE,
  LOCALE_COOKIE_MAX_AGE,
  LOCALE_DEFINITIONS,
  LOCALES,
  type Locale,
} from '@/i18n/config';
import { switchLocalePath } from '@/i18n/paths';

/**
 * Accessible language switcher. Links point to the same page in the other locale (the URL is the
 * source of truth); choosing one also stores the preference so unprefixed URLs open in it.
 * Navigating between locales is a full page load, so `<html lang dir>` is always correct.
 */
export function LanguageSwitcher({ current, label }: { current: Locale; label: string }) {
  const pathname = usePathname();
  return (
    <nav aria-label={label} className="flex items-center gap-1.5">
      <Languages aria-hidden="true" className="text-muted-foreground size-4 shrink-0" />
      <ul className="flex items-center gap-1 text-sm">
        {LOCALES.map((locale) => {
          const definition = LOCALE_DEFINITIONS[locale];
          const common = 'rounded-md px-2 py-1 whitespace-nowrap';
          return (
            <li key={locale}>
              {locale === current ? (
                <span
                  lang={definition.tag}
                  aria-current="true"
                  className={cn(common, 'bg-muted font-semibold')}
                >
                  {definition.nativeName}
                </span>
              ) : (
                <a
                  href={switchLocalePath(pathname, locale)}
                  lang={definition.tag}
                  hrefLang={definition.tag}
                  className={cn(
                    common,
                    'text-muted-foreground hover:bg-muted hover:text-foreground underline-offset-4 hover:underline',
                  )}
                  onClick={() => {
                    document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=${LOCALE_COOKIE_MAX_AGE}; samesite=lax`;
                  }}
                >
                  {definition.nativeName}
                </a>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
