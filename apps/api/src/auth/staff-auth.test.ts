import type { PinoLogger } from 'nestjs-pino';
import { describe, expect, it, vi } from 'vitest';

import { verifyAuditChain } from '@khums/core';

import { readAuditChain } from '../audit/audit-event.store';
import type { AppConfig } from '../config';
import { bootstrapAllowed, bootstrapSuperAdmin } from './bootstrap';
import { checkCsrfToken, checkRequestOrigin } from './csrf';
import { seedE2eFixture } from './e2e-fixture';
import {
  addressBuckets,
  CLIENT_IP_AT_HEADER,
  CLIENT_IP_HEADER,
  CLIENT_IP_SIGNATURE_HEADER,
  normalizeIp,
  resolveClientIp,
  signClientIp,
} from './client-ip';
import { DEVICE_COOKIE_LIFETIME_MS, issueDeviceCookie, verifyDeviceCookie } from './device-cookie';
import {
  attemptKeys,
  MAX_ACCOUNT_THROTTLE_MS,
  THROTTLE_RULES,
  throttleDelayMs,
} from './login-throttle';
import { argon2idHasher, parseArgon2id, PRODUCTION_ARGON2, TEST_ARGON2 } from './password-hasher';
import { keyedHash, newTemporaryPassword, newToken, sha256Hex, tokenMatchesHash } from './secrets';
import { StaffAuthService, type RequestFacts } from './staff-auth.service';
import { cookieNames, readCookie } from './staff-cookies';
import { staffRepository } from './staff-repository';
import { inMemoryStaffStore, mongoStaffStore, Rollback } from './staff-store';

/** Staff authentication units and service behaviour with a controllable clock (M4.6.2b). */

const hasher = argon2idHasher(TEST_ARGON2);
const WEB = 'https://web.khums.test';
const ADMIN = { username: 'unit-admin', password: 'unit test administrator passphrase' };

describe('Argon2id password hashing (node:crypto)', () => {
  it('produces PHC strings with fresh salts and verifies only the right password', async () => {
    const a = await hasher.hash('correct horse battery staple');
    const b = await hasher.hash('correct horse battery staple');
    expect(a).toMatch(/^\$argon2id\$v=19\$m=1024,t=1,p=1\$[A-Za-z0-9+/]{22}\$[A-Za-z0-9+/]{43}$/);
    expect(a).not.toBe(b);
    expect(await hasher.verify(a, 'correct horse battery staple')).toBe(true);
    expect(await hasher.verify(a, 'correct horse battery stapl')).toBe(false);
    expect(await hasher.verify('not-a-hash', 'x')).toBe(false);
  });

  it('refuses stored hashes with out-of-bounds parameters (no memory exhaustion)', async () => {
    const good = await hasher.hash('pw for bounds');
    const huge = good.replace('m=1024', 'm=99999999');
    expect(parseArgon2id(huge)).toBeNull();
    expect(await hasher.verify(huge, 'pw for bounds')).toBe(false);
  });

  it('flags hashes weaker than the current parameters for rehash', async () => {
    const weak = await hasher.hash('pw');
    expect(argon2idHasher(PRODUCTION_ARGON2).needsRehash(weak)).toBe(true);
    expect(hasher.needsRehash(weak)).toBe(false);
    expect(PRODUCTION_ARGON2).toEqual({ memory: 65_536, passes: 3, parallelism: 4 });
  });

  it('spends a real verification for unknown usernames', async () => {
    await expect(hasher.dummyVerify('anything')).resolves.toBeUndefined();
  });
});

describe('secrets', () => {
  it('generates 256-bit tokens stored only as hashes, compared in constant time', () => {
    const token = newToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(tokenMatchesHash(token, sha256Hex(token))).toBe(true);
    expect(tokenMatchesHash(`${token}x`, sha256Hex(token))).toBe(false);
    expect(tokenMatchesHash(token, 'not-a-hash')).toBe(false);
    expect(keyedHash('k1', 'user')).not.toBe(keyedHash('k2', 'user'));
  });

  it('temporary passwords are long and use unambiguous characters', () => {
    const passwords = new Set(Array.from({ length: 50 }, () => newTemporaryPassword()));
    expect(passwords.size).toBe(50);
    for (const p of passwords) expect(p).toMatch(/^[A-HJ-NP-Za-km-z2-9]{20}$/);
  });
});

