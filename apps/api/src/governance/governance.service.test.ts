import { readFileSync } from 'node:fs';

import type { StaffNamesService } from '../auth/staff-names.service';
import type { PinoLogger } from 'nestjs-pino';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { initialPolicyRegistry, sealRulePack, verifyAuditChain } from '@khums/core';
import type { GovernanceRole, RulePack } from '@khums/shared-types';

import { TEST_PACK } from '../../test/support/governance-ledgers';
import {
  advanceRuling,
  seedSourcedRuling,
  TEST_RULING_ID,
  testRulingIdFor,
} from '../../test/support/research-rulings';
import { staged } from '../../test/support/staged-collection';
import { staffRequest, type TestScope } from '../../test/support/staff-principal';
import { readAuditChain } from '../audit/audit-event.store';
import { PublicPackCache } from '../public/public-pack-cache';
import { StaffAuthorizationService } from '../auth/staff-authorization.service';
import { ApiProblemException } from '../common/errors/api-problem.exception';
import {
  inMemoryAppendOnlyCollection,
  type AppendOnlyCollection,
} from '../persistence/append-only-collection';
import { COLLECTIONS } from '../persistence/collections';
import { Rollback } from '../persistence/unit-of-work';
import { inMemoryResearchStore, type ResearchStore } from '../research/research-store';
import { inMemoryGovernancePolicyStore } from './governance-policy.store';
import {
  governanceStoresOver,
  inMemoryGovernanceStore,
  type GovernanceStore,
  type GovernanceStores,
} from './governance-store';
import { GovernanceService, type GovernanceCommandInput } from './governance.service';

/**
 * Governance API use cases (M4.6.4a) over in-memory stores with REAL rollback (staged writes that
 * commit only when the unit of work succeeds, serialized like MongoDB's retry-on-conflict). TEST
 * identities and a TEST pack only: no religious content.
 */

const MARJA = 'test-marja';
const SOLO_MARJA = 'test-solo-marja';
const SOLO_MARJA_2 = 'test-solo-marja-2';
const OTHER_MARJA = 'test-other-marja';
const PACK = TEST_PACK.metadata.packId;
const evidence = { reference: 'docs/research/reviews/test/test-pack.REVIEW.md#round-1' };

let now = Date.parse('2026-11-21T10:00:00.000Z');
const clock = { now: () => (now += 250) };
const iso = (ms: number) => new Date(ms).toISOString();

/** A request carrying a guard-established staff principal (fresh, so never stale). */
const as = (principalId: string, ...roles: readonly (readonly [GovernanceRole, TestScope])[]) =>
  staffRequest(now, principalId, ...roles);

const author = () => as('test-author', ['RULE_PACK_AUTHOR', [MARJA]]);
const reviewer = () => as('test-reviewer', ['SCHOLAR_REVIEWER', [MARJA]]);
const approver = () => as('test-approver', ['INDEPENDENT_APPROVER', [MARJA]]);
const admin = () => as('test-admin', ['SUPER_ADMIN', 'ALL']);
const auditor = () => as('test-auditor', ['AUDITOR', 'ALL']);
const solo = () => as('test-solo', ['GOVERNING_SCHOLAR', [SOLO_MARJA]]);
/** M5.2.1: an in-scope scholar outside the approval chain (administrators never activate). */
const activator = () => as('test-activator', ['GOVERNING_SCHOLAR', [MARJA]]);
/** M5.2.1: one scholar authorized for two single-scholar Marjas. */
const twoMarjas = () => as('test-two-marjas', ['GOVERNING_SCHOLAR', [SOLO_MARJA, SOLO_MARJA_2]]);

function pack(
  overrides: Partial<RulePack['metadata']> = {},
  label?: string,
  /** Ruling references of every rule; default: the pack Marja's synthetic approved ruling. */
  rulingRefs?: readonly string[],
): RulePack {
  const base = structuredClone(TEST_PACK) as RulePack & {
    inputCategories: { label: string }[];
  };
  const metadata = { ...base.metadata, ...overrides };
  const categories = base.inputCategories.map((c) => (label === undefined ? c : { ...c, label }));
  // Every rule cites the (synthetic, approved) ruling of the pack's own Marja (M5.3.6).
  const rules = base.rules.map((r) => ({
    ...r,
    rulingRefs: [...(rulingRefs ?? [`${testRulingIdFor(metadata.marjaId)}@1`])],
  }));
  const sealed = sealRulePack({ ...base, metadata, rules, inputCategories: categories });
  if (!sealed.ok) throw new Error('seal failed');
  return sealed.value;
}

// ---- Transactional in-memory store (staged writes, serialized units of work) ----

interface Harness {
  readonly svc: GovernanceService;
  readonly store: GovernanceStore;
  readonly ledgers: AppendOnlyCollection;
  readonly contents: AppendOnlyCollection;
  readonly audit: AppendOnlyCollection;
  readonly research: ResearchStore;
  readonly logger: { error: ReturnType<typeof vi.fn>; warn: ReturnType<typeof vi.fn> };
  /** TEST ONLY: replaces the stores inside the next units of work (failure injection). */
  wrap(next: (stores: GovernanceStores) => GovernanceStores): void;
}

function harness(): Harness {
  const registry = initialPolicyRegistry(
    [
      { marjaId: MARJA, policy: 'INDEPENDENT_REVIEW_V1' },
      { marjaId: SOLO_MARJA, policy: 'SINGLE_SCHOLAR_V1' },
      { marjaId: SOLO_MARJA_2, policy: 'SINGLE_SCHOLAR_V1' },
      { marjaId: OTHER_MARJA, policy: 'INDEPENDENT_REVIEW_V1' },
    ],
    '2026-01-01T00:00:00.000Z',
    'TEST initial configuration',
    'test-request',
  );
  if (!registry.ok) throw new Error('registry');
  const policies = inMemoryGovernancePolicyStore(registry.value);
  const ledgers = inMemoryAppendOnlyCollection(COLLECTIONS.governanceLedgerRecords);
  const contents = inMemoryAppendOnlyCollection(COLLECTIONS.rulePackContents);
  const audit = inMemoryAppendOnlyCollection(COLLECTIONS.auditEvents);
  let wrap: (s: GovernanceStores) => GovernanceStores = (s) => s;
  let queue: Promise<unknown> = Promise.resolve();
  const store: GovernanceStore = {
    stores: governanceStoresOver(ledgers, contents, policies, audit),
    audit,
    durable: false,
    atomically: <T>(work: (s: GovernanceStores) => Promise<T>): Promise<T> => {
      const run = async () => {
        const parts = [staged(ledgers), staged(contents), staged(audit)];
        const [l, c, a] = parts.map((p) => p.collection) as [
          AppendOnlyCollection,
          AppendOnlyCollection,
          AppendOnlyCollection,
        ];
        try {
          const result = await work(wrap(governanceStoresOver(l, c, policies, a)));
          for (const p of parts) await p.commit();
          return result;
        } catch (error) {
          if (error instanceof Rollback) return error.value as T;
          throw error;
        }
      };
      const next = queue.then(run, run);
      queue = next.catch(() => undefined);
      return next;
    },
  };
  const logger = { error: vi.fn(), warn: vi.fn(), info: vi.fn() };
  // Ruling versions live in the research store (M5.3.6); its own audit log, separate from this one.
  const research = inMemoryResearchStore(inMemoryAppendOnlyCollection(COLLECTIONS.auditEvents));
  const svc = new GovernanceService(
    store,
    clock,
    new StaffAuthorizationService(clock),
    logger as unknown as PinoLogger,
    research,
    new PublicPackCache(clock),
    { names: () => Promise.resolve(new Map<string, string>()) } as unknown as StaffNamesService,
  );
  return {
    svc,
    research,
    store,
    ledgers,
    contents,
    audit,
    logger,
    wrap: (next) => {
      wrap = next;
    },
  };
}

