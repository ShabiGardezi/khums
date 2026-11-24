import 'reflect-metadata';

import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { verifyAuditChain } from '@khums/core';
import {
  adminSessionResponseSchema,
  problemDetailsSchema,
  staffAccountSchema,
  temporaryCredentialResponseSchema,
} from '@khums/validation';

import { AppModule } from '../src/app.module';
import { readAuditChain } from '../src/audit/audit-event.store';
import { AUDIT_COLLECTION } from '../src/audit/audit.service';
import { bootstrapSuperAdmin } from '../src/auth/bootstrap';
import { PASSWORD_HASHER, type PasswordHasher } from '../src/auth/password-hasher';
import { staffRepository } from '../src/auth/staff-repository';
import { STAFF_STORE, type StaffStore } from '../src/auth/staff-store';
import { loadConfig } from '../src/config';
import type { AppendOnlyCollection } from '../src/persistence/append-only-collection';
import { configureApp } from '../src/shared/http/configure-app';
import { staffBrowserClass, type StaffCall as Call } from './support/staff-browser';

/**
 * Staff authentication over HTTP (M4.6.2b): the real app, guard, cookies, CSRF layers, throttling
 * and in-memory stores. Each test plays a browser that keeps its own cookie jar.
 */

const WEB = 'https://web.khums.test';
/** Shared with the (simulated) web tier, which signs the client IP it got from Vercel's edge. */
const EDGE_SECRET = 'integration-edge-secret-0123456789abcdef';
const ADMIN = { username: 'it-admin', password: 'integration admin passphrase 01' };

const config = loadConfig({
  NODE_ENV: 'test',
  LOG_LEVEL: 'silent',
  CORS_ORIGINS: WEB,
  // Even with TRUST_PROXY on, the staff code never uses X-Forwarded-For (tested below).
  TRUST_PROXY: 'true',
  STAFF_AUTH_SECRET: 'integration-test-secret-0123456789abcdef',
  STAFF_EDGE_SECRET: EDGE_SECRET,
});
if (!config.ok) throw new Error(config.error.join('\n'));
const CONFIG = config.value;

let app: NestExpressApplication;
let url: string;
let audit: AppendOnlyCollection;
let adminId: string;

beforeAll(async () => {
  app = await NestFactory.create<NestExpressApplication>(AppModule.register(CONFIG), {
    logger: false,
  });
  configureApp(app, CONFIG);
  await app.listen(0, '127.0.0.1');
  url = (await app.getUrl()).replace('[::1]', '127.0.0.1');
  audit = app.get<AppendOnlyCollection>(AUDIT_COLLECTION);
  const seeded = await bootstrapSuperAdmin(
    {
      store: app.get<StaffStore>(STAFF_STORE),
      hasher: app.get<PasswordHasher>(PASSWORD_HASHER),
      now: Date.now(),
    },
    ADMIN,
  );
  if (!seeded.ok) throw new Error(seeded.error.kind);
  adminId = seeded.value.principalId;
});
afterAll(() => app.close());

const Browser = staffBrowserClass({ url: () => url, web: WEB, edgeSecret: EDGE_SECRET });
type Browser = InstanceType<typeof Browser>;

const codeOf = (json: unknown) => problemDetailsSchema.parse(json).code;

async function signedInAdmin(): Promise<Browser> {
  const admin = new Browser();
  expect((await admin.login(ADMIN.username, ADMIN.password)).status).toBe(200);
  return admin;
}

async function createAccount(admin: Browser, username: string) {
  const created = await admin.call('POST', '/admin/staff/accounts', {
    body: { username, reason: 'TEST account' },
  });
  expect(created.status).toBe(201);
  return temporaryCredentialResponseSchema.parse(created.json);
}

/** A scholar account with its permanent password set (the temporary one changed). */
async function activeScholar(
  admin: Browser,
  username: string,
  password = 'a long permanent scholar passphrase 42',
) {
  const temp = await createAccount(admin, username);
  const browser = new Browser();
  await browser.login(username, temp.temporaryPassword);
  const changed = await browser.call('POST', '/staff/auth/password', {
    body: { currentPassword: temp.temporaryPassword, newPassword: password },
  });
  expect(changed.status).toBe(200);
  return { browser, principalId: temp.principalId, password };
}