describe('CSRF layers', () => {
  it('needs the exact configured Origin and same-origin fetch metadata', () => {
    expect(checkRequestOrigin({ origin: WEB, 'sec-fetch-site': 'same-origin' }, [WEB])).toBeNull();
    expect(checkRequestOrigin({ 'sec-fetch-site': 'same-origin' }, [WEB])).toBe(
      'CSRF_ORIGIN_REJECTED',
    );
    expect(
      checkRequestOrigin({ origin: `${WEB}.evil`, 'sec-fetch-site': 'same-origin' }, [WEB]),
    ).toBe('CSRF_ORIGIN_REJECTED');
    expect(checkRequestOrigin({ origin: WEB, 'sec-fetch-site': 'same-origin' }, [])).toBe(
      'CSRF_ORIGIN_REJECTED',
    );
    for (const site of ['cross-site', 'same-site', 'none', undefined]) {
      expect(checkRequestOrigin({ origin: WEB, 'sec-fetch-site': site }, [WEB]), String(site)).toBe(
        'CSRF_FETCH_SITE_REJECTED',
      );
    }
    expect(checkRequestOrigin({ origin: [WEB, WEB], 'sec-fetch-site': 'same-origin' }, [WEB])).toBe(
      'CSRF_ORIGIN_REJECTED',
    );
  });

  it('compares the token with the session-bound hash', () => {
    const token = newToken();
    expect(checkCsrfToken(token, sha256Hex(token))).toBeNull();
    expect(checkCsrfToken(undefined, sha256Hex(token))).toBe('CSRF_TOKEN_MISSING');
    expect(checkCsrfToken('', sha256Hex(token))).toBe('CSRF_TOKEN_MISSING');
    expect(checkCsrfToken(newToken(), sha256Hex(token))).toBe('CSRF_TOKEN_MISMATCH');
  });
});

describe('cookies', () => {
  it('uses __Host- names only with Secure cookies, and reads opaque token values only', () => {
    expect(cookieNames({ secureCookies: true })).toEqual({
      session: '__Host-khums_staff',
      csrf: '__Host-khums_csrf',
      device: '__Host-khums_device',
    });
    expect(cookieNames({ secureCookies: false })).toEqual({
      session: 'khums_staff',
      csrf: 'khums_csrf',
      device: 'khums_device',
    });
    const token = newToken();
    expect(readCookie(`a=b; __Host-khums_staff=${token}; c=d`, '__Host-khums_staff')).toBe(token);
    expect(readCookie('__Host-khums_staff=<script>', '__Host-khums_staff')).toBeUndefined();
    expect(readCookie(undefined, '__Host-khums_staff')).toBeUndefined();
  });
});

describe('throttle policy', () => {
  it('is progressive and bounded: account-level windows never exceed 15 minutes', () => {
    expect(throttleDelayMs(THROTTLE_RULES.pair, 4)).toBe(0);
    expect(throttleDelayMs(THROTTLE_RULES.pair, 5)).toBe(15_000);
    expect(throttleDelayMs(THROTTLE_RULES.pair, 6)).toBe(30_000);
    for (const name of ['device', 'pair', 'account'] as const) {
      expect(throttleDelayMs(THROTTLE_RULES[name], 10_000), name).toBe(MAX_ACCOUNT_THROTTLE_MS);
    }
    expect(throttleDelayMs(THROTTLE_RULES.account, 9)).toBe(0);
    expect(throttleDelayMs(THROTTLE_RULES.client, 19)).toBe(0);
    expect(throttleDelayMs(THROTTLE_RULES.client, 10_000)).toBe(60 * 60_000);
    expect(throttleDelayMs(THROTTLE_RULES.network, 99)).toBe(0);
  });

  it('known devices use only their own key; unknown devices use account, pair, client and network keys', () => {
    expect(Object.keys(attemptKeys('s', 'scholar', '1.1.1.1', 'device-1')).sort()).toEqual([
      'device',
      'kind',
    ]);
    const unknown = attemptKeys('s', 'Scholar', '1.1.1.1', null);
    expect(unknown.kind).toBe('UNKNOWN_DEVICE');
    const other = attemptKeys('s', 'scholar', '1.1.1.9', null);
    if (unknown.kind !== 'UNKNOWN_DEVICE' || other.kind !== 'UNKNOWN_DEVICE')
      throw new Error('fixture');
    expect(unknown.account).toBe(other.account);
    expect(unknown.pair).not.toBe(other.pair);
    expect(unknown.network).toBe(other.network); // same /24
    expect(JSON.stringify(unknown)).not.toContain('scholar');
    expect(JSON.stringify(unknown)).not.toContain('1.1.1.1');
  });
});

