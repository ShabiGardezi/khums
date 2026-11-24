import type { ResearchEntityType } from '@khums/shared-types';

/**
 * Identifiers for research records (owner decision D8, 2026-11-22). Pure: the caller supplies the
 * time and the random bytes (the API uses its clock and a CSPRNG). No counters, no `max + 1`.
 */

const hex = (bytes: readonly number[]) =>
  bytes.map((b) => b.toString(16).padStart(2, '0')).join('');

/**
 * Formats a UUID version 7 (RFC 9562): 48-bit Unix milliseconds, version 7, 74 random bits.
 * `random` must hold at least 10 bytes from a cryptographically secure source.
 */
export function formatUuidV7(unixMs: number, random: Uint8Array): string {
  if (!Number.isInteger(unixMs) || unixMs < 0 || unixMs >= 2 ** 48) {
    throw new RangeError('unixMs must be a 48-bit non-negative integer');
  }
  if (random.length < 10) throw new RangeError('random must hold at least 10 bytes');
  const r = Array.from(random.subarray(0, 10));
  const time = unixMs.toString(16).padStart(12, '0');
  const randA = (((r[0] ?? 0) << 4) | ((r[1] ?? 0) >> 4)) & 0xfff;
  const variant = 0x80 | ((r[2] ?? 0) & 0x3f);
  const tail = hex([variant, ...r.slice(3, 10)]);
  const all = `${time}7${randA.toString(16).padStart(3, '0')}${tail}`;
  return `${all.slice(0, 8)}-${all.slice(8, 12)}-${all.slice(12, 16)}-${all.slice(16, 20)}-${all.slice(20, 32)}`;
}

/** Crockford base32 (no I, L, O, U). */
const BASE32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const PREFIX: Readonly<Record<ResearchEntityType, string>> = {
  SOURCE: 'S',
  PASSAGE: 'P',
  TRANSLATION: 'T',
  FINDING: 'F',
  RULING: 'R',
};

/**
 * The readable reference of a research entity, derived from its UUIDv7's last 40 random bits:
 * `S|P|T|R-{marjaId}-{code}` or `F-{marjaId}-{questionId}-{code}`. Stable for the entity's
 * lifetime; uniqueness is enforced by a unique index (a collision means a new UUID is drawn).
 */
export function researchDisplayRef(
  entityType: ResearchEntityType,
  marjaId: string,
  entityId: string,
  questionId: string | null,
): string {
  const last = entityId.replace(/-/g, '').slice(-10);
  let value = BigInt(`0x${last}`);
  let code = '';
  for (let i = 0; i < 8; i += 1) {
    code = (BASE32[Number(value & 31n)] ?? '0') + code;
    value >>= 5n;
  }
  const prefix = PREFIX[entityType];
  return entityType === 'FINDING' && questionId !== null
    ? `${prefix}-${marjaId}-${questionId}-${code}`
    : `${prefix}-${marjaId}-${code}`;
}
