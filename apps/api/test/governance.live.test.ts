import { MongoClient, type Db } from 'mongodb';
import type { StaffNamesService } from '../src/auth/staff-names.service';
import type { PinoLogger } from 'nestjs-pino';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { initialPolicyRegistry, verifyAuditChain } from '@khums/core';
import type { GovernanceRole } from '@khums/shared-types';

import { readAuditChain } from '../src/audit/audit-event.store';
import { StaffAuthorizationService } from '../src/auth/staff-authorization.service';
import { ApiProblemException } from '../src/common/errors/api-problem.exception';
import {
  appendOnlyGovernancePolicyStore,
  seedPolicyRegistry,
} from '../src/governance/governance-policy.store';
import { mongoGovernanceStore, type GovernanceStore } from '../src/governance/governance-store';
import {
  GovernanceService,
  type GovernanceCommandInput,
} from '../src/governance/governance.service';
import { inMemoryAppendOnlyCollection } from '../src/persistence/append-only-collection';
import { COLLECTIONS } from '../src/persistence/collections';
import { migrateDatabase } from '../src/persistence/migrate';
import {
  MONGO_CLIENT_OPTIONS,
  mongoAppendOnlyCollection,
} from '../src/persistence/mongo-append-only-collection';
import { inMemoryResearchStore } from '../src/research/research-store';
import { TEST_PACK } from './support/governance-ledgers';
import { liveTargetFromEnv, openIsolatedTestDatabase } from './support/live-target';
import { seedSourcedRuling, TEST_RULING_ID } from './support/research-rulings';
import { staffRequest, type TestScope } from './support/staff-principal';
import { PublicPackCache } from '../src/public/public-pack-cache';

/**
 * LIVE MongoDB Atlas coverage for the governance API (M4.6.4a). Opt-in (`test:live` only), behind
 * the same mandatory guard as the other live suites: production URIs and users are refused, the
 * test user's privileges must be exactly the nine approved actions on the test database, and only
 * that database is opened, migrated and dropped.
 *
 * Proves with real multi-document transactions that a command's ledger record, pack content and
 * audit event commit together or not at all, and that concurrent commands cannot fork a ledger.
 * TEST identities and a TEST pack only (no religious content).
 */
const target = liveTargetFromEnv();
const MARJA = TEST_PACK.metadata.marjaId;
const PACK = TEST_PACK.metadata.packId;
const evidence = { reference: 'docs/research/reviews/test/test-pack.REVIEW.md#live' };
const clock = { now: () => Date.now() };
const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() } as unknown as PinoLogger;

const as = (principalId: string, ...roles: readonly (readonly [GovernanceRole, TestScope])[]) =>
  staffRequest(Date.now(), principalId, ...roles);
const author = () => as('live-author', ['RULE_PACK_AUTHOR', [MARJA]]);
const reviewer = (id = 'live-reviewer') => as(id, ['SCHOLAR_REVIEWER', [MARJA]]);
const approver = () => as('live-approver', ['INDEPENDENT_APPROVER', [MARJA]]);
const admin = () => as('live-admin', ['SUPER_ADMIN', 'ALL']);
/** M5.2.1: activation needs an in-scope scholar outside the approval chain. */
const activator = () => as('live-activator', ['GOVERNING_SCHOLAR', [MARJA]]);