describe('sign-in', () => {
  it('sets HttpOnly session and readable CSRF cookies (__Host-, Secure, SameSite=Strict) and no token in the body', async () => {
    const browser = new Browser();
    const response = await browser.login(ADMIN.username, ADMIN.password);
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.json).toEqual({
      mustChangePassword: false,
      sessionExpiresAt: expect.any(String),
    });
    const session = response.setCookies.find((c) => c.startsWith('__Host-khums_staff='));
    const csrf = response.setCookies.find((c) => c.startsWith('__Host-khums_csrf='));
    expect(session).toMatch(/; Path=\/; .*HttpOnly; Secure; SameSite=Strict/);
    expect(csrf).toMatch(/; Path=\/; .*Secure; SameSite=Strict/);
    expect(csrf).not.toMatch(/HttpOnly/);
    for (const cookie of [session, csrf]) expect(cookie).not.toMatch(/Domain=/i);
    expect(JSON.stringify(response.json)).not.toContain(browser.jar.get('__Host-khums_staff'));
  });

  it('gives one generic answer for a wrong password and an unknown username', async () => {
    const wrong = await new Browser('198.51.100.1').login(
      ADMIN.username,
      'not the password at all',
    );
    const unknown = await new Browser('198.51.100.1').login(
      'nobody-here',
      'not the password at all',
    );
    for (const response of [wrong, unknown]) {
      expect(response.status).toBe(401);
      expect(codeOf(response.json)).toBe('INVALID_CREDENTIALS');
      expect(response.setCookies).toEqual([]);
    }
    expect(problemDetailsSchema.parse(wrong.json).detail).toBe(
      problemDetailsSchema.parse(unknown.json).detail,
    );
  });

  it('refuses sign-in from another origin or without same-origin fetch metadata (login CSRF)', async () => {
    for (const options of [
      { origin: null },
      { origin: 'https://evil.example' },
      { origin: 'null' },
      { fetchSite: null },
      { fetchSite: 'cross-site' },
      { fetchSite: 'same-site' },
      { fetchSite: 'none' },
    ] satisfies Call[]) {
      const response = await new Browser().login(ADMIN.username, ADMIN.password, options);
      expect([response.status, codeOf(response.json)], JSON.stringify(options)).toEqual([
        403,
        'CSRF_REJECTED',
      ]);
    }
  });

  it('rotates the session: the session presented at sign-in is revoked', async () => {
    const browser = await signedInAdmin();
    const old = new Map(browser.jar);
    await browser.login(ADMIN.username, ADMIN.password);
    const stale = new Browser();
    for (const [k, v] of old) stale.jar.set(k, v);
    const response = await stale.call('GET', '/admin/session');
    expect([response.status, codeOf(response.json)]).toEqual([401, 'SESSION_REVOKED']);
  });
});

