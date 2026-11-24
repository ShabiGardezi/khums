import { err, ok, type Result } from '@khums/utils';

/**
 * Canonicalization `khums-jcs-1`: an RFC 8785 (JSON Canonicalization Scheme) profile
 * (docs/research/RULE_PACK_STRUCTURE.md §5.8).
 *
 * Output is exactly RFC 8785 for the values it accepts:
 * - object keys sorted by UTF-16 code units, no whitespace;
 * - strings serialized as ECMAScript `JSON.stringify` does;
 * - integers in ECMAScript number form.
 *
 * The profile narrows the input so that no value is ambiguous:
 * - numbers: only safe integers, never `-0`, `NaN`, `Infinity` or fractions. Decimal amounts in
 *   packs are strings, so they are never converted to floats or normalized;
 * - strings must be well-formed UTF-16 (lone surrogates rejected). No Unicode normalization is
 *   applied: different code points produce different bytes, by design;
 * - `undefined`, functions, symbols, bigints, sparse arrays, cycles and non-plain objects
 *   (Date, Map, class instances) are rejected, never silently dropped;
 * - a missing key, `null`, `""`, `[]` and `{}` are all distinct and kept exactly;
 * - arrays keep their order. Nothing is sorted, because every array in a pack is ordered or
 *   treated as such (see §5.8).
 */

export type CanonicalizationErrorCode =
  | 'UNSUPPORTED_VALUE'
  | 'UNDEFINED_VALUE'
  | 'NON_INTEGER_NUMBER'
  | 'MALFORMED_STRING'
  | 'SPARSE_ARRAY'
  | 'NON_PLAIN_OBJECT'
  | 'CYCLE';

export interface CanonicalizationError {
  readonly code: CanonicalizationErrorCode;
  /** Location (keys and indexes only, never values). */
  readonly path: string;
}

class Rejected extends Error {
  constructor(readonly detail: CanonicalizationError) {
    super(detail.code);
  }
}

/** True when the string has no unpaired surrogate code units. */
export function isWellFormedUtf16(text: string): boolean {
  for (let i = 0; i < text.length; i += 1) {
    const unit = text.charCodeAt(i);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = text.charCodeAt(i + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return false;
      i += 1;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) {
      return false;
    }
  }
  return true;
}

function serializeString(text: string, path: string): string {
  if (!isWellFormedUtf16(text)) throw new Rejected({ code: 'MALFORMED_STRING', path });
  return JSON.stringify(text);
}

function serialize(value: unknown, path: string, seen: Set<object>): string {
  if (value === null) return 'null';
  switch (typeof value) {
    case 'boolean':
      return value ? 'true' : 'false';
    case 'string':
      return serializeString(value, path);
    case 'number':
      if (!Number.isSafeInteger(value) || Object.is(value, -0)) {
        throw new Rejected({ code: 'NON_INTEGER_NUMBER', path });
      }
      return String(value);
    case 'undefined':
      throw new Rejected({ code: 'UNDEFINED_VALUE', path });
    case 'bigint':
    case 'function':
    case 'symbol':
      throw new Rejected({ code: 'UNSUPPORTED_VALUE', path });
    case 'object':
      break;
  }
  const object = value;
  if (seen.has(object)) throw new Rejected({ code: 'CYCLE', path });
  seen.add(object);
  try {
    if (Array.isArray(object)) {
      const items: string[] = [];
      for (let i = 0; i < object.length; i += 1) {
        if (!(i in object))
          throw new Rejected({ code: 'SPARSE_ARRAY', path: `${path}[${String(i)}]` });
        items.push(serialize(object[i], `${path}[${String(i)}]`, seen));
      }
      return `[${items.join(',')}]`;
    }
    const prototype: unknown = Object.getPrototypeOf(object);
    if (
      (prototype !== Object.prototype && prototype !== null) ||
      Object.getOwnPropertySymbols(object).length > 0
    ) {
      throw new Rejected({ code: 'NON_PLAIN_OBJECT', path });
    }
    // RFC 8785 §3.2.3: sort by UTF-16 code units (the default string comparison).
    const keys = Object.keys(object).sort();
    const members = keys.map((key) => {
      const memberPath = `${path}.${key}`;
      return `${serializeString(key, memberPath)}:${serialize((object as Record<string, unknown>)[key], memberPath, seen)}`;
    });
    return `{${members.join(',')}}`;
  } finally {
    seen.delete(object);
  }
}

/** Canonical JSON text of a value under `khums-jcs-1`, or why it cannot be canonicalized. */
export function canonicalize(value: unknown): Result<string, CanonicalizationError> {
  try {
    return ok(serialize(value, '$', new Set()));
  } catch (error) {
    if (error instanceof Rejected) return err(error.detail);
    throw error;
  }
}

/** UTF-8 bytes of a well-formed string (pure; no platform TextEncoder needed). */
export function utf8Bytes(text: string): Uint8Array {
  const bytes: number[] = [];
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    if (code < 0x80) bytes.push(code);
    else if (code < 0x800) bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    else if (code < 0x10000) {
      bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
    } else {
      bytes.push(
        0xf0 | (code >> 18),
        0x80 | ((code >> 12) & 0x3f),
        0x80 | ((code >> 6) & 0x3f),
        0x80 | (code & 0x3f),
      );
    }
  }
  return Uint8Array.from(bytes);
}
