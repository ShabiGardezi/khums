import { err, ok, type Result } from '@khums/utils';

/**
 * Staff credential rules (M4.6.2b; docs/AUTH_ARCHITECTURE.md §4.10). Pure: hashing is platform
 * cryptography (Argon2id in the API). Security policy only, nothing religious.
 */

/** Normalized usernames: 3–64 chars, lowercase letters, digits, `.`, `_`, `-`; starts alphanumeric. */
export const USERNAME_PATTERN = /^[a-z0-9][a-z0-9._-]{2,63}$/;

export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;

/**
 * Case-folded, NFKC-normalized username, or an error. The same function is used when creating an
 * account and at sign-in, so look-alike forms of one name map to one account.
 */
export function normalizeUsername(raw: unknown): Result<string, 'USERNAME_INVALID'> {
  if (typeof raw !== 'string' || raw.length > 200) return err('USERNAME_INVALID');
  const normalized = raw.normalize('NFKC').trim().toLowerCase();
  return USERNAME_PATTERN.test(normalized) ? ok(normalized) : err('USERNAME_INVALID');
}

export type PasswordPolicyIssue =
  'PASSWORD_TOO_SHORT' | 'PASSWORD_TOO_LONG' | 'PASSWORD_CONTAINS_USERNAME' | 'PASSWORD_TOO_COMMON';

/**
 * A small list of the most common passwords and patterns (compared case-insensitively after
 * removing spaces). Length is the main control; this blocks the obvious choices that pass it.
 */
const COMMON_PASSWORDS: ReadonlySet<string> = new Set([
  '123456789012',
  '1234567890123',
  '12345678901234',
  '000000000000',
  '111111111111',
  '123123123123',
  'password1234',
  'password12345',
  'password123456',
  'passwordpassword',
  'qwertyuiopas',
  'qwerty123456',
  'qwertyuiop123',
  'iloveyou1234',
  'administrator',
  'administrator1',
  'adminadmin123',
  'letmein12345',
  'welcome12345',
  'welcome123456',
  'changeme1234',
  'changeme12345',
  'trustno1trustno1',
  'abcdefghijkl',
  'abc123abc123',
  'superadmin123',
  'khumspassword',
  'khums1234567',
  'bismillah123',
  'bismillah1234',
  'mashallah123',
  'inshallah123',
  'subhanallah1',
  'alhamdulillah',
  'alhamdulillah1',
  'yaali1234567',
  'yahussain110',
  'pakistan1234',
  'pakistan12345',
]);

/** Checks a NEW password (never applied to sign-in attempts). Length counts characters. */
export function checkPasswordPolicy(
  password: string,
  username: string,
): Result<void, PasswordPolicyIssue> {
  // Code points, not UTF-16 units (Urdu and other scripts count per character).
  const length = Array.from(password).length;
  if (length < PASSWORD_MIN_LENGTH) return err('PASSWORD_TOO_SHORT');
  if (length > PASSWORD_MAX_LENGTH) return err('PASSWORD_TOO_LONG');
  const folded = password.normalize('NFKC').toLowerCase();
  if (username.length >= 3 && folded.includes(username.toLowerCase())) {
    return err('PASSWORD_CONTAINS_USERNAME');
  }
  if (COMMON_PASSWORDS.has(folded.replace(/\s+/g, ''))) return err('PASSWORD_TOO_COMMON');
  return ok(undefined);
}