describe.skipIf(target.kind === 'DISABLED')(
  'live Atlas: governance API transactions (opt-in)',
  () => {
    let client: MongoClient | undefined;
    let db: Db;
    let opened = false;
    let store: GovernanceStore;
    let svc: GovernanceService;

    // The test pack's ruling (synthetic, approved) in an in-memory research store: no Atlas writes.
    const rulings = inMemoryResearchStore(inMemoryAppendOnlyCollection(COLLECTIONS.auditEvents));
    const service = (s: GovernanceStore) =>
      new GovernanceService(
        s,
        clock,
        new StaffAuthorizationService(clock),
        logger,
        rulings,
        new PublicPackCache(clock),
        { names: () => Promise.resolve(new Map<string, string>()) } as unknown as StaffNamesService,
      );
    const count = async (name: keyof typeof COLLECTIONS) =>
      db.collection(COLLECTIONS[name].name).countDocuments();

    beforeAll(async () => {
      await seedSourcedRuling(rulings, MARJA, { rulingId: TEST_RULING_ID });
      if (target.kind !== 'READY') {
        throw new Error(`Live tests refused: ${target.kind === 'REFUSED' ? target.reason : ''}`);
      }
      client = new MongoClient(target.uri, MONGO_CLIENT_OPTIONS);
      db = await openIsolatedTestDatabase(client, target.database);
      opened = true;
      await migrateDatabase(db);
      // TEST policy registry for the test Marja only (the shipped configuration names real Marjas).
      const registry = initialPolicyRegistry(
        [{ marjaId: MARJA, policy: 'INDEPENDENT_REVIEW_V1' }],
        '2026-01-01T00:00:00.000Z',
        'TEST live configuration',
        'live-seed',
      );
      if (!registry.ok) throw new Error('registry fixture');
      const seeded = await seedPolicyRegistry(
        appendOnlyGovernancePolicyStore(
          mongoAppendOnlyCollection(db, COLLECTIONS.governancePolicyRegistry),
        ),
        registry.value,
      );
      expect(seeded).toBe('SEEDED');
      store = mongoGovernanceStore(db, client);
      svc = service(store);
    }, 60_000);

    afterAll(async () => {
      // Drop only the guarded test database (never reached when the guard refused).
      if (opened) await db.dropDatabase();
      await client?.close();
    });

    const run = (who: object, input: GovernanceCommandInput, s = svc) =>
      s.execute(who, PACK, '1.0.0', input, 'live-request');

    it('rollback: when the audit event fails, neither the ledger record nor the content is written', async () => {
      const failing = service(
        mongoGovernanceStore(db, client, (s) => ({
          ...s,
          audit: () => Promise.resolve({ ok: false, error: 'AUDIT_STORE_UNAVAILABLE' }),
        })),
      );
      await expect(
        run(author(), { type: 'SUBMIT', expectedSequence: 0, pack: TEST_PACK }, failing),
      ).rejects.toMatchObject({ code: 'SERVICE_UNAVAILABLE' });
      expect(await count('governanceLedgerRecords')).toBe(0);
      expect(await count('rulePackContents')).toBe(0);
      expect(await count('auditEvents')).toBe(0);
    }, 60_000);

    it('concurrent reviewers: exactly one review starts; the others get 409 (no fork)', async () => {
      await run(author(), { type: 'SUBMIT', expectedSequence: 0, pack: TEST_PACK });
      const outcomes = await Promise.allSettled(
        ['live-reviewer', 'live-reviewer-2', 'live-reviewer-3'].map((id) =>
          run(reviewer(id), { type: 'START_REVIEW', expectedSequence: 1 }),
        ),
      );
      expect(outcomes.filter((o) => o.status === 'fulfilled')).toHaveLength(1);
      for (const o of outcomes) {
        if (o.status === 'rejected') {
          expect((o.reason as ApiProblemException).code).toBe('GOVERNANCE_CONFLICT');
        }
      }
      expect(await count('governanceLedgerRecords')).toBe(2);
    }, 120_000);

    it('full lifecycle commits ledger, content and audit together; SUPER_ADMIN cannot approve or activate', async () => {
      const started = await svc.get(admin(), PACK, '1.0.0');
      const winner = started.records[1]?.actor.subject ?? 'live-reviewer';
      await run(reviewer(winner), { type: 'COMPLETE_REVIEW', expectedSequence: 2, evidence });
      await expect(
        run(admin(), { type: 'APPROVE', expectedSequence: 3, evidence }),
      ).rejects.toMatchObject({ code: 'ACCESS_DENIED' });
      await run(approver(), { type: 'APPROVE', expectedSequence: 3, evidence });
      await run(approver(), { type: 'PUBLISH', expectedSequence: 4 });
      await expect(run(admin(), { type: 'ACTIVATE', expectedSequence: 5 })).rejects.toMatchObject({
        code: 'ACCESS_DENIED',
      });
      const activated = await run(activator(), { type: 'ACTIVATE', expectedSequence: 5 });
      expect(activated).toMatchObject({ state: 'PUBLISHED', activated: true, expectedSequence: 6 });
      expect(activated.records.every((r) => r.actor.kind === 'STAFF_PRINCIPAL')).toBe(true);
      expect(await count('rulePackContents')).toBe(2);
      const chain = await readAuditChain(mongoAppendOnlyCollection(db, COLLECTIONS.auditEvents));
      expect(chain.ok && verifyAuditChain(chain.value).ok).toBe(true);
      const types = chain.ok ? chain.value.map((e) => (e as { type: string }).type) : [];
      expect(types.filter((t) => t.startsWith('governance.pack.'))).toHaveLength(6);
      expect(types).toContain('governance.command.denied');
    }, 120_000);
  },
);
