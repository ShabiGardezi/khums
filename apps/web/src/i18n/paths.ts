import { isLocale, type Locale } from './config';

/**
 * Prefixes an app path with a locale. Accepts paths with query or hash:
 *   localizePath('ur', '/history')  → '/ur/history'
 *   localizePath('en', '/')         → '/en'
 *   localizePath('ur', '/#faq')     → '/ur#faq'
 */
export function localizePath(locale: Locale, path: string): string {
  if (!path.startsWith('/')) throw new Error(`Expected an absolute app path, got "${path}"`);
  const match = /^([^?#]*)(.*)$/.exec(path);
  const pathname = match?.[1] ?? path;
  const suffix = match?.[2] ?? '';
  return pathname === '/' ? `/${locale}${suffix}` : `/${locale}${pathname}${suffix}`;
}

/** Splits a URL pathname into its locale (if any) and the remaining app path. */
export function splitLocale(pathname: string): { locale: Locale | null; path: string } {
  const [, first = '', ...rest] = pathname.split('/');
  if (isLocale(first)) return { locale: first, path: `/${rest.join('/')}` };
  return { locale: null, path: pathname === '' ? '/' : pathname };
}

/** The same page in another locale (used by the language switcher). */
export function switchLocalePath(pathname: string, target: Locale): string {
  return localizePath(target, splitLocale(pathname).path);
}