async function problemOf(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    if (error instanceof ApiProblemException) {
      return { status: error.getStatus(), code: error.code, detail: error.detail };
    }
    throw error;
  }
  throw new Error('expected a problem');
}

async function count(collection: AppendOnlyCollection) {
  const found = await collection.find({}, { sort: { field: 'recordId', direction: 1 } });
  return found.ok ? found.value.length : -1;
}

async function auditTypes(collection: AppendOnlyCollection) {
  const chain = await readAuditChain(collection);
  if (!chain.ok) throw new Error('audit');
  expect(verifyAuditChain(chain.value).ok).toBe(true);
  return chain.value.map((e) => (e as { type: string }).type);
}

let h: Harness;
beforeEach(async () => {
  h = harness();
  // The test pack's rule cites this synthetic ruling version (TEST_RULING_REF), approved.
  for (const marjaId of [MARJA, SOLO_MARJA, SOLO_MARJA_2, OTHER_MARJA]) {
    await seedSourcedRuling(h.research, marjaId, { rulingId: testRulingIdFor(marjaId) });
  }
});

const run = (who: object, input: GovernanceCommandInput, version = '1.0.0', packId = PACK) =>
  h.svc.execute(who, packId, version, input, 'req-test');

/** Takes 1.0.0 (or `version`) to PUBLISHED under INDEPENDENT_REVIEW_V1. */
async function toPublished(version = '1.0.0') {
  const content = pack({ version });
  await run(author(), { type: 'SUBMIT', expectedSequence: 0, pack: content }, version);
  await run(reviewer(), { type: 'START_REVIEW', expectedSequence: 1 }, version);
  await run(reviewer(), { type: 'COMPLETE_REVIEW', expectedSequence: 2, evidence }, version);
  await run(approver(), { type: 'APPROVE', expectedSequence: 3, evidence }, version);
  return run(approver(), { type: 'PUBLISH', expectedSequence: 4 }, version);
}

describe('lifecycle through the API service', () => {
  it('runs submit → review → approve → publish → activate with session actors, write-once content and one audit event per step', async () => {
    const published = await toPublished();
    expect(published).toMatchObject({ state: 'PUBLISHED', activated: false, expectedSequence: 5 });
    const activated = await run(activator(), { type: 'ACTIVATE', expectedSequence: 5 });
    expect(activated).toMatchObject({
      packId: PACK,
      version: '1.0.0',
      marjaId: MARJA,
      state: 'PUBLISHED',
      policy: 'INDEPENDENT_REVIEW_V1',
      activated: true,
      expectedSequence: 6,
    });
    expect(activated.records.map((r) => [r.type, r.actor.kind, r.actor.subject])).toEqual([
      ['SUBMITTED', 'STAFF_PRINCIPAL', 'test-author'],
      ['REVIEW_STARTED', 'STAFF_PRINCIPAL', 'test-reviewer'],
      ['REVIEW_COMPLETED', 'STAFF_PRINCIPAL', 'test-reviewer'],
      ['APPROVED', 'STAFF_PRINCIPAL', 'test-approver'],
      ['PUBLISHED', 'STAFF_PRINCIPAL', 'test-approver'],
      ['ACTIVATED', 'STAFF_PRINCIPAL', 'test-activator'],
    ]);
    // One digest bound throughout (the stored content: the authored pack plus its server-computed
    // ruling snapshot, M5.3.6); the evidence reference is recorded.
    const digests = new Set(activated.records.map((r) => r.contentDigest));
    expect(digests.size).toBe(1);
    expect(digests.has(pack().metadata.integrity?.digest ?? '')).toBe(false);
    expect(activated.records[2]?.evidenceReference).toBe(evidence.reference);
    // Submitted and published content stored once each; the published copy verifies.
    const docs = await h.contents.find({}, { sort: { field: 'recordId', direction: 1 } });
    expect(docs.ok && docs.value.map((d) => (d as { kind: string }).kind)).toEqual([
      'SUBMITTED',
      'PUBLISHED',
    ]);
    const publishedDoc = await h.store.stores.contents.load(
      `${PACK}@1.0.0#4`,
      'PUBLISHED',
      activated.contentDigest ?? '',
    );
    expect(publishedDoc.kind === 'FOUND' && publishedDoc.value.pack.metadata.status).toBe(
      'PUBLISHED',
    );
    expect(await auditTypes(h.audit)).toEqual([
      'governance.pack.submitted',
      'governance.pack.reviewStarted',
      'governance.pack.reviewCompleted',
      'governance.pack.approved',
      'governance.pack.published',
      'governance.pack.activated',
    ]);
    const chain = await readAuditChain(h.audit);
    const events = chain.ok ? (chain.value as { actor: string; marjaIds: string[] }[]) : [];
    expect(events.map((e) => e.actor)).toEqual([
      'test-author',
      'test-reviewer',
      'test-reviewer',
      'test-approver',
      'test-approver',
      'test-activator',
    ]);
    expect(events.every((e) => e.marjaIds.join() === MARJA)).toBe(true);
    // The audit log never contains pack content.
    expect(JSON.stringify(chain)).not.toContain('TEST category');
  });

  it('lets one governing scholar carry a pack alone under SINGLE_SCHOLAR_V1', async () => {
    const content = pack({ marjaId: SOLO_MARJA, packId: 'test-solo-pack' });
    const r = (input: GovernanceCommandInput) => run(solo(), input, '1.0.0', 'test-solo-pack');
    await r({ type: 'SUBMIT', expectedSequence: 0, pack: content });
    await r({ type: 'START_REVIEW', expectedSequence: 1 });
    await r({ type: 'COMPLETE_REVIEW', expectedSequence: 2, evidence });
    await r({ type: 'APPROVE', expectedSequence: 3, evidence });
    await r({ type: 'PUBLISH', expectedSequence: 4 });
    const activated = await r({ type: 'ACTIVATE', expectedSequence: 5 });
    expect(activated).toMatchObject({ policy: 'SINGLE_SCHOLAR_V1', activated: true });
  });

  it('decision 64: a SCHOLAR carries a pack alone too; a SCHOLAR of another Marja cannot act', async () => {
    const content = pack({ marjaId: SOLO_MARJA, packId: 'test-scholar-pack' });
    const scholar = () => as('test-new-scholar', ['SCHOLAR', [SOLO_MARJA]]);
    const elsewhere = () => as('test-new-scholar-x', ['SCHOLAR', [OTHER_MARJA]]);
    const r = (who: ReturnType<typeof scholar>, input: GovernanceCommandInput) =>
      run(who, input, '1.0.0', 'test-scholar-pack');
    expect(
      await problemOf(r(elsewhere(), { type: 'SUBMIT', expectedSequence: 0, pack: content })),
    ).toMatchObject({ status: 403, code: 'ACCESS_DENIED' });
    await r(scholar(), { type: 'SUBMIT', expectedSequence: 0, pack: content });
    expect(
      await problemOf(r(elsewhere(), { type: 'START_REVIEW', expectedSequence: 1 })),
    ).toMatchObject({ status: 404 });
    await r(scholar(), { type: 'START_REVIEW', expectedSequence: 1 });
    await r(scholar(), { type: 'COMPLETE_REVIEW', expectedSequence: 2, evidence });
    await r(scholar(), { type: 'APPROVE', expectedSequence: 3, evidence });
    await r(scholar(), { type: 'PUBLISH', expectedSequence: 4 });
    const activated = await r(scholar(), { type: 'ACTIVATE', expectedSequence: 5 });
    expect(activated).toMatchObject({ policy: 'SINGLE_SCHOLAR_V1', activated: true });
  });

  it('reads a pack version and lists versions only within the caller’s scope', async () => {
    await toPublished();
    expect(await h.svc.get(reviewer(), PACK, '1.0.0')).toMatchObject({ state: 'PUBLISHED' });
    expect(await h.svc.list(auditor())).toHaveLength(1);
    expect(await h.svc.list(admin(), MARJA)).toHaveLength(1);
    expect(await h.svc.list(admin(), OTHER_MARJA)).toEqual([]);
    // Decision 64: cross-Marja access covers provisional packs and research only, never the
    // governance ledger.
    expect(await h.svc.list(as('test-scholar-x', ['SCHOLAR', [OTHER_MARJA]]))).toEqual([]);
    const outsider = as('test-outsider', ['SCHOLAR_REVIEWER', [OTHER_MARJA]]);
    expect(await h.svc.list(outsider)).toEqual([]);
    // Out of scope looks exactly like a missing version.
    expect(await problemOf(h.svc.get(outsider, PACK, '1.0.0'))).toMatchObject({
      status: 404,
      code: 'PACK_VERSION_NOT_FOUND',
    });
    expect(await problemOf(h.svc.get(reviewer(), PACK, '9.9.9'))).toMatchObject({ status: 404 });
    expect(await problemOf(h.svc.get(reviewer(), 'test-unknown-pack', '1.0.0'))).toMatchObject({
      status: 404,
    });
  });

  it('supersedes a published version only by a newer published version of the same pack', async () => {
    await toPublished('1.0.0');
    expect(
      await problemOf(
        run(approver(), { type: 'SUPERSEDE', expectedSequence: 5, successorVersion: '1.1.0' }),
      ),
    ).toMatchObject({ status: 409, code: 'GOVERNANCE_REFUSED' });
    await toPublished('1.1.0');
    const superseded = await run(approver(), {
      type: 'SUPERSEDE',
      expectedSequence: 5,
      successorVersion: '1.1.0',
    });
    expect(superseded.state).toBe('SUPERSEDED');
    expect(
      await problemOf(run(activator(), { type: 'ACTIVATE', expectedSequence: 6 })),
    ).toMatchObject({
      status: 409,
      code: 'GOVERNANCE_REFUSED',
    });
  });
});

