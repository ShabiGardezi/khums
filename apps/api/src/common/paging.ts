/**
 * Cursor paging over an already-sorted list (M4.6.5). The cursor is the opaque, base64url-encoded
 * sort key of the last item returned; the next page holds the items after that key in the list's
 * order (`asc` or `desc` by key). Keys must be unique (append a stable id) and contain no secrets.
 */
export interface Page<T> {
  readonly items: T[];
  readonly nextCursor: string | null;
}

export const DEFAULT_PAGE_SIZE = 50;

export function encodeCursor(key: string): string {
  return Buffer.from(key, 'utf8').toString('base64url');
}

export function decodeCursor(cursor: string): string | null {
  try {
    const key = Buffer.from(cursor, 'base64url').toString('utf8');
    return key === '' || encodeCursor(key) !== cursor ? null : key;
  } catch {
    return null;
  }
}

export function pageOf<T>(
  items: readonly T[],
  keyOf: (item: T) => string,
  direction: 'asc' | 'desc',
  limit: number = DEFAULT_PAGE_SIZE,
  cursor?: string,
): Page<T> | null {
  let rest = [...items];
  if (cursor !== undefined) {
    const key = decodeCursor(cursor);
    if (key === null) return null;
    rest = rest.filter((item) => (direction === 'asc' ? keyOf(item) > key : keyOf(item) < key));
  }
  const slice = rest.slice(0, limit);
  const last = slice.at(-1);
  return {
    items: slice,
    nextCursor: rest.length > limit && last !== undefined ? encodeCursor(keyOf(last)) : null,
  };
}
