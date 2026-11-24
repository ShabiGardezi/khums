import { addressBuckets } from './client-ip';
import { keyedHash } from './secrets';
import type { StaffRepository } from './staff-repository';

/**
 * Distributed sign-in throttling that an attacker cannot turn into a lockout of a legitimate
 * scholar (M4.6.2b hardening; docs/AUTH_ARCHITECTURE.md §4.10 "Throttling").
 *
 * Counters live in `staffLoginThrottles` (shared by every API instance, atomic `$inc`, HMAC keys:
 * usernames and IPs are never stored in the clear). Every delay is progressive (doubling) and
 * bounded; nothing is ever locked permanently.
 *
 * 1. **Known device** — a browser holding a valid device cookie for this account (issued at a
 *    successful sign-in; OWASP "device cookies"). Its attempts are counted ONLY against that
 *    device. Failures from anywhere else never slow it down, so distributed guessing cannot lock
 *    a scholar out of the browser they normally use.
 * 2. **Unknown device** — every other attempt is counted against all of:
 *
 * | Key                 | Scope                                         | Free | Then (doubling)  | Cap    |
 * | ------------------- | --------------------------------------------- | ---- | ---------------- | ------ |
 * | `device`            | one known device of one account               | 5    | 15 s             | 15 min |
 * | `pair`              | account + client address                      | 5    | 15 s             | 15 min |
 * | `account`           | account, unknown devices only                 | 10   | 30 s             | 15 min |
 * | `client`            | client address (IPv4, IPv6 /64), any account  | 20   | 60 s             | 60 min |
 * | `network`           | network (IPv4 /24, IPv6 /48), any account     | 100  | 60 s             | 60 min |
 *
 * Recovery: a successful sign-in clears its `device`/`pair` counter; a SUPER_ADMIN can clear the
 * `account` counter, and an administrator password reset clears it too; all counters expire 24 h
 * after the last failure. The client address is the one the API can trust (`client-ip.ts`).
 */

export interface ThrottleRule {
  readonly free: number;
  readonly baseMs: number;
  readonly capMs: number;
}

export const THROTTLE_RULES = {
  device: { free: 5, baseMs: 15_000, capMs: 15 * 60_000 },
  pair: { free: 5, baseMs: 15_000, capMs: 15 * 60_000 },
  account: { free: 10, baseMs: 30_000, capMs: 15 * 60_000 },
  client: { free: 20, baseMs: 60_000, capMs: 60 * 60_000 },
  network: { free: 100, baseMs: 60_000, capMs: 60 * 60_000 },
} as const satisfies Record<string, ThrottleRule>;

export type ThrottleKeyName = keyof typeof THROTTLE_RULES;

/** The longest any single account-level window lasts (no permanent lockout). */
export const MAX_ACCOUNT_THROTTLE_MS = 15 * 60_000;
const COUNTER_LIFETIME_MS = 24 * 3_600_000;

/** Delay after `failures` failures under `rule` (0 while within the free allowance). */
export function throttleDelayMs(rule: ThrottleRule, failures: number): number {
  if (failures < rule.free) return 0;
  const doublings = Math.min(failures - rule.free, 30);
  return Math.min(rule.baseMs * 2 ** doublings, rule.capMs);
}

export type AttemptKeys =
  | { readonly kind: 'KNOWN_DEVICE'; readonly device: string }
  | {
      readonly kind: 'UNKNOWN_DEVICE';
      readonly pair: string;
      readonly account: string;
      readonly client: string;
      readonly network: string;
    };

const fold = (username: string) => username.normalize('NFKC').trim().toLowerCase().slice(0, 200);

/** The account-wide (unknown devices) key; also what an administrator clears. */
export const accountKey = (secret: string, username: string) =>
  keyedHash(secret, `account\u0000${fold(username)}`);

/**
 * Keys for one attempt. `usernameInput` is the normalized username, or the raw input folded when
 * it is not valid (attempts on invalid names are throttled too). `deviceId` is the id from a
 * device cookie that verified for THIS account, or null.
 */
export function attemptKeys(
  secret: string,
  usernameInput: string,
  clientIp: string,
  deviceId: string | null,
): AttemptKeys {
  if (deviceId !== null)
    return { kind: 'KNOWN_DEVICE', device: keyedHash(secret, `device\u0000${deviceId}`) };
  const user = fold(usernameInput);
  const buckets = addressBuckets(clientIp);
  return {
    kind: 'UNKNOWN_DEVICE',
    pair: keyedHash(secret, `pair\u0000${user}\u0000${buckets.client}`),
    account: accountKey(secret, user),
    client: keyedHash(secret, `client\u0000${buckets.client}`),
    network: keyedHash(secret, `network\u0000${buckets.network}`),
  };
}

const entries = (keys: AttemptKeys): [ThrottleKeyName, string][] =>
  keys.kind === 'KNOWN_DEVICE'
    ? [['device', keys.device]]
    : [
        ['pair', keys.pair],
        ['account', keys.account],
        ['client', keys.client],
        ['network', keys.network],
      ];

export type ThrottleCheck =
  | { readonly kind: 'ALLOWED' }
  | {
      readonly kind: 'THROTTLED';
      readonly retryAfterSeconds: number;
      readonly key: ThrottleKeyName;
    }
  | { readonly kind: 'UNAVAILABLE' };

export async function checkThrottle(
  repo: StaffRepository,
  keys: AttemptKeys,
  nowMs: number,
): Promise<ThrottleCheck> {
  let until = 0;
  let worst: ThrottleKeyName = 'pair';
  for (const [name, key] of entries(keys)) {
    const doc = await repo.throttle(key);
    if (!doc.ok) return { kind: 'UNAVAILABLE' };
    const throttledUntil = doc.value?.throttledUntil ?? null;
    const at = throttledUntil === null ? 0 : Date.parse(throttledUntil);
    if (at > until) {
      until = at;
      worst = name;
    }
  }
  return until > nowMs
    ? { kind: 'THROTTLED', retryAfterSeconds: Math.ceil((until - nowMs) / 1000), key: worst }
    : { kind: 'ALLOWED' };
}

/** Records one failure on every key of the attempt and sets the resulting windows. */
export async function recordFailure(
  repo: StaffRepository,
  keys: AttemptKeys,
  nowMs: number,
): Promise<boolean> {
  const at = new Date(nowMs).toISOString();
  const expireAt = new Date(nowMs + COUNTER_LIFETIME_MS);
  for (const [name, key] of entries(keys)) {
    const doc = await repo.recordThrottleFailure(key, at, expireAt);
    if (!doc.ok) return false;
    const delay = throttleDelayMs(THROTTLE_RULES[name], doc.value.failures);
    if (delay > 0) {
      const set = await repo.setThrottledUntil(key, new Date(nowMs + delay).toISOString());
      if (!set.ok) return false;
    }
  }
  return true;
}

/**
 * A successful sign-in clears the device or (account + client) counter only. The account-wide
 * unknown-device counter is NOT cleared by the owner signing in elsewhere (that would let an
 * attacker reset it); it decays, or an administrator clears it.
 */
export async function recordSuccess(repo: StaffRepository, keys: AttemptKeys): Promise<void> {
  await repo.resetThrottle(keys.kind === 'KNOWN_DEVICE' ? keys.device : keys.pair);
}
