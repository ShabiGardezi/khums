import { describe, expect, it, vi } from 'vitest';

import { verifyAuditChain } from '@khums/core';

import { readAuditChain } from '../audit/audit-event.store';
import { argon2idHasher, TEST_ARGON2 } from '../auth/password-hasher';
import { StaffAdministrationService } from '../auth/staff-administration.service';
import { StaffAuthService } from '../auth/staff-auth.service';
import { StaffAuthorizationService } from '../auth/staff-authorization.service';
import { attachStaffAuthentication } from '../auth/staff-request';
import { inMemoryStaffStore } from '../auth/staff-store';
import type { AppConfig } from '../config';
import { bootstrap, bootstrapWithStore, type SecretPrompt } from './operator-commands';

/**
 * The operator workflow end to end (M4.6.2b hardening): bootstrap dialogue → SUPER_ADMIN signs in
 * → creates the first scholar → temporary password handover → scholar's forced change. The real
 * terminal prompt and Atlas run are covered by the deployment runbook.
 */

const hasher = argon2idHasher(TEST_ARGON2);
const PASSWORD = 'operator chosen administrator passphrase';
const scripted = (...answers: string[]): SecretPrompt & { asked: string[] } => {
  const asked: string[] = [];
  return {
    interactive: true,
    asked,
    ask: (question) => {
      asked.push(question);
      return Promise.resolve(answers.shift() ?? '');
    },
  };
};

describe('bootstrap command dialogue', () => {
  it('refuses without a username or an interactive terminal (never reads a password otherwise)', async () => {
    const config = { mongodb: { uri: undefined } } as unknown as AppConfig;
    expect((await bootstrap(config, undefined, scripted(), Date.now)).output).toEqual({
      error: 'USERNAME_REQUIRED',
    });
    expect((await bootstrap(config, '--other-flag', scripted(), Date.now)).output).toEqual({
      error: 'USERNAME_REQUIRED',
    });
    const nonInteractive = { interactive: false, ask: vi.fn() };
    expect((await bootstrap(config, 'admin1', nonInteractive, Date.now)).output).toEqual({
      error: 'INTERACTIVE_TERMINAL_REQUIRED',
    });
    expect(nonInteractive.ask).not.toHaveBeenCalled();
  });

  it('asks twice, refuses a mismatch, then prints only the new principal id', async () => {
    const store = inMemoryStaffStore();
    expect(
      (await bootstrapWithStore(store, hasher, 'admin1', scripted(PASSWORD, 'different'), Date.now))
        .output,
    ).toEqual({
      error: 'PASSWORDS_DO_NOT_MATCH',
    });
    const prompt = scripted(PASSWORD, PASSWORD);
    const done = await bootstrapWithStore(store, hasher, 'admin1', prompt, Date.now);
    expect(done.exitCode).toBe(0);
    expect(done.output).toEqual({
      principalId: expect.stringMatching(/^[0-9a-f-]{36}$/),
      role: 'SUPER_ADMIN',
    });
    expect(JSON.stringify(done.output)).not.toContain(PASSWORD);
    expect(prompt.asked).toEqual(['New SUPER_ADMIN password: ', 'Repeat the password: ']);
    // A second run is refused before any password is asked.
    const again = scripted(PASSWORD, PASSWORD);
    expect((await bootstrapWithStore(store, hasher, 'admin2', again, Date.now)).output).toEqual({
      error: 'ALREADY_BOOTSTRAPPED',
    });
    expect(again.asked).toEqual([]);
  });

  it('applies the password policy to the bootstrap password', async () => {
    const result = await bootstrapWithStore(
      inMemoryStaffStore(),
      hasher,
      'admin1',
      scripted('short', 'short'),
      Date.now,
    );
    expect(result.output).toEqual({
      error: 'PASSWORD_POLICY_VIOLATION',
      issue: 'PASSWORD_TOO_SHORT',
    });
  });
});

