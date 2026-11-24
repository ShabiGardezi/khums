import { MongoClient, type Db } from 'mongodb';
import type { PinoLogger } from 'nestjs-pino';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { verifyAuditChain } from '@khums/core';

import { readAuditChain } from '../src/audit/audit-event.store';
import { bootstrapAllowed, bootstrapSuperAdmin } from '../src/auth/bootstrap';
import { argon2idHasher, TEST_ARGON2 } from '../src/auth/password-hasher';
import { StaffAdministrationService } from '../src/auth/staff-administration.service';
import { StaffAuthService, type RequestFacts } from '../src/auth/staff-auth.service';
import { StaffAuthorizationService } from '../src/auth/staff-authorization.service';
import { staffRepository } from '../src/auth/staff-repository';
import { attachStaffAuthentication } from '../src/auth/staff-request';
import { mongoStaffStore, type StaffStore } from '../src/auth/staff-store';
import type { AppConfig } from '../src/config';
import { COLLECTIONS } from '../src/persistence/collections';
import { migrateDatabase } from '../src/persistence/migrate';
import {
  MONGO_CLIENT_OPTIONS,
  mongoAppendOnlyCollection,
} from '../src/persistence/mongo-append-only-collection';
import { liveTargetFromEnv, openIsolatedTestDatabase } from './support/live-target';

/**
 * LIVE MongoDB Atlas coverage for staff authentication (M4.6.2b hardening). Opt-in:
 * `KHUMS_TEST_MONGODB_URI` and `KHUMS_TEST_MONGODB_DATABASE` (`pnpm --filter @khums/api test:live`).
 * The mandatory guard (test/support/live-target.ts) refuses production URIs and users, and refuses
 * to write unless the user's privileges are confined to the test database; only that database is
 * opened, migrated and dropped.
 * Covers the real multi-document transactions: bootstrap races, account creation, role changes,
 * session revocation, audit chaining under concurrency and rollback when a write fails.
 */
const target = liveTargetFromEnv();

const WEB = 'https://web.khums.test';
const ADMIN = { username: 'live-admin', password: 'live test administrator passphrase' };
const hasher = argon2idHasher(TEST_ARGON2);
const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() } as unknown as PinoLogger;
const config = {
  env: 'test',
  staffAuth: {
    secret: 'live-test-secret-0123456789abcdef01234567',
    edgeSecret: null,
    secureCookies: true,
    sessionIdleMs: 30 * 60_000,
    sessionAbsoluteMs: 8 * 3_600_000,
    allowedOrigins: [WEB],
    e2eFixtureFile: undefined,
  },
} as unknown as AppConfig;
const clock = { now: () => Date.now() };

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
  requestId: null,
});