describe('SUPER_ADMIN holds every governance permission (decision 64)', () => {
  it('may submit; separation of duties still applies to it; auditors stay denied, nothing written', async () => {
    // Policy change (owner decision 2026-11-23): formerly every command here was 403 for
    // SUPER_ADMIN. An auditor (no governance write permission) now provides the denial check.
    const denied = await problemOf(
      run(auditor(), { type: 'SUBMIT', expectedSequence: 0, pack: pack() }),
    );
    expect(denied).toMatchObject({ status: 403, code: 'ACCESS_DENIED' });
    expect(await count(h.ledgers)).toBe(0);
    expect(await count(h.contents)).toBe(0);

    await run(admin(), { type: 'SUBMIT', expectedSequence: 0, pack: pack() });
    expect(await count(h.ledgers)).toBe(1);
    // INDEPENDENT_REVIEW_V1: the administrator, now an author, cannot review its own submission.
    expect(
      await problemOf(run(admin(), { type: 'START_REVIEW', expectedSequence: 1 })),
    ).toMatchObject({
      status: 403,
      code: 'ACCESS_DENIED',
    });
    for (const input of [
      { type: 'START_REVIEW', expectedSequence: 1 },
      { type: 'APPROVE', expectedSequence: 1, evidence },
      { type: 'PUBLISH', expectedSequence: 1 },
    ] as const) {
      const result = await problemOf(run(auditor(), input));
      expect(result, input.type).toMatchObject({ status: 403, code: 'ACCESS_DENIED' });
    }
    const types = await auditTypes(h.audit);
    expect(types.filter((t) => t === 'governance.command.denied')).toHaveLength(5);
    expect(types.filter((t) => t === 'governance.pack.submitted')).toHaveLength(1);
    expect(JSON.stringify(await readAuditChain(h.audit))).not.toContain('TEST category');
  });

  it('may withdraw normally (decision 64); emergency withdrawal still needs a published version', async () => {
    await run(author(), { type: 'SUBMIT', expectedSequence: 0, pack: pack() });
    // Not before publication.
    expect(
      await problemOf(
        run(admin(), {
          type: 'EMERGENCY_WITHDRAW',
          expectedSequence: 1,
          reason: 'ERROR_FOUND',
          note: 'TEST emergency note',
        }),
      ),
    ).toMatchObject({ status: 409, code: 'GOVERNANCE_REFUSED' });
    // Formerly 403: the normal withdrawal is now allowed for SUPER_ADMIN.
    const withdrawn = await run(admin(), {
      type: 'WITHDRAW',
      expectedSequence: 1,
      reason: 'OTHER',
    });
    expect(withdrawn.state).toBe('WITHDRAWN');
  });

  it('an emergency withdrawal of a published version is audited with its reason', async () => {
    await toPublished();
    // Decision 64: SUPER_ADMIN holds activation now (formerly 403); auditors stay denied.
    expect(
      await problemOf(run(auditor(), { type: 'ACTIVATE', expectedSequence: 5 })),
    ).toMatchObject({ status: 403, code: 'ACCESS_DENIED' });
    const withdrawn = await run(admin(), {
      type: 'EMERGENCY_WITHDRAW',
      expectedSequence: 5,
      reason: 'ERROR_FOUND',
      note: 'TEST emergency: content error reported',
    });
    expect(withdrawn.state).toBe('WITHDRAWN');
    expect(withdrawn.records.at(-1)).toMatchObject({
      type: 'WITHDRAWN',
      withdrawalReason: 'ERROR_FOUND',
      actor: { kind: 'STAFF_PRINCIPAL', subject: 'test-admin' },
    });
    const chain = await readAuditChain(h.audit);
    const last = chain.ok
      ? (chain.value.at(-1) as {
          type: string;
          actor: string;
          marjaIds: string[];
          details: Record<string, unknown>;
        })
      : null;
    expect(last).toMatchObject({
      type: 'governance.pack.emergencyWithdrawn',
      actor: 'test-admin',
      marjaIds: [MARJA],
      details: {
        command: 'EMERGENCY_WITHDRAW',
        emergency: true,
        emergencyNote: 'TEST emergency: content error reported',
        withdrawalReason: 'ERROR_FOUND',
      },
    });
    // Terminal: nothing further, not even activation by a scholar.
    expect(
      await problemOf(run(activator(), { type: 'ACTIVATE', expectedSequence: 6 })),
    ).toMatchObject({ status: 409, code: 'GOVERNANCE_REFUSED' });
  });
});

