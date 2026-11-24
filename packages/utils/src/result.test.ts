import { describe, expect, it } from 'vitest';

import { err, isErr, isOk, ok, type Result } from './index';

const parsePositive = (n: number): Result<number, 'NOT_POSITIVE'> =>
  n > 0 ? ok(n) : err('NOT_POSITIVE');

describe('Result', () => {
  it('wraps success values', () => {
    const result = parsePositive(5);
    expect(isOk(result)).toBe(true);
    expect(result).toEqual({ ok: true, value: 5 });
  });

  it('wraps failure values', () => {
    const result = parsePositive(-1);
    expect(isErr(result)).toBe(true);
    expect(result).toEqual({ ok: false, error: 'NOT_POSITIVE' });
  });
});