describe('client IP resolution (never X-Forwarded-For)', () => {
  const SECRET = 'edge-secret-0123456789abcdef0123456789';
  const NOW = Date.parse('2026-11-21T10:00:00.000Z');
  const signed = (
    ip: string,
    at = String(NOW),
    path = '/api/v1/staff/auth/login',
    key = SECRET,
  ) => ({
    [CLIENT_IP_HEADER]: ip,
    [CLIENT_IP_AT_HEADER]: at,
    [CLIENT_IP_SIGNATURE_HEADER]: signClientIp(key, ip, at, 'POST', path),
  });
  const resolve = (headers: Record<string, string>, edgeSecret: string | null = SECRET) =>
    resolveClientIp({
      headers,
      method: 'POST',
      path: '/api/v1/staff/auth/login',
      peerAddress: '::ffff:10.0.0.7',
      edgeSecret,
      nowMs: NOW,
    });

  it('accepts a fresh assertion signed by the web tier for this method and path', () => {
    expect(resolve(signed('203.0.113.9'))).toEqual({ ip: '203.0.113.9', source: 'SIGNED_EDGE' });
    expect(resolve(signed('2001:db8::1')).ip).toBe('2001:0db8:0000:0000:0000:0000:0000:0001');
  });

  it('falls back to the TCP peer for anything else', () => {
    const peer = { ip: '10.0.0.7', source: 'PEER' };
    expect(resolve({ 'x-forwarded-for': '203.0.113.9', 'x-real-ip': '203.0.113.9' })).toEqual(peer);
    expect(resolve({ [CLIENT_IP_HEADER]: '203.0.113.9' })).toEqual(peer);
    expect(resolve(signed('203.0.113.9', String(NOW - 31_000)))).toEqual(peer);
    expect(resolve(signed('203.0.113.9', String(NOW + 31_000)))).toEqual(peer);
    expect(resolve(signed('203.0.113.9', String(NOW), '/api/v1/admin/session'))).toEqual(peer);
    expect(
      resolve(signed('203.0.113.9', String(NOW), undefined, 'guess-of-the-edge-secret-00000000')),
    ).toEqual(peer);
    expect(resolve(signed('not-an-ip'))).toEqual(peer);
    expect(resolve(signed('203.0.113.9'), null)).toEqual(peer);
  });

  it('groups addresses into client and network buckets (IPv6 /64 and /48)', () => {
    expect(normalizeIp('::ffff:192.0.2.1')).toBe('192.0.2.1');
    expect(addressBuckets('192.0.2.1')).toEqual({
      client: 'v4:192.0.2.1',
      network: 'v4net:192.0.2',
    });
    const a = addressBuckets('2001:db8:aa:bb::1');
    const b = addressBuckets('2001:db8:aa:bb:ffff::2');
    expect(a.client).toBe(b.client);
    expect(addressBuckets('2001:db8:aa:cc::1').network).toBe(a.network);
  });
});

describe('device cookies', () => {
  const SECRET = 'device-secret-0123456789abcdef0123456789';
  const NOW = Date.parse('2026-11-21T10:00:00.000Z');
  const ID = '00000000-0000-4000-8000-000000000001';

  it('verify only for the account they were issued to, while fresh and untampered', () => {
    const cookie = issueDeviceCookie(SECRET, ID, NOW);
    expect(verifyDeviceCookie(SECRET, cookie, ID, NOW + 1000)).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(
      verifyDeviceCookie(SECRET, cookie, '00000000-0000-4000-8000-000000000002', NOW),
    ).toBeNull();
    expect(verifyDeviceCookie(SECRET, cookie, ID, NOW + DEVICE_COOKIE_LIFETIME_MS + 1)).toBeNull();
    expect(verifyDeviceCookie('another-secret-0123456789abcdef012345', cookie, ID, NOW)).toBeNull();
    expect(
      verifyDeviceCookie(
        SECRET,
        cookie.replace(/.$/, (c) => (c === 'A' ? 'B' : 'A')),
        ID,
        NOW,
      ),
    ).toBeNull();
    expect(verifyDeviceCookie(SECRET, undefined, ID, NOW)).toBeNull();
  });
});

function service(nowRef: { ms: number }, store = inMemoryStaffStore()) {
  const config = {
    env: 'test',
    staffAuth: {
      secret: 'unit-secret-0123456789abcdef0123456789',
      secureCookies: true,
      sessionIdleMs: 30 * 60_000,
      sessionAbsoluteMs: 8 * 3_600_000,
      allowedOrigins: [WEB],
      edgeSecret: null,
      e2eFixtureFile: undefined,
    },
  } as unknown as AppConfig;
  const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() } as unknown as PinoLogger;
  return {
    store,
    auth: new StaffAuthService(config, store, hasher, { now: () => nowRef.ms }, logger),
  };
}