describe('Marja-scoped authorization and separation of duties', () => {
  it('denies authors and reviewers outside the pack’s Marja (commands look like a missing version)', async () => {
    const otherAuthor = as('test-other-author', ['RULE_PACK_AUTHOR', [OTHER_MARJA]]);
    expect(
      await problemOf(run(otherAuthor, { type: 'SUBMIT', expectedSequence: 0, pack: pack() })),
    ).toMatchObject({ status: 403, code: 'ACCESS_DENIED' });
    await run(author(), { type: 'SUBMIT', expectedSequence: 0, pack: pack() });
    const otherReviewer = as('test-other-reviewer', ['SCHOLAR_REVIEWER', [OTHER_MARJA]]);
    expect(
      await problemOf(run(otherReviewer, { type: 'START_REVIEW', expectedSequence: 1 })),
    ).toMatchObject({ status: 404, code: 'PACK_VERSION_NOT_FOUND' });
  });

  it('refuses self-review and self-approval under INDEPENDENT_REVIEW_V1', async () => {
    const authorReviewer = () =>
      as('test-author', ['RULE_PACK_AUTHOR', [MARJA]], ['SCHOLAR_REVIEWER', [MARJA]]);
    await run(authorReviewer(), { type: 'SUBMIT', expectedSequence: 0, pack: pack() });
    expect(
      await problemOf(run(authorReviewer(), { type: 'START_REVIEW', expectedSequence: 1 })),
    ).toMatchObject({ status: 403 });
    await run(reviewer(), { type: 'START_REVIEW', expectedSequence: 1 });
    await run(reviewer(), { type: 'COMPLETE_REVIEW', expectedSequence: 2, evidence });
    const reviewerApprover = as(
      'test-reviewer',
      ['SCHOLAR_REVIEWER', [MARJA]],
      ['INDEPENDENT_APPROVER', [MARJA]],
    );
    expect(
      await problemOf(run(reviewerApprover, { type: 'APPROVE', expectedSequence: 3, evidence })),
    ).toMatchObject({ status: 403 });
  });

  it('binds every version of a pack id to one Marja (no cross-Marja takeover)', async () => {
    const twoMarjaAuthor = () => as('test-wide-author', ['RULE_PACK_AUTHOR', [MARJA, OTHER_MARJA]]);
    await run(author(), { type: 'SUBMIT', expectedSequence: 0, pack: pack() });
    // A new version of the same pack id naming another Marja.
    expect(
      await problemOf(
        run(
          twoMarjaAuthor(),
          {
            type: 'SUBMIT',
            expectedSequence: 0,
            pack: pack({ version: '1.1.0', marjaId: OTHER_MARJA }),
          },
          '1.1.0',
        ),
      ),
    ).toMatchObject({ status: 409, code: 'PACK_MARJA_MISMATCH' });
    // A resubmission of the same version naming another Marja after changes were requested.
    await run(reviewer(), { type: 'START_REVIEW', expectedSequence: 1 });
    await run(reviewer(), { type: 'REQUEST_CHANGES', expectedSequence: 2, evidence });
    expect(
      await problemOf(
        run(twoMarjaAuthor(), {
          type: 'SUBMIT',
          expectedSequence: 3,
          pack: pack({ marjaId: OTHER_MARJA }, 'TEST changed'),
        }),
      ),
    ).toMatchObject({ status: 409, code: 'PACK_MARJA_MISMATCH' });
    expect(await count(h.ledgers)).toBe(3);
    expect(await count(h.contents)).toBe(1);
    expect(
      (await auditTypes(h.audit)).filter((t) => t === 'governance.command.refused'),
    ).toHaveLength(2);
  });

  it('denies requests without an authenticated staff session', async () => {
    expect(
      await problemOf(run({}, { type: 'SUBMIT', expectedSequence: 0, pack: pack() })),
    ).toMatchObject({ status: 401 });
    expect(await problemOf(h.svc.list({}))).toMatchObject({ status: 401 });
  });
});

describe('content integrity and publication safeguards', () => {
  it('refuses mock, malformed and mismatched content before anything is written', async () => {
    expect(
      await problemOf(
        run(author(), { type: 'SUBMIT', expectedSequence: 0, pack: pack({ isMock: true }) }),
      ),
    ).toMatchObject({ status: 422, code: 'MOCK_PACK_REFUSED' });
    expect(
      await problemOf(
        run(author(), { type: 'SUBMIT', expectedSequence: 0, pack: { metadata: {} } }),
      ),
    ).toMatchObject({ status: 422, code: 'GOVERNANCE_REFUSED' });
    const tampered = { ...pack(), sources: [] };
    expect(
      await problemOf(run(author(), { type: 'SUBMIT', expectedSequence: 0, pack: tampered })),
    ).toMatchObject({ code: 'GOVERNANCE_REFUSED' });
    expect(
      await problemOf(
        run(author(), { type: 'SUBMIT', expectedSequence: 0, pack: pack({ version: '2.0.0' }) }),
      ),
    ).toMatchObject({ status: 409, code: 'GOVERNANCE_REFUSED' });
    expect(await count(h.ledgers)).toBe(0);
    expect(await count(h.contents)).toBe(0);
  });

  it('refuses scholar-review (provisional) packs: they never enter the production path (M4.5a)', async () => {
    const scholarReview = pack({ schemaVersion: 3, releaseChannel: 'SCHOLAR_REVIEW' });
    const refused = await problemOf(
      run(author(), { type: 'SUBMIT', expectedSequence: 0, pack: scholarReview }),
    );
    expect(refused).toMatchObject({ status: 422, code: 'GOVERNANCE_REFUSED' });
    expect(refused.detail).toContain('NOT_ELIGIBLE');
    expect(await count(h.ledgers)).toBe(0);
    expect(await count(h.contents)).toBe(0);
  });

  it('acts only on stored content: a stored copy that no longer verifies stops every command', async () => {
    await run(author(), { type: 'SUBMIT', expectedSequence: 0, pack: pack() });
    h.wrap((s) => ({
      ...s,
      contents: {
        ...s.contents,
        load: async (recordId, kind, expected) => {
          const found = await s.contents.load(recordId, kind, `${expected.slice(0, 63)}0`);
          return found;
        },
      },
    }));
    expect(
      await problemOf(run(reviewer(), { type: 'START_REVIEW', expectedSequence: 1 })),
    ).toMatchObject({ status: 503, code: 'SERVICE_UNAVAILABLE' });
    expect(h.logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'governance.integrity.failure' }),
      expect.any(String),
    );
    expect(JSON.stringify(h.logger.error.mock.calls)).not.toContain('TEST category');
    expect(await count(h.ledgers)).toBe(1);
  });

  it('fails closed on a tampered ledger', async () => {
    await run(author(), { type: 'SUBMIT', expectedSequence: 0, pack: pack() });
    h.wrap((s) => ({
      ...s,
      ledgers: {
        ...s.ledgers,
        load: async (packId, version) => {
          const found = await s.ledgers.load(packId, version);
          if (found.kind !== 'FOUND') return found;
          const [first] = found.value.records;
          if (first === undefined) return found;
          return {
            kind: 'FOUND',
            value: {
              ...found.value,
              records: [{ ...first, recordedAt: '2020-01-01T00:00:00.000Z' }],
            },
          };
        },
      },
    }));
    expect(
      await problemOf(run(reviewer(), { type: 'START_REVIEW', expectedSequence: 1 })),
    ).toMatchObject({ status: 503 });
  });

  it('keeps published content immutable: no second publication, no rebinding', async () => {
    await toPublished();
    expect(
      await problemOf(run(approver(), { type: 'PUBLISH', expectedSequence: 5 })),
    ).toMatchObject({ status: 409, code: 'GOVERNANCE_REFUSED' });
    const other = pack({ status: 'PUBLISHED' }, 'TEST replacement');
    expect(
      await h.store.stores.contents.store({
        recordId: `${PACK}@1.0.0#4`,
        kind: 'PUBLISHED',
        marjaId: MARJA,
        digest: other.metadata.integrity?.digest ?? '',
        pack: other,
        storedAt: iso(now),
      }),
    ).toBe('CONFLICT');
  });
});

