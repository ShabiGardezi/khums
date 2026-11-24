import { describe, expect, it } from 'vitest';

import { matchLocale, negotiateLocale, parseAcceptLanguage } from './negotiate';

describe('parseAcceptLanguage', () => {
  it('orders by quality and keeps header order for ties', () => {
    expect(parseAcceptLanguage('fr;q=0.5, ur-PK, en;q=0.9').map((l) => l.tag)).toEqual([
      'ur-pk',
      'en',
      'fr',
    ]);
  });

  it('ignores wildcards, zero weights and empty input', () => {
    expect(parseAcceptLanguage('*, de;q=0')).toEqual([]);
    expect(parseAcceptLanguage('')).toEqual([]);
    expect(parseAcceptLanguage(null)).toEqual([]);
  });
});

describe('matchLocale', () => {
  it('matches by primary subtag', () => {
    expect(matchLocale('ur-PK')).toBe('ur');
    expect(matchLocale('EN-gb')).toBe('en');
    expect(matchLocale('fa')).toBeNull();
  });
});

describe('negotiateLocale', () => {
  it('prefers a valid cookie over the browser language', () => {
    expect(negotiateLocale({ cookie: 'ur', acceptLanguage: 'en-US' })).toBe('ur');
  });

  it('ignores invalid cookies', () => {
    expect(negotiateLocale({ cookie: 'xx', acceptLanguage: 'ur' })).toBe('ur');
  });

  it('uses the first supported browser language', () => {
    expect(
      negotiateLocale({ cookie: undefined, acceptLanguage: 'fa-IR, ur;q=0.8, en;q=0.7' }),
    ).toBe('ur');
  });

  it('falls back to English', () => {
    expect(negotiateLocale({ cookie: undefined, acceptLanguage: 'fa-IR, ar' })).toBe('en');
    expect(negotiateLocale({ cookie: null, acceptLanguage: null })).toBe('en');
  });
});
