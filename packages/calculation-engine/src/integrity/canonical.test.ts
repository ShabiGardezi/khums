import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { describe, expect, it } from 'vitest';

import { canonicalize, isWellFormedUtf16, utf8Bytes } from './canonical';

const text = (value: unknown) => {
  const result = canonicalize(value);
  if (!result.ok) throw new Error(result.error.code);
  return result.value;
};
const errorCode = (value: unknown) => {
  const result = canonicalize(value);
  return result.ok ? null : result.error.code;
};

describe('khums-jcs-1 canonicalization (RFC 8785 profile)', () => {
  it('sorts keys by UTF-16 code units, as in the RFC 8785 §3.2.3 example', () => {
    const input = {
      '€': 'Euro Sign',
      '\r': 'Carriage Return',
      דּ: 'Hebrew Letter Dalet With Dagesh',
      '1': 'One',
      '😀': 'Emoji: Grinning Face',
      '\u0080': 'Control',
      ö: 'Latin Small Letter O With Diaeresis',
    };
    // Asserted on the text (JS would re-order integer-like keys such as "1" when parsed).
    // Expected order: \r, 1, U+0080, U+00F6, U+20AC, U+1F600 (surrogates D83D DE00), U+FB33.
    const order = Object.keys(input).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    expect(order.map((k) => k.codePointAt(0))).toEqual([
      0x0d, 0x31, 0x80, 0xf6, 0x20ac, 0x1f600, 0xfb33,
    ]);
    const expected = `{${order.map((k) => `${JSON.stringify(k)}:${JSON.stringify(input[k as keyof typeof input])}`).join(',')}}`;
    expect(text(input)).toBe(expected);
  });

  it('is independent of property insertion order, at every depth', () => {
    const a = { b: 1, a: { y: [1, { q: true, p: null }], x: 'v' } };
    const b = { a: { x: 'v', y: [1, { p: null, q: true }] }, b: 1 };
    expect(text(a)).toBe(text(b));
    expect(text(a)).toBe('{"a":{"x":"v","y":[1,{"p":null,"q":true}]},"b":1}');
  });

  it('keeps array order (arrays are never sorted)', () => {
    expect(text(['b', 'a'])).toBe('["b","a"]');
    expect(text(['b', 'a'])).not.toBe(text(['a', 'b']));
  });

  it('keeps decimal strings exactly (no numeric normalization)', () => {
    expect(text({ v: '12.50' })).toBe('{"v":"12.50"}');
    expect(text({ v: '12.50' })).not.toBe(text({ v: '12.5' }));
    expect(text({ v: '0.10000000000000000001' })).toContain('0.10000000000000000001');
  });

  it('distinguishes missing, null, empty string, empty array and empty object', () => {
    const forms = [{}, { k: null }, { k: '' }, { k: [] }, { k: {} }];
    expect(new Set(forms.map(text)).size).toBe(forms.length);
  });

  it('escapes strings exactly as ECMAScript JSON.stringify and keeps Unicode unnormalized', () => {
    expect(text('a"b\\c\n\u0001')).toBe('"a\\"b\\\\c\\n\\u0001"');
    const nfc = 'café';
    const nfd = 'café';
    expect(text(nfc)).not.toBe(text(nfd)); // documented: no normalization
    expect(text('😀 € ö')).toBe('"😀 € ö"');
  });

  it('rejects unsupported values instead of dropping or converting them', () => {
    const cycle: Record<string, unknown> = {};
    cycle.self = cycle;
    const sparse = [1, , 3]; // eslint-disable-line no-sparse-arrays
    const cases: [unknown, string][] = [
      [{ a: undefined }, 'UNDEFINED_VALUE'],
      [[undefined], 'UNDEFINED_VALUE'],
      [1.5, 'NON_INTEGER_NUMBER'],
      [-0, 'NON_INTEGER_NUMBER'],
      [Number.NaN, 'NON_INTEGER_NUMBER'],
      [Number.POSITIVE_INFINITY, 'NON_INTEGER_NUMBER'],
      [2 ** 53, 'NON_INTEGER_NUMBER'],
      [10n, 'UNSUPPORTED_VALUE'],
      [() => 1, 'UNSUPPORTED_VALUE'],
      [Symbol('x'), 'UNSUPPORTED_VALUE'],
      [new Date(0), 'NON_PLAIN_OBJECT'],
      [new Map(), 'NON_PLAIN_OBJECT'],
      [{ [Symbol('k')]: 1 }, 'NON_PLAIN_OBJECT'],
      [sparse, 'SPARSE_ARRAY'],
      [cycle, 'CYCLE'],
      ['\ud800', 'MALFORMED_STRING'],
      [{ '\udc00': 1 }, 'MALFORMED_STRING'],
    ];
    for (const [value, code] of cases) expect(errorCode(value)).toBe(code);
    // Repeated (non-cyclic) references are fine.
    const shared = { x: 1 };
    expect(text({ a: shared, b: shared })).toBe('{"a":{"x":1},"b":{"x":1}}');
  });

  it('reports only paths, never values, in errors', () => {
    const result = canonicalize({ secret: { amount: 1.25 } });
    expect(result).toEqual({
      ok: false,
      error: { code: 'NON_INTEGER_NUMBER', path: '$.secret.amount' },
    });
  });
});

describe('UTF-8 and SHA-256', () => {
  it('encodes UTF-8 deterministically, including astral characters', () => {
    expect([...utf8Bytes('A€😀')]).toEqual([0x41, 0xe2, 0x82, 0xac, 0xf0, 0x9f, 0x98, 0x80]);
    expect(isWellFormedUtf16('😀')).toBe(true);
    expect(isWellFormedUtf16('\ud83d')).toBe(false);
  });

  it('matches the FIPS 180-4 SHA-256 test vectors (lowercase hex)', () => {
    expect(bytesToHex(sha256(utf8Bytes('')))).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    );
    expect(bytesToHex(sha256(utf8Bytes('abc')))).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });
});