describe('optimistic concurrency', () => {
  it('refuses a stale expectedSequence and writes nothing', async () => {
    await run(author(), { type: 'SUBMIT', expectedSequence: 0, pack: pack() });
    expect(
      await problemOf(run(reviewer(), { type: 'START_REVIEW', expectedSequence: 0 })),
    ).toMatchObject({ status: 409, code: 'GOVERNANCE_CONFLICT' });
    expect(await count(h.ledgers)).toBe(1);
  });

  it('concurrent commands on one version: exactly one wins, the others get 409 (transactional store)', async () => {
    await run(author(), { type: 'SUBMIT', expectedSequence: 0, pack: pack() });
    const reviewers = ['test-reviewer', 'test-reviewer-2', 'test-reviewer-3'].map((id) =>
      as(id, ['SCHOLAR_REVIEWER', [MARJA]]),
    );
    const outcomes = await Promise.allSettled(
      reviewers.map((who) => run(who, { type: 'START_REVIEW', expectedSequence: 1 })),
    );
    expect(outcomes.filter((o) => o.status === 'fulfilled')).toHaveLength(1);
    for (const o of outcomes) {
      if (o.status === 'rejected') {
        expect((o.reason as ApiProblemException).code).toBe('GOVERNANCE_CONFLICT');
      }
    }
    expect(await count(h.ledgers)).toBe(2);
    expect(
      (await auditTypes(h.audit)).filter((t) => t === 'governance.pack.reviewStarted'),
    ).toHaveLength(1);
  });

  it('concurrent first submissions with an unserialized store: the unique ledger index decides', async () => {
    const audit = inMemoryAppendOnlyCollection(COLLECTIONS.auditEvents);
    const registry = initialPolicyRegistry(
      [{ marjaId: MARJA, policy: 'INDEPENDENT_REVIEW_V1' }],
      '2026-01-01T00:00:00.000Z',
      'TEST',
      'test-request',
    );
    if (!registry.ok) throw new Error('registry');
    const store = inMemoryGovernanceStore(audit, inMemoryGovernancePolicyStore(registry.value));
    const research = inMemoryResearchStore(inMemoryAppendOnlyCollection(COLLECTIONS.auditEvents));
    await seedSourcedRuling(research, MARJA, { rulingId: TEST_RULING_ID });
    const svc = new GovernanceService(
      store,
      clock,
      new StaffAuthorizationService(clock),
      { error: vi.fn(), warn: vi.fn() } as unknown as PinoLogger,
      research,
      new PublicPackCache(clock),
      { names: () => Promise.resolve(new Map<string, string>()) } as unknown as StaffNamesService,
    );
    const authors = ['test-author', 'test-author-2', 'test-author-3'].map((id) =>
      as(id, ['RULE_PACK_AUTHOR', [MARJA]]),
    );
    const outcomes = await Promise.allSettled(
      authors.map((who) =>
        svc.execute(
          who,
          PACK,
          '1.0.0',
          { type: 'SUBMIT', expectedSequence: 0, pack: pack() },
          null,
        ),
      ),
    );
    expect(outcomes.filter((o) => o.status === 'fulfilled')).toHaveLength(1);
    const loaded = await store.stores.ledgers.load(PACK, '1.0.0');
    expect(loaded.kind === 'FOUND' && loaded.value.records).toHaveLength(1);
  });
});

describe('atomicity: ledger, content and audit commit together or not at all', () => {
  const failing =
    <K extends keyof GovernanceStores>(key: K, override: Partial<GovernanceStores[K]>) =>
    (s: GovernanceStores): GovernanceStores => ({
      ...s,
      [key]: typeof s[key] === 'function' ? override : { ...(s[key] as object), ...override },
    });

  it('rolls back the ledger record and content when the audit event cannot be written', async () => {
    h.wrap((s) => ({
      ...s,
      audit: () => Promise.resolve({ ok: false, error: 'AUDIT_STORE_UNAVAILABLE' }),
    }));
    expect(
      await problemOf(run(author(), { type: 'SUBMIT', expectedSequence: 0, pack: pack() })),
    ).toMatchObject({ status: 503 });
    expect(await count(h.ledgers)).toBe(0);
    expect(await count(h.contents)).toBe(0);
    expect(await count(h.audit)).toBe(0);
  });

  it('rolls back the ledger record when the content cannot be stored', async () => {
    h.wrap(failing('contents', { store: () => Promise.resolve('UNAVAILABLE' as const) }));
    expect(
      await problemOf(run(author(), { type: 'SUBMIT', expectedSequence: 0, pack: pack() })),
    ).toMatchObject({ status: 503 });
    expect(await count(h.ledgers)).toBe(0);
    expect((await auditTypes(h.audit)).filter((t) => t.startsWith('governance.pack'))).toEqual([]);
  });

  it('a failed publication leaves the version APPROVED with no published copy', async () => {
    await run(author(), { type: 'SUBMIT', expectedSequence: 0, pack: pack() });
    await run(reviewer(), { type: 'START_REVIEW', expectedSequence: 1 });
    await run(reviewer(), { type: 'COMPLETE_REVIEW', expectedSequence: 2, evidence });
    await run(approver(), { type: 'APPROVE', expectedSequence: 3, evidence });
    h.wrap((s) => ({
      ...s,
      audit: () => Promise.resolve({ ok: false, error: 'AUDIT_STORE_UNAVAILABLE' }),
    }));
    expect(
      await problemOf(run(approver(), { type: 'PUBLISH', expectedSequence: 4 })),
    ).toMatchObject({
      status: 503,
    });
    h.wrap((s) => s);
    expect(await h.svc.get(approver(), PACK, '1.0.0')).toMatchObject({
      state: 'APPROVED',
      expectedSequence: 4,
    });
    expect(await count(h.contents)).toBe(1);
  });

  it('a ledger write that loses its race rolls back and answers 409', async () => {
    await run(author(), { type: 'SUBMIT', expectedSequence: 0, pack: pack() });
    h.wrap(failing('ledgers', { append: () => Promise.resolve('CONFLICT' as const) }));
    expect(
      await problemOf(run(reviewer(), { type: 'START_REVIEW', expectedSequence: 1 })),
    ).toMatchObject({ status: 409, code: 'GOVERNANCE_CONFLICT' });
    expect(await count(h.audit)).toBe(1);
  });
});

describe('audit log reads', () => {
  it('pages the verified chain for auditors and administrators only', async () => {
    await toPublished();
    const first = await h.svc.auditEvents(auditor(), -1, 2);
    expect(first.chainVerified).toBe(true);
    expect(first.events.map((e) => e.sequence)).toEqual([0, 1]);
    expect(first.nextAfterSequence).toBe(1);
    const rest = await h.svc.auditEvents(admin(), 1, 50);
    expect(rest.events).toHaveLength(3);
    expect(rest.nextAfterSequence).toBeNull();
    expect(await problemOf(h.svc.auditEvents(reviewer()))).toMatchObject({
      status: 403,
      code: 'ACCESS_DENIED',
    });
  });
});

// ---- M5.2.1: independent scholar governance ----

interface AuditEventView {
  readonly type: string;
  readonly actor: string | null;
  readonly marjaIds: readonly string[];
  readonly targets: readonly { readonly kind: string; readonly id: string }[];
  readonly details: Record<string, unknown>;
}

async function auditEvents(): Promise<readonly AuditEventView[]> {
  const chain = await readAuditChain(h.audit);
  if (!chain.ok) throw new Error('audit');
  expect(verifyAuditChain(chain.value).ok).toBe(true);
  return chain.value as unknown as readonly AuditEventView[];
}

/** One scholar takes `packId@version` of `marjaId` to PUBLISHED alone. */
async function soloToPublished(
  who: () => object,
  marjaId: string,
  packId: string,
  version = '1.0.0',
  label?: string,
) {
  const content = pack({ marjaId, packId, version }, label);
  const r = (input: GovernanceCommandInput) => run(who(), input, version, packId);
  await r({ type: 'SUBMIT', expectedSequence: 0, pack: content });
  await r({ type: 'START_REVIEW', expectedSequence: 1 });
  await r({ type: 'COMPLETE_REVIEW', expectedSequence: 2, evidence });
  await r({ type: 'APPROVE', expectedSequence: 3, evidence });
  return r({ type: 'PUBLISH', expectedSequence: 4 });
}

