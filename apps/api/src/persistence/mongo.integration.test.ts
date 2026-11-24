import { randomUUID } from 'node:crypto';

import { MongoClient, type Db } from 'mongodb';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { appendAuditEvent, verifyAuditChain } from '@khums/core';

import { appendOnlyAuditEventStore, readAuditChain } from '../audit/audit-event.store';
import {
  appendOnlyGovernancePolicyStore,
  seedPolicyRegistry,
} from '../governance/governance-policy.store';
import { initialRegistryFor } from '../governance/governance.module';
import { COLLECTIONS } from './collections';
import { migrateDatabase } from './migrate';
import { MONGO_CLIENT_OPTIONS, mongoAppendOnlyCollection } from './mongo-append-only-collection';
import { liveTargetFromEnv, openIsolatedTestDatabase } from '../../test/support/live-target';

/**
 * LIVE MongoDB checks (M4.6.3a). Opt-in: `KHUMS_TEST_MONGODB_URI` and
 * `KHUMS_TEST_MONGODB_DATABASE` (`pnpm --filter @khums/api test:live`;
 * docs/DEPLOYMENT_VERIFICATION.md §2). The mandatory guard (test/support/live-target.ts) refuses
 * production URIs and users, and refuses to write unless the user's privileges are confined to the
 * test database. Only that database is opened, migrated and dropped. Skipped without a URI.
 */
const target = liveTargetFromEnv();

describe.skipIf(target.kind === 'DISABLED')('live MongoDB (opt-in)', () => {
  let client: MongoClient | undefined;
  let db: Db;
  let opened = false;

  beforeAll(async () => {
    if (target.kind !== 'READY')
      throw new Error(`Live tests refused: ${target.kind === 'REFUSED' ? target.reason : ''}`);
    client = new MongoClient(target.uri, MONGO_CLIENT_OPTIONS);
    db = await openIsolatedTestDatabase(client, target.database);
    opened = true;
    await migrateDatabase(db);
  });

  afterAll(async () => {
    // Drop only the guarded test database (never reached when the guard refused).
    if (opened) await db.dropDatabase();
    await client?.close();
  });

  it('the migration is idempotent', async () => {
    const again = await migrateDatabase(db);
    expect(again.created).toEqual([]);
  });

  it('concurrent audit appends land in one unforked chain (real unique indexes)', async () => {
    const collection = mongoAppendOnlyCollection(db, COLLECTIONS.auditEvents);
    const store = appendOnlyAuditEventStore(collection);
    const results = await Promise.all(
      Array.from({ length: 8 }, () =>
        appendAuditEvent(
          store,
          {
            eventId: randomUUID(),
            type: 'test.live.append',
            actor: null,
            targets: [],
            marjaIds: [],
            details: {},
            requestId: null,
            occurredAt: '2026-11-21T10:00:00.000Z',
          },
          { maxAttempts: 10 },
        ),
      ),
    );
    expect(results.every((r) => r.ok)).toBe(true);
    const chain = await readAuditChain(collection);
    expect(chain.ok && verifyAuditChain(chain.value).ok).toBe(true);
  });

  it('the validator rejects documents missing chain fields', async () => {
    const outcome = await mongoAppendOnlyCollection(db, COLLECTIONS.auditEvents).insert({
      eventId: randomUUID(),
    });
    expect(outcome).toEqual({ kind: 'UNAVAILABLE' });
  });

  it('seeding the policy registry is idempotent against the real indexes', async () => {
    const store = appendOnlyGovernancePolicyStore(
      mongoAppendOnlyCollection(db, COLLECTIONS.governancePolicyRegistry),
    );
    const initial = initialRegistryFor(Date.parse('2026-11-21T00:00:00.000Z'));
    expect(await seedPolicyRegistry(store, initial)).toBe('SEEDED');
    expect(await seedPolicyRegistry(store, initial)).toBe('SEEDED');
  });
});
