import { describe, expect, it } from 'vitest';

import { formatMessage } from './format';
import { localizePath, splitLocale, switchLocalePath } from './paths';

describe('localizePath', () => {
  it.each([
    ['en', '/', '/en'],
    ['ur', '/history', '/ur/history'],
    ['ur', '/#faq', '/ur#faq'],
    ['en', '/start?x=1#top', '/en/start?x=1#top'],
  ] as const)('%s + %s → %s', (locale, path, expected) => {
    expect(localizePath(locale, path)).toBe(expected);
  });

  it('rejects relative paths', () => {
    expect(() => localizePath('en', 'history')).toThrow();
  });
});

describe('splitLocale / switchLocalePath', () => {
  it('splits a locale prefix', () => {
    expect(splitLocale('/ur/history')).toEqual({ locale: 'ur', path: '/history' });
    expect(splitLocale('/en')).toEqual({ locale: 'en', path: '/' });
    expect(splitLocale('/history')).toEqual({ locale: null, path: '/history' });
    expect(splitLocale('/fr/history')).toEqual({ locale: null, path: '/fr/history' });
  });

  it('switches the locale of a path, keeping the page', () => {
    expect(switchLocalePath('/en/history', 'ur')).toBe('/ur/history');
    expect(switchLocalePath('/ur', 'en')).toBe('/en');
  });
});

describe('formatMessage', () => {
  it('fills placeholders and leaves unknown ones intact', () => {
    expect(formatMessage('Step {number}: ', { number: 2 })).toBe('Step 2: ');
    expect(formatMessage('{a} and {b}', { a: 'x' })).toBe('x and {b}');
  });
});