describe('single-scholar audit trail (M5.2.1)', () => {
  it('every lifecycle record and audit event names the same scholar, Marja, pack version and action', async () => {
    await soloToPublished(solo, SOLO_MARJA, 'test-solo-pack');
    const activated = await run(
      solo(),
      { type: 'ACTIVATE', expectedSequence: 5 },
      '1.0.0',
      'test-solo-pack',
    );
    expect(activated).toMatchObject({ policy: 'SINGLE_SCHOLAR_V1', activated: true });
    expect(activated.records.every((r) => r.actor.subject === 'test-solo')).toBe(true);
    const events = await auditEvents();
    expect(events.map((e) => [e.type, e.details.command])).toEqual([
      ['governance.pack.submitted', 'SUBMIT'],
      ['governance.pack.reviewStarted', 'START_REVIEW'],
      ['governance.pack.reviewCompleted', 'COMPLETE_REVIEW'],
      ['governance.pack.approved', 'APPROVE'],
      ['governance.pack.published', 'PUBLISH'],
      ['governance.pack.activated', 'ACTIVATE'],
    ]);
    for (const e of events) {
      expect(e.actor).toBe('test-solo');
      expect(e.marjaIds).toEqual([SOLO_MARJA]);
      expect(e.targets).toEqual([{ kind: 'rulePackVersion', id: 'test-solo-pack@1.0.0' }]);
      expect(e.details.policy).toBe('SINGLE_SCHOLAR_V1');
    }
    // Each event references its own ledger record.
    expect(events.map((e) => e.details.recordId)).toEqual(activated.records.map((r) => r.recordId));
  });
});

describe('single-scholar correction by a new version (M5.2.1)', () => {
  it('publishes 1.1.0 and supersedes 1.0.0 alone; 1.0.0’s published content stays immutable', async () => {
    const PACK_ID = 'test-solo-pack';
    const v1 = await soloToPublished(solo, SOLO_MARJA, PACK_ID, '1.0.0');
    const before = await h.store.stores.contents.load(
      `${PACK_ID}@1.0.0#4`,
      'PUBLISHED',
      v1.contentDigest ?? '',
    );
    expect(before.kind).toBe('FOUND');
    // The correction: changed content as a new version, approved and published by the same scholar.
    const v11 = await soloToPublished(
      solo,
      SOLO_MARJA,
      PACK_ID,
      '1.1.0',
      'TEST category (corrected)',
    );
    expect(v11.contentDigest).not.toBe(v1.contentDigest);
    const superseded = await run(
      solo(),
      { type: 'SUPERSEDE', expectedSequence: 5, successorVersion: '1.1.0' },
      '1.0.0',
      PACK_ID,
    );
    expect(superseded.state).toBe('SUPERSEDED');
    expect(superseded.records.every((r) => r.actor.subject === 'test-solo')).toBe(true);
    // 1.0.0's published copy is unchanged and still verifies against its digest.
    const after = await h.store.stores.contents.load(
      `${PACK_ID}@1.0.0#4`,
      'PUBLISHED',
      v1.contentDigest ?? '',
    );
    expect(after.kind === 'FOUND' && before.kind === 'FOUND').toBe(true);
    if (after.kind === 'FOUND' && before.kind === 'FOUND') {
      expect(after.value.pack).toEqual(before.value.pack);
      expect(after.value.pack.metadata.integrity?.digest).toBe(v1.contentDigest);
    }
    // No further change to 1.0.0: it cannot be republished, activated or rebound.
    for (const input of [
      { type: 'PUBLISH', expectedSequence: 6 },
      { type: 'ACTIVATE', expectedSequence: 6 },
    ] as const) {
      expect(await problemOf(run(solo(), input, '1.0.0', PACK_ID)), input.type).toMatchObject({
        status: 409,
        code: 'GOVERNANCE_REFUSED',
      });
    }
    expect((await auditEvents()).filter((e) => e.type === 'governance.pack.superseded')).toEqual([
      expect.objectContaining({
        actor: 'test-solo',
        details: expect.objectContaining({ successorVersion: '1.1.0' }),
      }),
    ]);
  });
});

describe('a scholar authorized for two Marjas (M5.2.1)', () => {
  it('manages each authorized Marja independently and alone', async () => {
    const first = await soloToPublished(twoMarjas, SOLO_MARJA, 'test-first-pack');
    const second = await soloToPublished(twoMarjas, SOLO_MARJA_2, 'test-second-pack');
    for (const [published, marjaId] of [
      [first, SOLO_MARJA],
      [second, SOLO_MARJA_2],
    ] as const) {
      expect(published).toMatchObject({ state: 'PUBLISHED', policy: 'SINGLE_SCHOLAR_V1', marjaId });
      expect(published.records.every((r) => r.actor.subject === 'test-two-marjas')).toBe(true);
    }
    const events = await auditEvents();
    expect(
      new Set(
        events
          .filter((e) => e.targets[0]?.id === 'test-first-pack@1.0.0')
          .map((e) => e.marjaIds.join()),
      ),
    ).toEqual(new Set([SOLO_MARJA]));
    expect(
      new Set(
        events
          .filter((e) => e.targets[0]?.id === 'test-second-pack@1.0.0')
          .map((e) => e.marjaIds.join()),
      ),
    ).toEqual(new Set([SOLO_MARJA_2]));
  });

  it('cannot submit, read or act on a third Marja outside its scope', async () => {
    const outside = await problemOf(
      run(twoMarjas(), { type: 'SUBMIT', expectedSequence: 0, pack: pack() }),
    );
    expect(outside).toMatchObject({ status: 403, code: 'ACCESS_DENIED' });
    await run(author(), { type: 'SUBMIT', expectedSequence: 0, pack: pack() });
    // An existing version of another Marja looks like a missing one.
    expect(
      await problemOf(run(twoMarjas(), { type: 'START_REVIEW', expectedSequence: 1 })),
    ).toMatchObject({ status: 404, code: 'PACK_VERSION_NOT_FOUND' });
  });

  it("an approval for one Marja does not affect the other Marja's version", async () => {
    await soloToPublished(twoMarjas, SOLO_MARJA, 'test-first-pack');
    const second = pack({ marjaId: SOLO_MARJA_2, packId: 'test-second-pack' });
    const r2 = (input: GovernanceCommandInput) =>
      run(twoMarjas(), input, '1.0.0', 'test-second-pack');
    await r2({ type: 'SUBMIT', expectedSequence: 0, pack: second });
    // The second version has no review or approval of its own: publication is refused.
    expect(await problemOf(r2({ type: 'PUBLISH', expectedSequence: 1 }))).toMatchObject({
      status: 409,
      code: 'GOVERNANCE_REFUSED',
    });
    const view = await h.svc.get(twoMarjas(), 'test-second-pack', '1.0.0');
    expect(view).toMatchObject({ state: 'SUBMITTED', marjaId: SOLO_MARJA_2 });
    // A pack id stays bound to its first Marja: the first Marja's pack id cannot be reused for the second.
    expect(
      await problemOf(
        run(
          twoMarjas(),
          {
            type: 'SUBMIT',
            expectedSequence: 0,
            pack: pack({ marjaId: SOLO_MARJA_2, packId: 'test-first-pack', version: '2.0.0' }),
          },
          '2.0.0',
          'test-first-pack',
        ),
      ),
    ).toMatchObject({ status: 409, code: 'PACK_MARJA_MISMATCH' });
  });
});

