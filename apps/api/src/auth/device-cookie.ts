import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Device cookies (M4.6.2b hardening; OWASP "Slow down online guessing attacks with device
 * cookies"). After a successful sign-in the browser receives a signed, HttpOnly cookie naming the
 * account and a random device id. Later attempts that present a valid device cookie for the same
 * account are throttled per device only, so attackers guessing from elsewhere cannot lock that
 * browser out. It authenticates nothing by itself: the password is always required.
 *
 * Value: `v1.<principalId>.<issuedAtMs>.<deviceId>.<hmac>`, HMAC-SHA256 under `STAFF_AUTH_SECRET`
 * (rotating the secret invalidates every device cookie). Lifetime 180 days.
 */

export const DEVICE_COOKIE_LIFETIME_MS = 180 * 24 * 3_600_000;
const PATTERN = /^v1\.([0-9a-f-]{36})\.(\d{13})\.([A-Za-z0-9_-]{22})\.([A-Za-z0-9_-]{43})$/;

const mac = (secret: string, principalId: string, issuedAt: string, deviceId: string) =>
  createHmac('sha256', secret)
    .update(`khums-device/v1\n${principalId}\n${issuedAt}\n${deviceId}`, 'utf8')
    .digest('base64url');

export function issueDeviceCookie(secret: string, principalId: string, nowMs: number): string {
  const issuedAt = String(nowMs);
  const deviceId = randomBytes(16).toString('base64url');
  return `v1.${principalId}.${issuedAt}.${deviceId}.${mac(secret, principalId, issuedAt, deviceId)}`;
}

/** The device id when the cookie is genuine, unexpired and issued to `principalId`; else null. */
export function verifyDeviceCookie(
  secret: string,
  value: string | undefined,
  principalId: string,
  nowMs: number,
): string | null {
  if (value === undefined) return null;
  const match = PATTERN.exec(value);
  if (match === null) return null;
  const [, owner = '', issuedAt = '', deviceId = '', signature = ''] = match;
  if (owner !== principalId) return null;
  const age = nowMs - Number(issuedAt);
  if (age < 0 || age > DEVICE_COOKIE_LIFETIME_MS) return null;
  const expected = Buffer.from(mac(secret, owner, issuedAt, deviceId));
  const presented = Buffer.from(signature);
  return expected.length === presented.length && timingSafeEqual(expected, presented)
    ? deviceId
    : null;
}