const facts = (sessionToken?: string, method = 'GET', csrf?: string): RequestFacts => ({
  method,
  headers: {
    origin: WEB,
    'sec-fetch-site': 'same-origin',
    ...(csrf === undefined ? {} : { 'x-csrf-token': csrf }),
  },
  sessionToken,
  deviceCookie: undefined,
  clientIp: '203.0.113.5',
  requestId: 'req-1',
});

describe('sessions over time (service, controllable clock)', () => {
  const T0 = Date.parse('2026-11-21T10:00:00.000Z');

  async function signedIn() {
    const now = { ms: T0 };
    const { auth, store } = service(now);
    await bootstrapSuperAdmin({ store, hasher, now: T0 }, ADMIN);
    const login = await auth.login(ADMIN, facts());
    if (!login.ok) throw new Error(login.error.kind);
    return { now, auth, store, session: login.value };
  }

  it('ends a session after 30 idle minutes, and slides the idle limit on activity', async () => {
    const { now, auth, session } = await signedIn();
    now.ms = T0 + 29 * 60_000;
    expect((await auth.authenticate(facts(session.sessionToken))).ok).toBe(true);
    now.ms += 29 * 60_000; // 58 minutes after sign-in, 29 after the last request
    expect((await auth.authenticate(facts(session.sessionToken))).ok).toBe(true);
    now.ms += 31 * 60_000;
    expect(await auth.authenticate(facts(session.sessionToken))).toEqual({
      ok: false,
      error: { kind: 'REAUTHENTICATION_REQUIRED' },
    });
  });

  it('ends a session at the 8-hour absolute limit whatever the activity', async () => {
    const { now, auth, session } = await signedIn();
    for (let minutes = 20; minutes < 8 * 60; minutes += 20) {
      now.ms = T0 + minutes * 60_000;
      expect((await auth.authenticate(facts(session.sessionToken))).ok).toBe(true);
    }
    now.ms = T0 + 8 * 3_600_000;
    expect((await auth.authenticate(facts(session.sessionToken))).ok).toBe(false);
  });

  it('expires temporary passwords after 72 hours', async () => {
    const now = { ms: T0 };
    const { auth, store } = service(now);
    const repo = staffRepository(store.collections);
    await repo.insertAccount({
      principalId: '00000000-0000-4000-8000-000000000001',
      username: 'temp-user',
      usernameKey: 'temp-user',
      passwordHash: await hasher.hash('TemporaryPassw0rdXYZ'),
      passwordChangedAt: new Date(T0).toISOString(),
      mustChangePassword: true,
      temporaryPasswordExpiresAt: new Date(T0 + 72 * 3_600_000).toISOString(),
      status: 'ACTIVE',
      createdBy: 'admin',
      createdAt: new Date(T0).toISOString(),
      sessionEpoch: 0,
      version: 0,
    });
    now.ms = T0 + 71 * 3_600_000;
    expect(
      (await auth.login({ username: 'temp-user', password: 'TemporaryPassw0rdXYZ' }, facts())).ok,
    ).toBe(true);
    now.ms = T0 + 72 * 3_600_000;
    expect(
      await auth.login({ username: 'temp-user', password: 'TemporaryPassw0rdXYZ' }, facts()),
    ).toEqual({
      ok: false,
      error: { kind: 'TEMPORARY_PASSWORD_EXPIRED' },
    });
  });

  it('a bumped session epoch (any access change) ends existing sessions at once', async () => {
    const { auth, store, session } = await signedIn();
    const repo = staffRepository(store.collections);
    const account = await repo.accountByUsernameKey(ADMIN.username);
    if (!account.ok || account.value === null) throw new Error('fixture');
    await repo.updateAccount(account.value.principalId, account.value.version, {}, true);
    expect(await auth.authenticate(facts(session.sessionToken))).toEqual({
      ok: false,
      error: { kind: 'SESSION_REVOKED' },
    });
  });

  it('refuses unsafe requests without the CSRF layers even with a valid session', async () => {
    const { auth, session } = await signedIn();
    expect(
      (await auth.authenticate(facts(session.sessionToken, 'POST', session.csrfToken))).ok,
    ).toBe(true);
    expect(await auth.authenticate(facts(session.sessionToken, 'POST'))).toMatchObject({
      ok: false,
      error: { kind: 'CSRF_REJECTED', reason: 'CSRF_TOKEN_MISSING' },
    });
  });

  it('fails closed when the store is unavailable or staff auth is not configured', async () => {
    const now = { ms: T0 };
    const { auth } = service(
      now,
      mongoStaffStore(
        {
          collection: () => ({
            find: () => ({ toArray: () => Promise.reject(new Error('down')) }),
          }),
        } as never,
        {} as never,
      ),
    );
    expect(await auth.login(ADMIN, facts())).toEqual({ ok: false, error: { kind: 'UNAVAILABLE' } });
    const off = new StaffAuthService(
      { staffAuth: null } as unknown as AppConfig,
      inMemoryStaffStore(),
      hasher,
      { now: () => T0 },
      {} as PinoLogger,
    );
    expect(await off.authenticate(facts(newToken()))).toEqual({
      ok: false,
      error: { kind: 'UNAVAILABLE' },
    });
  });
});