describe('legacy ledgers without a recorded policy (M5.2.1)', () => {
  const LEGACY_PACK = 'test-legacy-pack';
  const legacyLedger = JSON.parse(
    readFileSync(
      new URL('../../test/fixtures/legacy-governance-ledger.json', import.meta.url),
      'utf8',
    ),
  ) as { records: { recordId: string; integrity: { digest: string } }[] };

  async function storeLegacy() {
    // Pre-M5.3.6 content: its rule cites no ruling version (as the legacy fixture was sealed).
    const content = pack({ marjaId: SOLO_MARJA, packId: LEGACY_PACK }, undefined, []);
    const [first] = legacyLedger.records;
    if (first === undefined) throw new Error('fixture');
    // The fixture was sealed from the same TEST content.
    expect(content.metadata.integrity?.digest).toBe(first.integrity.digest);
    for (const record of legacyLedger.records) await h.ledgers.insert(record);
    expect(
      await h.store.stores.contents.store({
        recordId: first.recordId,
        kind: 'SUBMITTED',
        marjaId: SOLO_MARJA,
        digest: first.integrity.digest,
        pack: content,
        storedAt: '2026-06-01T09:00:00.000Z',
      }),
    ).toBe('STORED');
  }
  const r = (who: object, input: GovernanceCommandInput) => run(who, input, '1.0.0', LEGACY_PACK);

  it('is shown as LEGACY_UNRECORDED and accepts no lifecycle command (fail closed)', async () => {
    await storeLegacy();
    expect(await h.svc.get(solo(), LEGACY_PACK, '1.0.0')).toMatchObject({
      state: 'SUBMITTED',
      policySource: 'LEGACY_UNRECORDED',
    });
    const refused = await problemOf(r(solo(), { type: 'START_REVIEW', expectedSequence: 1 }));
    expect(refused).toMatchObject({ status: 409, code: 'GOVERNANCE_REFUSED' });
    expect(refused.detail).toContain('POLICY_UNBOUND');
    expect(await count(h.ledgers)).toBe(1);
  });

  it('an administrator binds it to the Marja’s current registry policy; the scholar then continues alone', async () => {
    await storeLegacy();
    // Not a scholar's operation.
    expect(
      await problemOf(
        r(solo(), { type: 'BIND_POLICY', expectedSequence: 1, reason: 'TEST binding' }),
      ),
    ).toMatchObject({ status: 403, code: 'ACCESS_DENIED' });
    const bound = await r(admin(), {
      type: 'BIND_POLICY',
      expectedSequence: 1,
      reason: 'TEST binding of a legacy version',
    });
    expect(bound).toMatchObject({
      policy: 'SINGLE_SCHOLAR_V1',
      policySource: 'BOUND',
      expectedSequence: 2,
    });
    expect(bound.records.at(-1)).toMatchObject({
      type: 'POLICY_BOUND',
      boundPolicy: 'SINGLE_SCHOLAR_V1',
      actor: { kind: 'STAFF_PRINCIPAL', subject: 'test-admin' },
    });
    // The historical record is unchanged: same id, actor, time and digest; the new record chains
    // onto it, and the stored document is exactly the original.
    const historical = legacyLedger.records[0] as unknown as {
      recordId: string;
      recordDigest: string;
      recordedAt: string;
    };
    expect(bound.records[0]).toMatchObject({
      recordId: historical.recordId,
      recordDigest: historical.recordDigest,
      recordedAt: historical.recordedAt,
      actor: { kind: 'UNVERIFIED_REFERENCE', subject: 'test-legacy-author' },
    });
    expect(bound.records[1]?.previousRecordDigest).toBe(historical.recordDigest);
    const storedFirst = await h.ledgers.find(
      { recordId: historical.recordId },
      { sort: { field: 'recordId', direction: 1 } },
    );
    expect(storedFirst.ok && storedFirst.value[0]).toEqual(legacyLedger.records[0]);
    const events = await auditEvents();
    expect(events.at(-1)).toMatchObject({
      type: 'governance.pack.policyBound',
      actor: 'test-admin',
      marjaIds: [SOLO_MARJA],
      targets: [{ kind: 'rulePackVersion', id: 'test-legacy-pack@1.0.0' }],
      details: {
        command: 'BIND_POLICY',
        bindingReason: 'TEST binding of a legacy version',
        boundPolicy: 'SINGLE_SCHOLAR_V1',
        recordId: 'test-legacy-pack@1.0.0#1',
      },
    });
    const occurredAt = (events.at(-1) as unknown as { occurredAt: string }).occurredAt;
    expect(occurredAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(bound.records.at(-1)?.recordedAt).toBe(bound.lastRecordedAt);
    // The scholar continues under the bound policy, alone.
    await r(solo(), { type: 'START_REVIEW', expectedSequence: 2 });
    await r(solo(), { type: 'COMPLETE_REVIEW', expectedSequence: 3, evidence });
    await r(solo(), { type: 'APPROVE', expectedSequence: 4, evidence });
    const published = await r(solo(), { type: 'PUBLISH', expectedSequence: 5 });
    expect(published.state).toBe('PUBLISHED');
    // Binding twice is refused.
    expect(
      await problemOf(
        r(admin(), { type: 'BIND_POLICY', expectedSequence: 6, reason: 'TEST again' }),
      ),
    ).toMatchObject({ status: 409, code: 'GOVERNANCE_REFUSED' });
  });

  it('binding changes neither the lifecycle state nor the bound content', async () => {
    await storeLegacy();
    const first = legacyLedger.records[0] as unknown as { integrity: { digest: string } };
    const content = pack({ marjaId: SOLO_MARJA, packId: LEGACY_PACK }, undefined, []);
    const bound = await r(admin(), { type: 'BIND_POLICY', expectedSequence: 1, reason: 'TEST' });
    expect(bound).toMatchObject({ state: 'SUBMITTED', contentDigest: first.integrity.digest });
    const stored = await h.store.stores.contents.load(
      'test-legacy-pack@1.0.0#0',
      'SUBMITTED',
      first.integrity.digest,
    );
    expect(stored.kind === 'FOUND' && stored.value.pack).toEqual(content);
    expect(await count(h.contents)).toBe(1);
  });
});

describe('emergency withdrawal leaves content untouched (M5.2.1)', () => {
  it('the published copy is unchanged and the denied attempt is audited too', async () => {
    const published = await toPublished();
    const before = await h.store.stores.contents.load(
      `${PACK}@1.0.0#4`,
      'PUBLISHED',
      published.contentDigest ?? '',
    );
    // Decision 64: an auditor provides the denied attempt (SUPER_ADMIN may withdraw normally now).
    await problemOf(run(auditor(), { type: 'WITHDRAW', expectedSequence: 5, reason: 'OTHER' }));
    const withdrawn = await run(admin(), {
      type: 'EMERGENCY_WITHDRAW',
      expectedSequence: 5,
      reason: 'SOURCE_INVALIDATED',
      note: 'TEST emergency: source withdrawn by its publisher',
    });
    expect(withdrawn.state).toBe('WITHDRAWN');
    const after = await h.store.stores.contents.load(
      `${PACK}@1.0.0#4`,
      'PUBLISHED',
      published.contentDigest ?? '',
    );
    expect(before.kind === 'FOUND' && after.kind === 'FOUND').toBe(true);
    if (before.kind === 'FOUND' && after.kind === 'FOUND') {
      expect(after.value.pack).toEqual(before.value.pack);
    }
    // The withdrawal wrote no content (only the submitted and published copies exist).
    expect(await count(h.contents)).toBe(2);
    const types = (await auditEvents()).map((e) => e.type);
    expect(types).toContain('governance.command.denied');
    expect(types.at(-1)).toBe('governance.pack.emergencyWithdrawn');
  });
});

describe('production packs cite current approved ruling versions (M5.3.6, D13)', () => {
  const PACK_ID = 'test-ruling-pack';
  const r = (input: GovernanceCommandInput, version = '1.0.0') =>
    run(solo(), input, version, PACK_ID);
  const withRefs = (refs: readonly string[], version = '1.0.0') =>
    pack({ marjaId: SOLO_MARJA, packId: PACK_ID, version }, undefined, refs);
  async function toPublished(content: RulePack, version = '1.0.0') {
    await r({ type: 'SUBMIT', expectedSequence: 0, pack: content }, version);
    await r({ type: 'START_REVIEW', expectedSequence: 1 }, version);
    await r({ type: 'COMPLETE_REVIEW', expectedSequence: 2, evidence }, version);
    await r({ type: 'APPROVE', expectedSequence: 3, evidence }, version);
    return r({ type: 'PUBLISH', expectedSequence: 4 }, version);
  }
  const refusalOf = async (promise: Promise<unknown>) => {
    const problem = await problemOf(promise);
    expect(problem).toMatchObject({ status: 422, code: 'GOVERNANCE_REFUSED' });
    return problem.detail;
  };
  const lastAudit = async () => {
    const chain = await readAuditChain(h.audit);
    if (!chain.ok) throw new Error('audit');
    return chain.value.at(-1) as { type: string; details: Record<string, unknown> };
  };
  const storedPublished = async (version: string) => {
    const view = await h.svc.get(solo(), PACK_ID, version);
    const published = view.records.find((rec) => rec.type === 'PUBLISHED');
    const stored = await h.store.stores.contents.load(
      published?.recordId ?? '',
      'PUBLISHED',
      published?.contentDigest ?? '',
    );
    if (stored.kind !== 'FOUND') throw new Error('content');
    return stored.value.pack;
  };

  it('activates when every rule cites the current approved ruling; the pack keeps its snapshot', async () => {
    const ruling = await seedSourcedRuling(h.research, SOLO_MARJA);
    await toPublished(withRefs([`${ruling.entityId}@1`]));
    expect(await r({ type: 'ACTIVATE', expectedSequence: 5 })).toMatchObject({ activated: true });
    const event = await lastAudit();
    expect(event.details.rulingProvenance).toEqual([
      `${ruling.entityId}@1:APPROVED:${ruling.records[0]?.recordDigest ?? ''}`,
    ]);
    const content = await storedPublished('1.0.0');
    expect(content.rulingSnapshots?.map((snap) => [snap.ref, snap.state])).toEqual([
      [`${ruling.entityId}@1`, 'APPROVED'],
    ]);
    expect(content.rulingSnapshots?.[0]?.findings).toHaveLength(1);
    expect(content.rulingSnapshots?.[0]?.passages[0]?.source.copyright).toBe('EXCERPTS_ONLY');
    expect(content.rulingSnapshots?.[0]?.passages[0]?.text).toBeNull();
  });

  it('refuses a draft ruling, withdrawn and superseded rulings, other Marjas and wrong versions', async () => {
    const draft = await seedSourcedRuling(h.research, SOLO_MARJA, { kinds: [] });
    const withdrawn = await seedSourcedRuling(h.research, SOLO_MARJA, {
      kinds: ['APPROVED', 'WITHDRAWN'],
    });
    const superseded = await seedSourcedRuling(h.research, SOLO_MARJA, {
      kinds: ['APPROVED', 'SUPERSEDED'],
    });
    const other = await seedSourcedRuling(h.research, OTHER_MARJA, { kinds: ['APPROVED'] });
    const cases: [string, string][] = [
      [`${draft.entityId}@1`, 'RULING_NOT_APPROVED'],
      [`${withdrawn.entityId}@1`, 'RULING_NOT_CURRENT'],
      [`${superseded.entityId}@1`, 'RULING_NOT_CURRENT'],
      [`${other.entityId}@1`, 'RULING_REFERENCE_UNRESOLVED'],
      [`${testRulingIdFor(SOLO_MARJA)}@2`, 'RULING_REFERENCE_UNRESOLVED'],
      ['legacy-ruling-id', 'RULING_REFERENCE_INVALID'],
    ];
    for (const [ref, code] of cases) {
      expect(
        await refusalOf(r({ type: 'SUBMIT', expectedSequence: 0, pack: withRefs([ref]) })),
      ).toContain(code);
    }
    expect(await h.svc.list(solo(), SOLO_MARJA)).toEqual([]);
    expect((await lastAudit()).type).toBe('governance.command.refused');
  });

  it('never activates a rule without a ruling, or once its ruling is withdrawn; published content stays', async () => {
    await toPublished(withRefs([]));
    expect(await refusalOf(r({ type: 'ACTIVATE', expectedSequence: 5 }))).toContain(
      'RULING_REFERENCE_REQUIRED',
    );
    const ruling = await seedSourcedRuling(h.research, SOLO_MARJA);
    const published = await toPublished(withRefs([`${ruling.entityId}@1`], '1.1.0'), '1.1.0');
    const before = await storedPublished('1.1.0');
    await advanceRuling(h.research, ruling, ['WITHDRAWN']);
    expect(await refusalOf(r({ type: 'ACTIVATE', expectedSequence: 5 }, '1.1.0'))).toContain(
      'RULING_NOT_CURRENT',
    );
    const after = await h.svc.get(solo(), PACK_ID, '1.1.0');
    expect(after).toMatchObject({ state: 'PUBLISHED', activated: false });
    expect(after.records).toEqual(published.records);
    expect(await storedPublished('1.1.0')).toEqual(before);
  });

  it('a correction is a new pack version citing the new ruling version; the old version is untouched', async () => {
    const v1 = await seedSourcedRuling(h.research, SOLO_MARJA);
    await toPublished(withRefs([`${v1.entityId}@1`]));
    await r({ type: 'ACTIVATE', expectedSequence: 5 });
    const oldContent = await storedPublished('1.0.0');
    await advanceRuling(h.research, v1, ['SUPERSEDED']);
    const v2 = await seedSourcedRuling(h.research, SOLO_MARJA);
    expect(
      await refusalOf(
        r(
          { type: 'SUBMIT', expectedSequence: 0, pack: withRefs([`${v1.entityId}@1`], '1.1.0') },
          '1.1.0',
        ),
      ),
    ).toContain('RULING_NOT_CURRENT');
    await toPublished(withRefs([`${v2.entityId}@1`], '1.1.0'), '1.1.0');
    expect(await r({ type: 'ACTIVATE', expectedSequence: 5 }, '1.1.0')).toMatchObject({
      activated: true,
    });
    // Version 1.0.0 keeps its content and its snapshot of the ruling as it stood.
    expect(await storedPublished('1.0.0')).toEqual(oldContent);
    expect(oldContent.rulingSnapshots?.[0]?.ref).toBe(`${v1.entityId}@1`);
  });

  it('refuses author-supplied snapshots that differ from the research records', async () => {
    const ruling = await seedSourcedRuling(h.research, SOLO_MARJA);
    const content = withRefs([`${ruling.entityId}@1`]);
    const forged = sealRulePack({
      ...content,
      rulingSnapshots: [
        {
          ref: `${ruling.entityId}@1`,
          marjaId: SOLO_MARJA,
          displayRef: 'forged',
          rulingSeriesId: ruling.entityId,
          rulingVersion: 1,
          state: 'APPROVED',
          contentRevision: 0,
          payloadDigest: '0'.repeat(64),
          contentRecordDigest: '0'.repeat(64),
          payload: { conclusion: 'not what the scholar wrote' },
          findings: [],
          passages: [],
        },
      ],
    });
    if (!forged.ok) throw new Error('seal');
    expect(
      await refusalOf(r({ type: 'SUBMIT', expectedSequence: 0, pack: forged.value })),
    ).toContain('RULING_SNAPSHOT_MISMATCH');
  });
});