describe('sessions and CSRF on staff routes', () => {
  it('needs the session cookie: no cookie (or only a bearer token) is 401 with a session challenge', async () => {
    const response = await new Browser().call('GET', '/admin/session', {
      extraHeaders: { authorization: 'Bearer eyJhbGciOiJub25lIn0.e30.' },
    });
    expect(response.status).toBe(401);
    expect(codeOf(response.json)).toBe('AUTHENTICATION_REQUIRED');
    expect(response.headers.get('www-authenticate')).toBe('Session realm="khums-staff"');
    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  it('validates the session server-side and returns the principal (AAL1 password sign-in, no MFA)', async () => {
    const admin = await signedInAdmin();
    const response = await admin.call('GET', '/admin/session');
    expect(response.status).toBe(200);
    const me = adminSessionResponseSchema.parse(response.json);
    expect(me).toMatchObject({
      principalId: adminId,
      username: ADMIN.username,
      roles: [{ role: 'SUPER_ADMIN', scope: { kind: 'ALL', marjaIds: [] } }],
      authentication: { assurance: 'AAL1', methods: ['PASSWORD'] },
      mustChangePassword: false,
    });
    // Decision 64 (owner decision 2026-11-23): SUPER_ADMIN holds every permission (formerly no
    // authoring, review, approval or publication permission).
    for (const p of [
      'governance.approve',
      'governance.publish',
      'governance.review.start',
      'governance.submit',
      'research.source.verify',
      'provisional.calculate',
      'identity.role.assign',
    ]) {
      expect(me.permissions).toContain(p);
    }
  });

  it('requires Origin, Sec-Fetch-Site and the session-bound token on unsafe requests (each layer alone)', async () => {
    const admin = await signedInAdmin();
    const other = await signedInAdmin();
    const token = admin.csrf ?? '';
    const flipped = `${token.slice(0, -1)}${token.endsWith('A') ? 'B' : 'A'}`;
    for (const [label, options] of [
      ['no token', { csrf: null }],
      ['token off by one character', { csrf: flipped }],
      ["another session's token", { csrf: other.csrf ?? '' }],
      ['foreign origin with the right token', { origin: 'https://evil.example' }],
      ['cross-site fetch with the right token', { fetchSite: 'cross-site' }],
      ['no fetch metadata', { fetchSite: null }],
    ] as const) {
      const response = await admin.call('POST', '/admin/staff/accounts', {
        body: { username: 'csrf-should-fail', reason: 'TEST' },
        ...options,
      });
      expect([response.status, codeOf(response.json)], label).toEqual([403, 'CSRF_REJECTED']);
    }
    const list = await admin.call('GET', '/admin/staff/accounts');
    expect(list.status).toBe(200);
    expect(JSON.stringify(list.json)).not.toContain('csrf-should-fail');
  });

  it('sign-out revokes the session and clears the session and CSRF cookies', async () => {
    const admin = await signedInAdmin();
    const copy = new Map(admin.jar);
    const out = await admin.call('POST', '/staff/auth/logout');
    expect(out.status).toBe(204);
    // Session and CSRF cookies are cleared; the device cookie stays (it only exempts this browser
    // from other clients' failures and authenticates nothing).
    expect([...admin.jar.keys()]).toEqual(['__Host-khums_device']);
    const replay = new Browser();
    for (const [k, v] of copy) replay.jar.set(k, v);
    expect(codeOf((await replay.call('GET', '/admin/session')).json)).toBe('SESSION_REVOKED');
  });
});

describe('temporary passwords and password change', () => {
  it('creates an account with a temporary password shown once (no-store)', async () => {
    const admin = await signedInAdmin();
    const created = await admin.call('POST', '/admin/staff/accounts', {
      body: { username: 'Temp.Scholar', reason: 'TEST onboarding' },
    });
    expect(created.status).toBe(201);
    expect(created.headers.get('cache-control')).toBe('no-store');
    const credential = temporaryCredentialResponseSchema.parse(created.json);
    expect(credential.username).toBe('temp.scholar');
    expect(credential.temporaryPassword).toMatch(/^[A-HJ-NP-Za-km-z2-9]{20}$/);
    const list = await admin.call('GET', '/admin/staff/accounts');
    expect(JSON.stringify(list.json)).not.toContain(credential.temporaryPassword);
    const duplicate = await admin.call('POST', '/admin/staff/accounts', {
      body: { username: 'temp.scholar', reason: 'TEST duplicate' },
    });
    expect([duplicate.status, codeOf(duplicate.json)]).toEqual([409, 'USERNAME_TAKEN']);
  });

  it('a temporary-password session can only change the password, which must differ from it', async () => {
    const admin = await signedInAdmin();
    const temp = await createAccount(admin, 'onboarding-scholar');
    const scholar = new Browser();
    const login = await scholar.login('onboarding-scholar', temp.temporaryPassword);
    expect(login.json).toMatchObject({ mustChangePassword: true });
    expect(
      adminSessionResponseSchema.parse((await scholar.call('GET', '/admin/session')).json)
        .mustChangePassword,
    ).toBe(true);
    const blocked = await scholar.call('GET', '/admin/staff/accounts');
    expect([blocked.status, codeOf(blocked.json)]).toEqual([403, 'PASSWORD_CHANGE_REQUIRED']);

    const reuse = await scholar.call('POST', '/staff/auth/password', {
      body: { currentPassword: temp.temporaryPassword, newPassword: temp.temporaryPassword },
    });
    expect([reuse.status, codeOf(reuse.json)]).toEqual([422, 'PASSWORD_REUSED']);
    const weak = await scholar.call('POST', '/staff/auth/password', {
      body: { currentPassword: temp.temporaryPassword, newPassword: 'short' },
    });
    expect([weak.status, codeOf(weak.json)]).toEqual([422, 'PASSWORD_POLICY_VIOLATION']);

    const before = new Map(scholar.jar);
    const changed = await scholar.call('POST', '/staff/auth/password', {
      body: {
        currentPassword: temp.temporaryPassword,
        newPassword: 'a brand new scholar passphrase',
      },
    });
    expect(changed.status).toBe(200);
    expect(changed.json).toMatchObject({ mustChangePassword: false });
    expect(scholar.jar.get('__Host-khums_staff')).not.toBe(before.get('__Host-khums_staff'));
    // The old session is gone, the new one works, and the temporary password no longer signs in.
    const stale = new Browser();
    for (const [k, v] of before) stale.jar.set(k, v);
    expect(codeOf((await stale.call('GET', '/admin/session')).json)).toBe('SESSION_REVOKED');
    expect((await scholar.call('GET', '/admin/session')).status).toBe(200);
    expect(
      codeOf((await new Browser().login('onboarding-scholar', temp.temporaryPassword)).json),
    ).toBe('INVALID_CREDENTIALS');
  });

  it('an administrator reset revokes every session and issues a new temporary password', async () => {
    const admin = await signedInAdmin();
    const { browser, principalId } = await activeScholar(admin, 'reset-scholar');
    const reset = await admin.call('POST', `/admin/staff/accounts/${principalId}/password-reset`, {
      body: { reason: 'TEST forgotten password' },
    });
    expect(reset.status).toBe(200);
    const credential = temporaryCredentialResponseSchema.parse(reset.json);
    expect(codeOf((await browser.call('GET', '/admin/session')).json)).toBe('SESSION_REVOKED');
    expect(
      (await new Browser().login('reset-scholar', credential.temporaryPassword)).json,
    ).toMatchObject({
      mustChangePassword: true,
    });
  });
});

describe('roles, Marja scopes and immediate revocation', () => {
  it('grants SCHOLAR for two Marjas; the target session ends at once; scope applies on next sign-in', async () => {
    const admin = await signedInAdmin();
    const scholar = await activeScholar(admin, 'sistani-scholar');
    const granted = await admin.call('POST', `/admin/staff/accounts/${scholar.principalId}/roles`, {
      body: {
        role: 'SCHOLAR',
        scope: { kind: 'MARJA', marjaIds: ['sistani', 'khamenei'] },
        reason: 'TEST first scholar',
      },
    });
    expect(granted.status).toBe(200);
    expect(staffAccountSchema.parse(granted.json).roles).toMatchObject([
      {
        role: 'SCHOLAR',
        scope: { kind: 'MARJA', marjaIds: ['sistani', 'khamenei'] },
        grantedBy: adminId,
      },
    ]);
    expect(codeOf((await scholar.browser.call('GET', '/admin/session')).json)).toBe(
      'SESSION_REVOKED',
    );
    const again = new Browser();
    await again.login('sistani-scholar', scholar.password);
    const me = adminSessionResponseSchema.parse((await again.call('GET', '/admin/session')).json);
    expect(me.roles).toEqual([
      { role: 'SCHOLAR', scope: { kind: 'MARJA', marjaIds: ['sistani', 'khamenei'] } },
    ]);
    expect(me.permissions).toContain('governance.approve');
    expect(me.permissions).not.toContain('identity.role.assign');
    // The scholar administers nobody: no account creation, grant, change or revocation.
    const denied = await again.call('POST', '/admin/staff/accounts', {
      body: { username: 'x-by-scholar', reason: 'TEST' },
    });
    expect([denied.status, codeOf(denied.json)]).toEqual([403, 'ACCESS_DENIED']);
    const victim = await activeScholar(admin, 'scholar-victim');
    const grantByScholar = await again.call(
      'POST',
      `/admin/staff/accounts/${victim.principalId}/roles`,
      {
        body: { role: 'SCHOLAR', scope: { kind: 'MARJA', marjaIds: ['sistani'] }, reason: 'TEST' },
      },
    );
    expect([grantByScholar.status, codeOf(grantByScholar.json)]).toEqual([403, 'ACCESS_DENIED']);
    const assignmentId = staffAccountSchema.parse(granted.json).roles[0]?.assignmentId ?? '';
    const replaceByScholar = await again.call(
      'POST',
      `/admin/staff/accounts/${scholar.principalId}/roles/${assignmentId}/replace`,
      {
        body: { role: 'SCHOLAR', scope: { kind: 'MARJA', marjaIds: ['sistani'] }, reason: 'TEST' },
      },
    );
    expect([replaceByScholar.status, codeOf(replaceByScholar.json)]).toEqual([
      403,
      'ACCESS_DENIED',
    ]);
  });

  it('refuses every legacy role at the contract, self-grants and bad scopes', async () => {
    const admin = await signedInAdmin();
    const other = await activeScholar(admin, 'scope-scholar');
    for (const role of [
      'GOVERNING_SCHOLAR',
      'RULE_PACK_AUTHOR',
      'RELIGIOUS_RESEARCHER',
      'SCHOLAR_REVIEWER',
      'INDEPENDENT_APPROVER',
      'AUDITOR',
    ]) {
      const legacy = await admin.call('POST', `/admin/staff/accounts/${other.principalId}/roles`, {
        body: { role, scope: { kind: 'MARJA', marjaIds: ['sistani'] }, reason: 'TEST legacy' },
      });
      expect([legacy.status, codeOf(legacy.json)], role).toEqual([400, 'VALIDATION_FAILED']);
    }
    const self = await admin.call('POST', `/admin/staff/accounts/${adminId}/roles`, {
      body: {
        role: 'SCHOLAR',
        scope: { kind: 'MARJA', marjaIds: ['sistani'] },
        reason: 'TEST self grant',
      },
    });
    expect([self.status, codeOf(self.json)]).toEqual([403, 'ACCESS_DENIED']);
    for (const scope of [
      { kind: 'ALL', marjaIds: [] },
      { kind: 'MARJA', marjaIds: ['no-such-marja'] },
    ]) {
      const bad = await admin.call('POST', `/admin/staff/accounts/${other.principalId}/roles`, {
        body: { role: 'SCHOLAR', scope, reason: 'TEST bad scope' },
      });
      expect([bad.status, codeOf(bad.json)], JSON.stringify(scope)).toEqual([422, 'SCOPE_INVALID']);
    }
    // Decision 64: SUPER_ADMIN and SCHOLAR may share an account (formerly 409 ROLE_INCOMPATIBLE).
    const second = await activeScholar(admin, 'second-admin');
    await admin.call('POST', `/admin/staff/accounts/${second.principalId}/roles`, {
      body: {
        role: 'SUPER_ADMIN',
        scope: { kind: 'ALL', marjaIds: [] },
        reason: 'TEST second administrator',
      },
    });
    const mixed = await admin.call('POST', `/admin/staff/accounts/${second.principalId}/roles`, {
      body: {
        role: 'SCHOLAR',
        scope: { kind: 'MARJA', marjaIds: ['sistani'] },
        reason: 'TEST mixing',
      },
    });
    expect(mixed.status).toBe(200);
  });

  it('changes a scholar’s Marjas in one audited step, then removes the assignment', async () => {
    const admin = await signedInAdmin();
    const scholar = await activeScholar(admin, 'change-scholar');
    const granted = staffAccountSchema.parse(
      (
        await admin.call('POST', `/admin/staff/accounts/${scholar.principalId}/roles`, {
          body: {
            role: 'SCHOLAR',
            scope: { kind: 'MARJA', marjaIds: ['sistani'] },
            reason: 'TEST assign',
          },
        })
      ).json,
    );
    const oldId = granted.roles[0]?.assignmentId ?? '';
    const session = new Browser();
    await session.login('change-scholar', scholar.password);
    const replace = (assignmentId: string, body: unknown) =>
      admin.call(
        'POST',
        `/admin/staff/accounts/${scholar.principalId}/roles/${assignmentId}/replace`,
        { body },
      );
    // An identical replacement and a legacy target role are refused; nothing changes.
    const same = await replace(oldId, {
      role: 'SCHOLAR',
      scope: { kind: 'MARJA', marjaIds: ['sistani'] },
      reason: 'TEST no-op',
    });
    expect([same.status, codeOf(same.json)]).toEqual([409, 'ROLE_ALREADY_HELD']);
    const legacy = await replace(oldId, {
      role: 'GOVERNING_SCHOLAR',
      scope: { kind: 'MARJA', marjaIds: ['khamenei'] },
      reason: 'TEST legacy',
    });
    expect(legacy.status).toBe(400);
    const changed = await replace(oldId, {
      role: 'SCHOLAR',
      scope: { kind: 'MARJA', marjaIds: ['khamenei', 'sistani'] },
      reason: 'TEST change Marjas',
    });
    expect(changed.status).toBe(200);
    const after = staffAccountSchema.parse(changed.json);
    expect(after.roles).toHaveLength(1);
    expect(after.roles[0]).toMatchObject({
      role: 'SCHOLAR',
      scope: { kind: 'MARJA', marjaIds: ['khamenei', 'sistani'] },
    });
    const newId = after.roles[0]?.assignmentId ?? '';
    expect(newId).not.toBe(oldId);
    // The old assignment is gone (replacing it again is refused) and the session ended.
    expect(
      (
        await replace(oldId, {
          role: 'SCHOLAR',
          scope: { kind: 'MARJA', marjaIds: ['sistani'] },
          reason: 'TEST stale',
        })
      ).status,
    ).toBe(404);
    expect(codeOf((await session.call('GET', '/admin/session')).json)).toBe('SESSION_REVOKED');
    // Append-only: one REVOKED and one GRANTED record were added, plus one audit event.
    const records = await staffRepository(app.get<StaffStore>(STAFF_STORE).collections).roleRecords(
      scholar.principalId,
    );
    expect(records.ok && records.value.map((r) => r.kind)).toEqual([
      'GRANTED',
      'REVOKED',
      'GRANTED',
    ]);
    const chain = await readAuditChain(audit);
    const replaced = chain.ok
      ? chain.value.filter(
          (e) =>
            (e as { type: string }).type === 'staff.role.replaced' &&
            (e as { targets: { id: string }[] }).targets.some((t) => t.id === scholar.principalId),
        )
      : [];
    expect(replaced).toHaveLength(1);
    expect(replaced[0]).toMatchObject({
      actor: adminId,
      marjaIds: ['sistani', 'khamenei'],
      details: {
        fromRole: 'SCHOLAR',
        fromAssignmentId: oldId,
        fromMarjaIds: ['sistani'],
        role: 'SCHOLAR',
        assignmentId: newId,
        reason: 'TEST change Marjas',
      },
    });
    // Remove the assignment.
    const removed = await admin.call(
      'POST',
      `/admin/staff/accounts/${scholar.principalId}/roles/${newId}/revoke`,
      { body: { reason: 'TEST remove assignment' } },
    );
    expect(staffAccountSchema.parse(removed.json).roles).toEqual([]);
  });

  it('converts a stored legacy GOVERNING_SCHOLAR assignment to SCHOLAR; it acted as SCHOLAR before', async () => {
    const admin = await signedInAdmin();
    const scholar = await activeScholar(admin, 'legacy-scholar');
    // A legacy record as written before decision 64 (seeded directly: it can no longer be granted).
    const legacyId = '00000000-0000-4000-8000-00000000c0de';
    const inserted = await app.get<StaffStore>(STAFF_STORE).collections.roles.insert({
      recordId: '00000000-0000-4000-8000-00000000c0df',
      kind: 'GRANTED',
      assignmentId: legacyId,
      principalId: scholar.principalId,
      role: 'GOVERNING_SCHOLAR',
      scope: { kind: 'MARJA', marjaIds: ['sistani'] },
      actor: adminId,
      at: new Date().toISOString(),
      reason: 'TEST legacy grant',
    });
    expect(inserted.kind).toBe('INSERTED');
    const listed = staffAccountSchema
      .array()
      .parse(
        ((await admin.call('GET', '/admin/staff/accounts')).json as { accounts: unknown[] })
          .accounts,
      );
    expect(listed.find((a) => a.username === 'legacy-scholar')?.roles).toMatchObject([
      { role: 'GOVERNING_SCHOLAR', assignmentId: legacyId },
    ]);
    const legacySession = new Browser();
    await legacySession.login('legacy-scholar', scholar.password);
    const before = adminSessionResponseSchema.parse(
      (await legacySession.call('GET', '/admin/session')).json,
    );
    expect(before.permissions).toContain('provisional.pack.enable');
    expect(before.permissions).not.toContain('identity.role.assign');
    const converted = await admin.call(
      'POST',
      `/admin/staff/accounts/${scholar.principalId}/roles/${legacyId}/replace`,
      {
        body: {
          role: 'SCHOLAR',
          scope: { kind: 'MARJA', marjaIds: ['sistani'] },
          reason: 'TEST convert legacy role',
        },
      },
    );
    expect(converted.status).toBe(200);
    expect(staffAccountSchema.parse(converted.json).roles).toMatchObject([
      { role: 'SCHOLAR', scope: { kind: 'MARJA', marjaIds: ['sistani'] } },
    ]);
    const after = new Browser();
    await after.login('legacy-scholar', scholar.password);
    const me = adminSessionResponseSchema.parse((await after.call('GET', '/admin/session')).json);
    expect(me.permissions).toEqual(before.permissions);
  });

  it('an administrator cannot replace its own assignment (LAST_SUPER_ADMIN is unit-tested in core)', async () => {
    const admin = await signedInAdmin();
    const accounts = staffAccountSchema
      .array()
      .parse(
        ((await admin.call('GET', '/admin/staff/accounts')).json as { accounts: unknown[] })
          .accounts,
      );
    const own = accounts.find((a) => a.principalId === adminId)?.roles[0]?.assignmentId ?? '';
    const self = await admin.call('POST', `/admin/staff/accounts/${adminId}/roles/${own}/replace`, {
      body: { role: 'SCHOLAR', scope: { kind: 'MARJA', marjaIds: ['sistani'] }, reason: 'TEST' },
    });
    expect([self.status, codeOf(self.json)]).toEqual([403, 'ACCESS_DENIED']);
  });

  it('revoking a role and suspending an account end sessions immediately; suspended accounts cannot sign in', async () => {
    const admin = await signedInAdmin();
    const scholar = await activeScholar(admin, 'suspend-scholar');
    const granted = staffAccountSchema.parse(
      (
        await admin.call('POST', `/admin/staff/accounts/${scholar.principalId}/roles`, {
          body: {
            role: 'SCHOLAR',
            scope: { kind: 'MARJA', marjaIds: ['khamenei'] },
            reason: 'TEST reviewer',
          },
        })
      ).json,
    );
    const session = new Browser();
    await session.login('suspend-scholar', scholar.password);
    const assignmentId = granted.roles[0]?.assignmentId ?? '';
    const revoked = await admin.call(
      'POST',
      `/admin/staff/accounts/${scholar.principalId}/roles/${assignmentId}/revoke`,
      {
        body: { reason: 'TEST no longer reviewing' },
      },
    );
    expect(staffAccountSchema.parse(revoked.json).roles).toEqual([]);
    expect(codeOf((await session.call('GET', '/admin/session')).json)).toBe('SESSION_REVOKED');

    await session.login('suspend-scholar', scholar.password);
    const suspended = await admin.call(
      'POST',
      `/admin/staff/accounts/${scholar.principalId}/status`,
      {
        body: { status: 'SUSPENDED', reason: 'TEST suspension' },
      },
    );
    expect(staffAccountSchema.parse(suspended.json).status).toBe('SUSPENDED');
    expect((await session.call('GET', '/admin/session')).status).toBe(401);
    const login = await new Browser().login('suspend-scholar', scholar.password);
    expect([login.status, codeOf(login.json)]).toEqual([403, 'ACCOUNT_NOT_ACTIVE']);
    const self = await admin.call('POST', `/admin/staff/accounts/${adminId}/status`, {
      body: { status: 'SUSPENDED', reason: 'TEST self' },
    });
    expect(self.status).toBe(403);
  });

  it('an administrator can revoke every session of another account', async () => {
    const admin = await signedInAdmin();
    const scholar = await activeScholar(admin, 'revoke-sessions-scholar');
    const revoked = await admin.call(
      'POST',
      `/admin/staff/accounts/${scholar.principalId}/sessions/revoke`,
      {
        body: { reason: 'TEST lost laptop' },
      },
    );
    expect(revoked.status).toBe(200);
    expect(codeOf((await scholar.browser.call('GET', '/admin/session')).json)).toBe(
      'SESSION_REVOKED',
    );
  });
});

describe('client IP: only the signed edge assertion counts (no spoofing)', () => {
  it('ignores X-Forwarded-For and forged, stale or replayed assertions (they all land in the peer bucket)', async () => {
    // Every attempt claims a different IP, but none is validly signed: they all count against the
    // TCP peer for this username, so the 6th attempt is throttled despite the "new" addresses.
    const modes = ['unsigned', 'wrong-key', 'stale', 'other-path', 'unsigned'] as const;
    for (const [i, ipMode] of modes.entries()) {
      const response = await new Browser().login('spoof-target', `wrong ${String(i)}`, {
        ip: `198.51.100.${String(10 + i)}`,
        ipMode,
      });
      expect(response.status, ipMode).toBe(401);
    }
    const sixth = await new Browser().login('spoof-target', 'wrong again', {
      ip: '198.51.100.99',
      ipMode: 'unsigned',
    });
    expect([sixth.status, codeOf(sixth.json)]).toEqual([429, 'LOGIN_THROTTLED']);
    // A validly signed, different client is a different bucket (the web tier vouches for it).
    expect((await new Browser('203.0.113.200').login('spoof-target', 'wrong signed')).status).toBe(
      401,
    );
  });

  it('one client failing against many accounts cannot slow sign-ins from other clients', async () => {
    const admin = await signedInAdmin();
    const scholar = await activeScholar(admin, 'bystander-scholar');
    const noisy = new Browser('192.0.2.13');
    for (let i = 0; i < 20; i += 1) {
      await noisy.login(`nobody-${String(i)}`, 'wrong password value');
    }
    // The noisy client is now throttled for any account …
    expect((await noisy.login('bystander-scholar', scholar.password)).status).toBe(429);
    // … but a different client signs in normally.
    expect(
      (await new Browser('203.0.113.31').login('bystander-scholar', scholar.password)).status,
    ).toBe(200);
  });
});

describe('distributed guessing cannot lock a scholar out', () => {
  it('a known device keeps signing in while distributed failures slow unknown devices; an administrator can clear it', async () => {
    const admin = await signedInAdmin();
    const scholar = await activeScholar(admin, 'targeted-scholar');
    // The scholar's usual browser already holds a device cookie from signing in.
    const usual = new Browser('203.0.113.50');
    expect((await usual.login('targeted-scholar', scholar.password)).status).toBe(200);
    expect(usual.jar.get('__Host-khums_device')).toMatch(/^v1\./);

    // Attackers on 12 different networks each try once: the account-wide unknown-device limit
    // (10 free failures) is reached, while no single client or network limit is.
    for (let i = 0; i < 12; i += 1) {
      await new Browser(`100.${String(64 + i)}.0.1`).login(
        'targeted-scholar',
        `guess ${String(i)}`,
      );
    }
    // A new device, even with the right password, is slowed (progressive, bounded) …
    const fresh = await new Browser('203.0.113.51').login('targeted-scholar', scholar.password);
    expect([fresh.status, codeOf(fresh.json)]).toEqual([429, 'LOGIN_THROTTLED']);
    expect(Number(fresh.headers.get('retry-after'))).toBeLessThanOrEqual(15 * 60);
    // … but the scholar's own browser is not affected at all.
    expect((await usual.login('targeted-scholar', scholar.password)).status).toBe(200);

    // A device cookie only exempts its own account: it does not help guess other accounts.
    const stolen = new Browser('192.0.2.200');
    stolen.jar.set('__Host-khums_device', usual.jar.get('__Host-khums_device') ?? '');
    for (let i = 0; i < 5; i += 1)
      await stolen.login('targeted-scholar', `stolen guess ${String(i)}`);
    expect((await stolen.login('targeted-scholar', scholar.password)).status).toBe(429);

    // Safe recovery: an administrator clears the account-wide counter.
    const cleared = await admin.call(
      'POST',
      `/admin/staff/accounts/${scholar.principalId}/throttle/clear`,
      {
        body: { reason: 'TEST distributed attack' },
      },
    );
    expect(cleared.status).toBe(200);
    expect(
      (await new Browser('203.0.113.52').login('targeted-scholar', scholar.password)).status,
    ).toBe(200);
  });

  it('a single attacker client is throttled after 5 failures with Retry-After', async () => {
    const admin = await signedInAdmin();
    const scholar = await activeScholar(admin, 'throttle-scholar');
    const attacker = new Browser('192.0.2.66');
    for (let i = 0; i < 5; i += 1) {
      expect(
        (await attacker.login('throttle-scholar', `wrong guess number ${String(i)}`)).status,
      ).toBe(401);
    }
    const throttled = await attacker.login('throttle-scholar', scholar.password);
    expect([throttled.status, codeOf(throttled.json)]).toEqual([429, 'LOGIN_THROTTLED']);
    expect(Number(throttled.headers.get('retry-after'))).toBeGreaterThan(0);
    expect(
      (await new Browser('203.0.113.77').login('throttle-scholar', scholar.password)).status,
    ).toBe(200);
  });
});

describe('audit', () => {
  it('records every sign-in and administration event in one verifiable chain, without secrets', async () => {
    const chain = await readAuditChain(audit);
    if (!chain.ok) throw new Error('audit unavailable');
    expect(verifyAuditChain(chain.value).ok).toBe(true);
    const types = new Set(chain.value.map((e) => (e as { type: string }).type));
    for (const type of [
      'staff.bootstrap.completed',
      'staff.signin.succeeded',
      'staff.signin.failed',
      'staff.signout',
      'staff.account.created',
      'staff.password.changed',
      'staff.password.reset',
      'staff.role.granted',
      'staff.role.revoked',
      'staff.role.replaced',
      'staff.account.statusChanged',
      'staff.sessions.revoked',
      'staff.throttle.cleared',
    ]) {
      expect(types, type).toContain(type);
    }
    const granted = chain.value.find((e) => (e as { type: string }).type === 'staff.role.granted');
    expect(granted).toMatchObject({
      actor: adminId,
      marjaIds: ['sistani', 'khamenei'],
      details: { role: 'SCHOLAR', reason: 'TEST first scholar' },
    });
    const serialized = JSON.stringify(chain.value);
    for (const secret of [
      ADMIN.password,
      'a brand new scholar passphrase',
      'wrong guess number',
      'nobody-here',
    ]) {
      expect(serialized).not.toContain(secret);
    }
  });
});
