import { describe, expect, it } from 'vitest';

import { decodeCursor, encodeCursor, pageOf } from './paging';

describe('cursor paging (M4.6.5)', () => {
  const items = ['a', 'b', 'c', 'd', 'e'];
  it('pages forward with opaque cursors until the end', () => {
    const first = pageOf(items, (x) => x, 'asc', 2);
    expect(first).toEqual({ items: ['a', 'b'], nextCursor: encodeCursor('b') });
    const second = pageOf(items, (x) => x, 'asc', 2, first?.nextCursor ?? undefined);
    expect(second?.items).toEqual(['c', 'd']);
    const third = pageOf(items, (x) => x, 'asc', 2, second?.nextCursor ?? undefined);
    expect(third).toEqual({ items: ['e'], nextCursor: null });
  });

  it('pages newest first in descending order', () => {
    const desc = [...items].reverse();
    const first = pageOf(desc, (x) => x, 'desc', 3);
    expect(first?.items).toEqual(['e', 'd', 'c']);
    expect(pageOf(desc, (x) => x, 'desc', 3, first?.nextCursor ?? undefined)?.items).toEqual([
      'b',
      'a',
    ]);
  });

  it('refuses malformed cursors (never guesses)', () => {
    expect(decodeCursor('!!!')).toBeNull();
    expect(pageOf(items, (x) => x, 'asc', 2, 'not=base64url')).toBeNull();
  });
});