describe('first scholar workflow after bootstrap', () => {
  it('bootstrap → admin sign-in → scholar created → temporary password handed over → forced change', async () => {
    const WEB = 'https://web.khums.test';
    const store = inMemoryStaffStore();
    const clock = { now: () => Date.now() };
    const config = {
      env: 'test',
      staffAuth: {
        secret: 'workflow-secret-0123456789abcdef012345678',
        edgeSecret: null,
        secureCookies: true,
        sessionIdleMs: 30 * 60_000,
        sessionAbsoluteMs: 8 * 3_600_000,
        allowedOrigins: [WEB],
        e2eFixtureFile: undefined,
      },
    } as unknown as AppConfig;
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const auth = new StaffAuthService(config, store, hasher, clock, logger as never);
    const admin = new StaffAdministrationService(
      config,
      store,
      hasher,
      clock,
      new StaffAuthorizationService(clock),
    );
    const facts = (sessionToken?: string, method = 'GET', csrf?: string) => ({
      method,
      headers: {
        origin: WEB,
        'sec-fetch-site': 'same-origin',
        ...(csrf === undefined ? {} : { 'x-csrf-token': csrf }),
      },
      sessionToken,
      deviceCookie: undefined,
      clientIp: '203.0.113.5',
      requestId: null,
    });

    // 1. The operator bootstraps the first SUPER_ADMIN.
    expect(
      (await bootstrapWithStore(store, hasher, 'founder', scripted(PASSWORD, PASSWORD), Date.now))
        .exitCode,
    ).toBe(0);
    // 2. The SUPER_ADMIN signs in (no forced change: the password was chosen at the prompt).
    const adminLogin = await auth.login({ username: 'founder', password: PASSWORD }, facts());
    if (!adminLogin.ok) throw new Error(adminLogin.error.kind);
    expect(adminLogin.value.mustChangePassword).toBe(false);
    const authenticated = await auth.authenticate(
      facts(adminLogin.value.sessionToken, 'POST', adminLogin.value.csrfToken),
    );
    if (!authenticated.ok) throw new Error(authenticated.error.kind);
    const request = {};
    attachStaffAuthentication(request, authenticated.value);
    // 3. Creates the first scholar and gives them the governing role for one Marja.
    const credential = await admin.create(
      request,
      { username: 'first-scholar', reason: 'First scholar account' },
      null,
    );
    await admin.grantRole(
      request,
      credential.principalId,
      {
        role: 'SCHOLAR',
        scope: { kind: 'MARJA', marjaIds: ['sistani'] },
        reason: 'First governing scholar',
      },
      null,
    );
    // 4. The temporary password is handed over out of band; the scholar must change it first.
    const scholarLogin = await auth.login(
      { username: 'first-scholar', password: credential.temporaryPassword },
      facts(),
    );
    if (!scholarLogin.ok) throw new Error(scholarLogin.error.kind);
    expect(scholarLogin.value.mustChangePassword).toBe(true);
    const scholarAuth = await auth.authenticate(facts(scholarLogin.value.sessionToken));
    if (!scholarAuth.ok) throw new Error(scholarAuth.error.kind);
    expect(scholarAuth.value.session.passwordChangeOnly).toBe(true);
    const changed = await auth.changePassword(
      scholarAuth.value,
      {
        currentPassword: credential.temporaryPassword,
        newPassword: 'the first scholar own passphrase',
      },
      facts(),
    );
    expect(changed.ok && changed.value.mustChangePassword).toBe(false);
    // 5. The scholar now holds governing authority for that Marja only. Decision 64: the founder
    // (SUPER_ADMIN) holds every permission too (formerly none of the religious ones).
    const after = changed.ok ? await auth.authenticate(facts(changed.value.sessionToken)) : null;
    expect(after?.ok && after.value.principal.roles).toMatchObject([
      { role: 'SCHOLAR', scope: { kind: 'MARJA', marjaIds: ['sistani'] } },
    ]);
    expect(authenticated.value.principal.permissions).toContain('governance.approve');
    // Every step is in one verifiable audit chain.
    const chain = await readAuditChain(store.collections.audit);
    expect(chain.ok && verifyAuditChain(chain.value).ok).toBe(true);
    expect(chain.ok && chain.value.map((e) => (e as { type: string }).type)).toEqual([
      'staff.bootstrap.completed',
      'staff.signin.succeeded',
      'staff.account.created',
      'staff.role.granted',
      'staff.signin.succeeded',
      'staff.password.changed',
    ]);
  });
});