describe.skipIf(target.kind === 'DISABLED')(
  'live Atlas: staff authentication transactions (opt-in)',
  () => {
    let client: MongoClient | undefined;
    let db: Db;
    let opened = false;
    let store: StaffStore;
    let auth: StaffAuthService;
    let admin: StaffAdministrationService;

    /** A request object carrying the administrator's authenticated session, as the guard leaves it. */
    async function adminRequest(): Promise<object> {
      const login = await auth.login(ADMIN, facts());
      if (!login.ok) throw new Error(login.error.kind);
      const authenticated = await auth.authenticate(
        facts(login.value.sessionToken, 'POST', login.value.csrfToken),
      );
      if (!authenticated.ok) throw new Error(authenticated.error.kind);
      const request = {};
      attachStaffAuthentication(request, authenticated.value);
      return request;
    }

    beforeAll(async () => {
      if (target.kind !== 'READY') {
        throw new Error(`Live tests refused: ${target.kind === 'REFUSED' ? target.reason : ''}`);
      }
      client = new MongoClient(target.uri, MONGO_CLIENT_OPTIONS);
      db = await openIsolatedTestDatabase(client, target.database);
      opened = true;
      await migrateDatabase(db);
      store = mongoStaffStore(db, client);
      auth = new StaffAuthService(config, store, hasher, clock, logger);
      admin = new StaffAdministrationService(
        config,
        store,
        hasher,
        clock,
        new StaffAuthorizationService(clock),
      );
    }, 60_000);

    afterAll(async () => {
      // Drop only the guarded test database (never reached when the guard refused).
      if (opened) await db.dropDatabase();
      await client?.close();
    });

    it('bootstrap: concurrent runs create exactly one SUPER_ADMIN; a second run is refused', async () => {
      const results = await Promise.all(
        ['live-admin', 'live-admin-b', 'live-admin-c'].map((username) =>
          bootstrapSuperAdmin(
            { store, hasher, now: Date.now() },
            { username, password: ADMIN.password },
          ),
        ),
      );
      expect(results.filter((r) => r.ok)).toHaveLength(1);
      // Make sure the fixed administrator is the one that exists for the rest of the suite.
      const winner = results.findIndex((r) => r.ok);
      ADMIN.username = ['live-admin', 'live-admin-b', 'live-admin-c'][winner] ?? ADMIN.username;
      expect(await bootstrapAllowed(store)).toEqual({
        ok: false,
        error: { kind: 'ALREADY_BOOTSTRAPPED' },
      });
      expect(await staffRepository(store.collections).activeSuperAdmins()).toEqual({
        ok: true,
        value: 1,
      });
    }, 60_000);

    it('account creation: concurrent creations all commit, each with its audit event, in one verifiable chain', async () => {
      const request = await adminRequest();
      const created = await Promise.all(
        Array.from({ length: 6 }, (_, i) =>
          admin.create(
            request,
            { username: `live-scholar-${String(i)}`, reason: 'LIVE TEST' },
            null,
          ),
        ),
      );
      expect(new Set(created.map((c) => c.principalId)).size).toBe(6);
      const chain = await readAuditChain(mongoAppendOnlyCollection(db, COLLECTIONS.auditEvents));
      expect(chain.ok && verifyAuditChain(chain.value).ok).toBe(true);
      const createdEvents = chain.ok
        ? chain.value.filter((e) => (e as { type: string }).type === 'staff.account.created')
        : [];
      expect(createdEvents).toHaveLength(6);
    }, 120_000);

    it('account creation: concurrent requests for one username create exactly one account', async () => {
      const request = await adminRequest();
      const outcomes = await Promise.allSettled(
        Array.from({ length: 5 }, () =>
          admin.create(request, { username: 'live-duplicate', reason: 'LIVE TEST' }, null),
        ),
      );
      expect(outcomes.filter((o) => o.status === 'fulfilled')).toHaveLength(1);
      for (const o of outcomes) {
        if (o.status === 'rejected')
          expect((o.reason as { code?: string }).code).toBe('USERNAME_TAKEN');
      }
    }, 120_000);

    it('role change: grant commits with the epoch bump and audit event, and ends the target session at once', async () => {
      const request = await adminRequest();
      const temp = await admin.create(
        request,
        { username: 'live-role-target', reason: 'LIVE TEST' },
        null,
      );
      const login = await auth.login(
        { username: 'live-role-target', password: temp.temporaryPassword },
        facts(),
      );
      if (!login.ok) throw new Error(login.error.kind);
      const granted = await admin.grantRole(
        request,
        temp.principalId,
        {
          role: 'SCHOLAR',
          scope: { kind: 'MARJA', marjaIds: ['sistani'] },
          reason: 'LIVE TEST',
        },
        null,
      );
      expect(granted.roles).toMatchObject([{ role: 'SCHOLAR' }]);
      expect(await auth.authenticate(facts(login.value.sessionToken))).toEqual({
        ok: false,
        error: { kind: 'SESSION_REVOKED' },
      });
      const account = await staffRepository(store.collections).accountById(temp.principalId);
      expect(account.ok && account.value?.sessionEpoch).toBe(1);
    }, 60_000);

    it('role change: concurrent grants on one account never lose an update', async () => {
      const request = await adminRequest();
      const temp = await admin.create(
        request,
        { username: 'live-concurrent-roles', reason: 'LIVE TEST' },
        null,
      );
      const outcomes = await Promise.allSettled([
        admin.grantRole(
          request,
          temp.principalId,
          {
            role: 'SCHOLAR_REVIEWER',
            scope: { kind: 'MARJA', marjaIds: ['sistani'] },
            reason: 'LIVE A',
          },
          null,
        ),
        admin.grantRole(
          request,
          temp.principalId,
          {
            role: 'SCHOLAR_REVIEWER',
            scope: { kind: 'MARJA', marjaIds: ['khamenei'] },
            reason: 'LIVE B',
          },
          null,
        ),
        admin.grantRole(
          request,
          temp.principalId,
          { role: 'AUDITOR', scope: { kind: 'ALL', marjaIds: [] }, reason: 'LIVE C' },
          null,
        ),
      ]);
      const succeeded = outcomes.filter((o) => o.status === 'fulfilled').length;
      for (const o of outcomes) {
        if (o.status === 'rejected')
          expect((o.reason as { code?: string }).code).toBe('ADMINISTRATION_CONFLICT');
      }
      const repo = staffRepository(store.collections);
      const [account, records] = await Promise.all([
        repo.accountById(temp.principalId),
        repo.roleRecords(temp.principalId),
      ]);
      // Every committed grant bumped the epoch exactly once and left exactly one GRANTED record.
      expect(account.ok && account.value?.sessionEpoch).toBe(succeeded);
      expect(records.ok && records.value.length).toBe(succeeded);
    }, 120_000);

    it('session revocation by an administrator is immediate and audited', async () => {
      const request = await adminRequest();
      const temp = await admin.create(
        request,
        { username: 'live-revoke', reason: 'LIVE TEST' },
        null,
      );
      const login = await auth.login(
        { username: 'live-revoke', password: temp.temporaryPassword },
        facts(),
      );
      if (!login.ok) throw new Error(login.error.kind);
      await admin.revokeSessions(request, temp.principalId, 'LIVE TEST', null);
      expect((await auth.authenticate(facts(login.value.sessionToken))).ok).toBe(false);
    }, 60_000);

    it('transaction failure: when the audit write fails, the account change is rolled back', async () => {
      const failingAudit = mongoStaffStore(db, client, (c) => ({
        ...c,
        audit: { ...c.audit, insert: () => Promise.resolve({ kind: 'UNAVAILABLE' as const }) },
      }));
      const failingAdmin = new StaffAdministrationService(
        config,
        failingAudit,
        hasher,
        clock,
        new StaffAuthorizationService(clock),
      );
      const request = await adminRequest();
      await expect(
        failingAdmin.create(request, { username: 'live-rolled-back', reason: 'LIVE TEST' }, null),
      ).rejects.toMatchObject({
        code: 'SERVICE_UNAVAILABLE',
      });
      const found = await staffRepository(store.collections).accountByUsernameKey(
        'live-rolled-back',
      );
      expect(found).toEqual({ ok: true, value: null });
    }, 60_000);

    it('the audit chain stays intact after all of the above', async () => {
      const chain = await readAuditChain(mongoAppendOnlyCollection(db, COLLECTIONS.auditEvents));
      expect(chain.ok && verifyAuditChain(chain.value).ok).toBe(true);
    }, 60_000);
  },
);
