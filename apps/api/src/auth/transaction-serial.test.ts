import { describe, expect, it } from 'vitest';

import type { AppendOnlyCollection } from '../persistence/append-only-collection';
import type { ControlledCollection } from '../persistence/controlled-collection';
import { argon2idHasher, TEST_ARGON2 } from './password-hasher';
import { StaffAdministrationService } from './staff-administration.service';
import { StaffAuthService } from './staff-auth.service';
import { StaffAuthorizationService } from './staff-authorization.service';
import { attachStaffAuthentication } from './staff-request';
import { inMemoryStaffStore, type StaffCollections, type StaffStore } from './staff-store';
import { bootstrapSuperAdmin } from './bootstrap';
import type { AppConfig } from '../config';

/**
 * Regression (found by the live Atlas suite, 2026-11-21): MongoDB does not support concurrent
 * operations on one transaction session. This store fails any overlapping operation inside a unit
 * of work, as MongoDB does, so code running in `atomically` must issue its reads one at a time.
 */

function serialOnly<T extends object>(collection: T, inFlight: { count: number }): T {
  return new Proxy(collection, {
    get(target, key, receiver) {
      const value: unknown = Reflect.get(target, key, receiver);
      if (typeof value !== 'function' || key === 'spec') return value;
      return async (...args: unknown[]) => {
        inFlight.count += 1;
        if (inFlight.count > 1) {
          inFlight.count -= 1;
          throw new Error('concurrent operation on a transaction session');
        }
        try {
          return await (value as (...a: unknown[]) => Promise<unknown>).apply(target, args);
        } finally {
          inFlight.count -= 1;
        }
      };
    },
  });
}

function transactionLikeStore(): StaffStore {
  const inner = inMemoryStaffStore();
  return {
    ...inner,
    atomically: (work) =>
      inner.atomically((c) => {
        const inFlight = { count: 0 };
        const wrapped: StaffCollections = {
          accounts: serialOnly<ControlledCollection>(c.accounts, inFlight),
          sessions: serialOnly<ControlledCollection>(c.sessions, inFlight),
          throttles: serialOnly<ControlledCollection>(c.throttles, inFlight),
          roles: serialOnly<AppendOnlyCollection>(c.roles, inFlight),
          control: serialOnly<AppendOnlyCollection>(c.control, inFlight),
          audit: serialOnly<AppendOnlyCollection>(c.audit, inFlight),
        };
        return work(wrapped);
      }),
  };
}

describe('units of work never issue concurrent operations (MongoDB transaction rule)', () => {
  it('role grants, status changes, revocations and session revocation all complete', async () => {
    const WEB = 'https://web.khums.test';
    const store = transactionLikeStore();
    const hasher = argon2idHasher(TEST_ARGON2);
    const clock = { now: () => Date.now() };
    const config = {
      env: 'test',
      staffAuth: {
        secret: 'serial-secret-0123456789abcdef0123456789',
        edgeSecret: null,
        secureCookies: true,
        sessionIdleMs: 30 * 60_000,
        sessionAbsoluteMs: 8 * 3_600_000,
        allowedOrigins: [WEB],
        e2eFixtureFile: undefined,
      },
    } as unknown as AppConfig;
    const logger = { info: () => undefined, warn: () => undefined, error: () => undefined };
    const auth = new StaffAuthService(config, store, hasher, clock, logger as never);
    const admin = new StaffAdministrationService(
      config,
      store,
      hasher,
      clock,
      new StaffAuthorizationService(clock),
    );
    const PASSWORD = 'serial test administrator passphrase';
    expect(
      (
        await bootstrapSuperAdmin(
          { store, hasher, now: Date.now() },
          { username: 'serial-admin', password: PASSWORD },
        )
      ).ok,
    ).toBe(true);
    const login = await auth.login(
      { username: 'serial-admin', password: PASSWORD },
      {
        method: 'GET',
        headers: {},
        sessionToken: undefined,
        deviceCookie: undefined,
        clientIp: '203.0.113.9',
        requestId: null,
      },
    );
    if (!login.ok) throw new Error(login.error.kind);
    const authenticated = await auth.authenticate({
      method: 'POST',
      headers: {
        origin: WEB,
        'sec-fetch-site': 'same-origin',
        'x-csrf-token': login.value.csrfToken,
      },
      sessionToken: login.value.sessionToken,
      deviceCookie: undefined,
      clientIp: '203.0.113.9',
      requestId: null,
    });
    if (!authenticated.ok) throw new Error(authenticated.error.kind);
    const request = {};
    attachStaffAuthentication(request, authenticated.value);

    const created = await admin.create(
      request,
      { username: 'serial-scholar', reason: 'TEST' },
      null,
    );
    const granted = await admin.grantRole(
      request,
      created.principalId,
      {
        role: 'SCHOLAR',
        scope: { kind: 'MARJA', marjaIds: ['sistani'] },
        reason: 'TEST',
      },
      null,
    );
    expect(granted.roles).toHaveLength(1);
    await admin.revokeSessions(request, created.principalId, 'TEST', null);
    const revoked = await admin.revokeRole(
      request,
      created.principalId,
      granted.roles[0]?.assignmentId ?? '',
      'TEST',
      null,
    );
    expect(revoked.roles).toEqual([]);
    expect(
      (
        await admin.setStatus(
          request,
          created.principalId,
          { status: 'SUSPENDED', reason: 'TEST' },
          null,
        )
      ).status,
    ).toBe('SUSPENDED');
    await admin.resetPassword(request, created.principalId, 'TEST', null);
  });

  it('the test store really rejects overlapping operations (as MongoDB does)', async () => {
    const store = transactionLikeStore();
    await expect(
      store.atomically((c) =>
        Promise.all([
          c.accounts.find({}),
          c.roles.find({}, { sort: { field: 'at', direction: 1 } }),
        ]),
      ),
    ).rejects.toThrow('concurrent operation on a transaction session');
  });
});
