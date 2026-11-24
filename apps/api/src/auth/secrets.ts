import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';

/**
 * Random secrets and their stored forms (M4.6.2b). Session ids and CSRF tokens are 256-bit
 * random values; only their SHA-256 hashes are stored. Comparisons are constant-time.
 */

export const newToken = (): string => randomBytes(32).toString('base64url');

export const sha256Hex = (value: string): string =>
  createHash('sha256').update(value, 'utf8').digest('hex');

/** Constant-time comparison of a presented token with a stored SHA-256 hash. */
export function tokenMatchesHash(token: string, storedHash: string): boolean {
  if (!/^[0-9a-f]{64}$/.test(storedHash)) return false;
  const presented = Buffer.from(sha256Hex(token), 'hex');
  const stored = Buffer.from(storedHash, 'hex');
  return presented.length === stored.length && timingSafeEqual(presented, stored);
}

/** Keyed hash for throttle keys (usernames, client IPs are never stored in the clear). */
export const keyedHash = (secret: string, value: string): string =>
  createHmac('sha256', secret).update(value, 'utf8').digest('hex');

/** Unambiguous characters (no 0/O, 1/l/I). 20 characters ≈ 113 bits. */
const TEMPORARY_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';

export function newTemporaryPassword(length = 20): string {
  let out = '';
  for (let i = 0; i < length; i += 1)
    out += TEMPORARY_ALPHABET.charAt(randomInt(TEMPORARY_ALPHABET.length));
  return out;
}