describe('SUPER_ADMIN bootstrap (once, race-safe, no default credentials)', () => {
  const T0 = Date.parse('2026-11-21T10:00:00.000Z');

  it('creates exactly one SUPER_ADMIN with an audited, append-only bootstrap record', async () => {
    const store = inMemoryStaffStore();
    const result = await bootstrapSuperAdmin({ store, hasher, now: T0 }, ADMIN);
    expect(result.ok).toBe(true);
    const repo = staffRepository(store.collections);
    expect(await repo.activeSuperAdmins()).toEqual({ ok: true, value: 1 });
    const control = await repo.controlRecords();
    expect(control.ok && control.value).toMatchObject([
      { sequence: 0, kind: 'BOOTSTRAP', setting: 'SINGLE_ADMIN_V1' },
    ]);
    const chain = await readAuditChain(store.collections.audit);
    expect(chain.ok && verifyAuditChain(chain.value).ok).toBe(true);
    expect(chain.ok && chain.value).toMatchObject([
      { type: 'staff.bootstrap.completed', details: { role: 'SUPER_ADMIN' } },
    ]);
    expect(JSON.stringify(chain.ok && chain.value)).not.toContain(ADMIN.password);
  });

  it('never runs twice, even concurrently; the loser changes nothing', async () => {
    const store = inMemoryStaffStore();
    const [a, b] = await Promise.all([
      bootstrapSuperAdmin({ store, hasher, now: T0 }, ADMIN),
      bootstrapSuperAdmin({ store, hasher, now: T0 }, { ...ADMIN, username: 'other-admin' }),
    ]);
    expect([a.ok, b.ok].filter(Boolean)).toHaveLength(1);
    expect(await staffRepository(store.collections).activeSuperAdmins()).toEqual({
      ok: true,
      value: 1,
    });
    expect(await bootstrapAllowed(store)).toEqual({
      ok: false,
      error: { kind: 'ALREADY_BOOTSTRAPPED' },
    });
    expect(
      await bootstrapSuperAdmin({ store, hasher, now: T0 }, { ...ADMIN, username: 'third-admin' }),
    ).toEqual({
      ok: false,
      error: { kind: 'ALREADY_BOOTSTRAPPED' },
    });
  });

  it('applies the username and password policy', async () => {
    const store = inMemoryStaffStore();
    expect(
      await bootstrapSuperAdmin(
        { store, hasher, now: T0 },
        { username: 'x', password: ADMIN.password },
      ),
    ).toEqual({
      ok: false,
      error: { kind: 'USERNAME_INVALID' },
    });
    expect(
      await bootstrapSuperAdmin(
        { store, hasher, now: T0 },
        { username: 'admin1', password: 'short' },
      ),
    ).toEqual({
      ok: false,
      error: { kind: 'PASSWORD_POLICY_VIOLATION', issue: 'PASSWORD_TOO_SHORT' },
    });
  });

  it('the e2e fixture refuses durable stores', async () => {
    await expect(
      seedE2eFixture('unused.json', { ...inMemoryStaffStore(), durable: true }, hasher, T0),
    ).rejects.toThrow(/only for in-memory/);
  });

  it('a Rollback inside a unit of work returns its value', async () => {
    const store = inMemoryStaffStore();
    expect(await store.atomically(() => Promise.reject(new Rollback('refused')))).toBe('refused');
    await expect(store.atomically(() => Promise.reject(new Error('bug')))).rejects.toThrow('bug');
  });
});
