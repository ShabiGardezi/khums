import { describe, expect, it } from 'vitest';

import type {
  GovernanceLedger,
  GovernancePolicyId,
  GovernancePolicyRegistry,
  VerifiedPrincipal,
} from '@khums/shared-types';

import {
  ALL,
  MARJA,
  marjaScope,
  NOW,
  PACK_ID,
  principal,
  principalInput,
  shift,
  testPack,
} from '../authorization/test-support';
import { executeGovernanceCommand, type AuthorizedGovernanceOutcome } from './authorized';
import { createLedger, replayLedger } from './ledger';
import {
  activeGovernancePolicy,
  confirmGovernancePolicyChange,
  createPolicyRegistry,
  initialPolicyRegistry,
  proposeGovernancePolicyChange,
  replayPolicyRegistry,
} from './policy-registry';

/** Per-Marja governance policy configuration (single-scholar stage 4). TEST data only. */

const OTHER_MARJA = 'other-marja';
const ADMIN = principal('test-admin', { roles: [['SUPER_ADMIN', ALL]] });
const ADMIN_2 = principal('test-admin-2', { roles: [['SUPER_ADMIN', ALL]] });
const SCOPED_ADMIN = principal('test-scoped-admin', {
  roles: [['SUPER_ADMIN', marjaScope(MARJA)]],
});
const SCHOLAR = principal('test-scholar', { roles: [['GOVERNING_SCHOLAR', marjaScope(MARJA)]] });
const REVIEWER = principal('test-reviewer', { roles: ['SCHOLAR_REVIEWER'] });
const AUDITOR = principal('test-auditor', { roles: ['AUDITOR'] });
const evidence = { reference: 'docs/research/reviews/test/test-pack.REVIEW.md' };

let tick = 0;
const now = () => shift(NOW, (tick += 1));

function initial(...assignments: [string, GovernancePolicyId][]): GovernancePolicyRegistry {
  const registry = initialPolicyRegistry(
    assignments.map(([marjaId, policy]) => ({ marjaId, policy })),
    shift(NOW, -60_000),
    'Owner decision 2026-11-21 (TEST)',
    'req-initial',
  );
  if (!registry.ok) throw new Error(registry.error);
  return registry.value;
}

/** Step 1: propose (the policy does not change yet). */
function change(
  who: VerifiedPrincipal,
  registry: unknown,
  marjaId: unknown,
  newPolicy: unknown,
  overrides: Partial<{ reason: unknown; requestId: unknown; session: unknown }> = {},
) {
  return proposeGovernancePolicyChange({
    principal: who,
    registry,
    marjaId,
    newPolicy,
    reason: 'reason' in overrides ? overrides.reason : 'Only one trusted scholar for now (TEST)',
    context: {
      decisionId: `d-${String(tick + 1)}`,
      evaluatedAt: now(),
      session:
        'session' in overrides
          ? overrides.session
          : { sessionId: who.session.sessionId, state: 'ACTIVE' },
      requestId: 'requestId' in overrides ? overrides.requestId : 'req-change-1',
    },
  });
}
type ExpectedOverrides = Partial<{
  proposalRecordId: unknown;
  marjaId: unknown;
  previousPolicy: unknown;
  newPolicy: unknown;
  reason: unknown;
  proposalRequestId: unknown;
}>;

/** Step 2: confirm what the registry shows as pending (optionally with tampered expectations). */
function confirm(
  who: VerifiedPrincipal,
  registry: unknown,
  overrides: Partial<{ expected: ExpectedOverrides; session: unknown; requestId: unknown }> = {},
) {
  const view = replayPolicyRegistry(registry);
  const pending = view.ok ? view.value.pending : null;
  return confirmGovernancePolicyChange({
    principal: who,
    registry,
    expected: {
      proposalRecordId: pending?.recordId,
      marjaId: pending?.marjaId ?? MARJA,
      previousPolicy: pending?.previousPolicy,
      newPolicy: pending?.newPolicy,
      reason: pending?.reason,
      proposalRequestId: pending?.requestId,
      ...overrides.expected,
    },
    context: {
      decisionId: `d-${String(tick + 1)}`,
      evaluatedAt: now(),
      session:
        'session' in overrides
          ? overrides.session
          : { sessionId: who.session.sessionId, state: 'ACTIVE' },
      requestId: 'requestId' in overrides ? overrides.requestId : 'req-confirm-1',
    },
  });
}

/** A complete change: ADMIN proposes, ADMIN_2 confirms. */
function twoAdmin(registry: unknown, marjaId: string, newPolicy: GovernancePolicyId) {
  const proposed = applied(change(ADMIN, registry, marjaId, newPolicy)).registry;
  return applied(confirm(ADMIN_2, proposed)).registry;
}

function applied(outcome: ReturnType<typeof change>) {
  if (outcome.status !== 'APPLIED') throw new Error(`expected APPLIED, got ${outcome.status}`);
  return outcome;
}
const reason = (outcome: ReturnType<typeof change>) =>
  outcome.status === 'DENIED'
    ? outcome.decision.allowed
      ? 'DENIED'
      : outcome.decision.reason
    : outcome.status === 'REFUSED'
      ? outcome.issue
      : 'APPLIED';

function run(
  who: VerifiedPrincipal,
  ledger: unknown,
  command: Record<string, unknown>,
  policyRegistry: unknown,
): AuthorizedGovernanceOutcome {
  return executeGovernanceCommand({
    principal: who,
    ledger,
    command,
    context: {
      decisionId: `d-${String(tick + 1)}`,
      evaluatedAt: now(),
      session: { sessionId: who.session.sessionId, state: 'ACTIVE' },
      policyRegistry,
    },
  });
}
function ledgerOf(outcome: AuthorizedGovernanceOutcome): GovernanceLedger {
  if (outcome.status !== 'APPLIED') throw new Error(`expected APPLIED, got ${outcome.status}`);
  return outcome.ledger;
}
const denialOf = (outcome: AuthorizedGovernanceOutcome) =>
  outcome.status === 'DENIED' && !outcome.decision.allowed
    ? outcome.decision.reason
    : outcome.status;

describe('policy registry: resolution and verification', () => {
  it('resolves each Marja independently and never defaults', () => {
    const registry = initial([MARJA, 'SINGLE_SCHOLAR_V1'], [OTHER_MARJA, 'INDEPENDENT_REVIEW_V1']);
    expect(activeGovernancePolicy(registry, MARJA)).toEqual({
      ok: true,
      value: 'SINGLE_SCHOLAR_V1',
    });
    expect(activeGovernancePolicy(registry, OTHER_MARJA)).toEqual({
      ok: true,
      value: 'INDEPENDENT_REVIEW_V1',
    });
    expect(activeGovernancePolicy(registry, 'unconfigured-marja')).toEqual({
      ok: false,
      error: 'POLICY_NOT_CONFIGURED',
    });
    expect(activeGovernancePolicy(createPolicyRegistry(), MARJA)).toEqual({
      ok: false,
      error: 'POLICY_NOT_CONFIGURED',
    });
    expect(activeGovernancePolicy(registry, 'toString')).toEqual({
      ok: false,
      error: 'POLICY_NOT_CONFIGURED',
    });
  });

  it('fails closed on missing, malformed or tampered registries', () => {
    const registry = twoAdmin(
      initial([MARJA, 'INDEPENDENT_REVIEW_V1']),
      MARJA,
      'SINGLE_SCHOLAR_V1',
    );
    const [first, proposed, confirmed] = registry.records;
    if (first === undefined || proposed === undefined || confirmed === undefined) {
      throw new Error('fixture');
    }
    const tampered: unknown[] = [
      undefined,
      null,
      {},
      { records: [first, proposed, confirmed], extra: true },
      { records: [{ ...first, newPolicy: 'SINGLE_SCHOLAR_V1' }, proposed, confirmed] },
      { records: [proposed, confirmed] },
      { records: [first, confirmed] },
      { records: [first, confirmed, proposed] },
      { records: [first, { ...proposed, previousPolicy: null }, confirmed] },
      { records: [first, proposed, { ...confirmed, reason: 'rewritten' }] },
      { records: [first, proposed, { ...confirmed, newPolicy: 'INDEPENDENT_REVIEW_V1' }] },
      { records: [first, proposed, { ...confirmed, decisionId: null }] },
      { records: [first, proposed, { ...confirmed, proposal: null }] },
      { records: [first, proposed, { ...confirmed, kind: 'CHANGE_PROPOSED' }] },
      { records: [first, { ...proposed, kind: 'CHANGE_CONFIRMED' }] },
      { records: [first, proposed, { ...confirmed, recordedAt: shift(NOW, -10 * 60_000) }] },
      { records: [{ ...first, actor: { kind: 'UNVERIFIED_REFERENCE', subject: 'test-admin' } }] },
      { records: [{ ...first, kind: 'CHANGE_PROPOSED' }] },
    ];
    for (const raw of tampered) {
      expect(activeGovernancePolicy(raw, MARJA), `case ${String(tampered.indexOf(raw))}`).toEqual({
        ok: false,
        error: 'POLICY_REGISTRY_INVALID',
      });
    }
    expect(replayPolicyRegistry(registry)).toMatchObject({
      ok: true,
      value: { policies: { [MARJA]: 'SINGLE_SCHOLAR_V1' }, pending: null },
    });
  });

  it('builds initial configuration only as new first assignments', () => {
    const registry = initial([MARJA, 'SINGLE_SCHOLAR_V1']);
    expect(registry.records[0]).toMatchObject({
      marjaId: MARJA,
      previousPolicy: null,
      newPolicy: 'SINGLE_SCHOLAR_V1',
      actor: { subject: 'system:initial-configuration' },
      decisionId: null,
      reason: 'Owner decision 2026-11-21 (TEST)',
      requestId: 'req-initial',
    });
    // A Marja listed twice in initial configuration is refused (it is not a first assignment).
    expect(
      initialPolicyRegistry(
        [
          { marjaId: MARJA, policy: 'SINGLE_SCHOLAR_V1' },
          { marjaId: MARJA, policy: 'INDEPENDENT_REVIEW_V1' },
        ],
        NOW,
        'TEST',
        'req',
      ).ok,
    ).toBe(false);
    expect(
      initialPolicyRegistry(
        [{ marjaId: MARJA, policy: 'BAD' as GovernancePolicyId }],
        NOW,
        'TEST',
        'req',
      ),
    ).toEqual({ ok: false, error: 'POLICY_CHANGE_INVALID' });
  });
});

describe('changing a policy', () => {
  it('records proposal and confirmation, each with Marja, policies, actor, time, reason and request', () => {
    const start = initial([MARJA, 'INDEPENDENT_REVIEW_V1']);
    const proposal = applied(change(ADMIN, start, MARJA, 'SINGLE_SCHOLAR_V1'));
    expect(proposal.record).toMatchObject({
      kind: 'CHANGE_PROPOSED',
      sequence: 1,
      recordId: 'policy#1',
      marjaId: MARJA,
      previousPolicy: 'INDEPENDENT_REVIEW_V1',
      newPolicy: 'SINGLE_SCHOLAR_V1',
      actor: { kind: 'STAFF_PRINCIPAL', subject: 'test-admin' },
      recordedAt: proposal.decision.evaluatedAt,
      reason: 'Only one trusted scholar for now (TEST)',
      requestId: 'req-change-1',
      decisionId: proposal.decision.decisionId,
      proposal: null,
    });
    // A proposal alone does not change the policy.
    expect(activeGovernancePolicy(proposal.registry, MARJA)).toEqual({
      ok: true,
      value: 'INDEPENDENT_REVIEW_V1',
    });
    const confirmation = applied(confirm(ADMIN_2, proposal.registry));
    expect(confirmation.record).toMatchObject({
      kind: 'CHANGE_CONFIRMED',
      sequence: 2,
      marjaId: MARJA,
      previousPolicy: 'INDEPENDENT_REVIEW_V1',
      newPolicy: 'SINGLE_SCHOLAR_V1',
      actor: { subject: 'test-admin-2' },
      reason: 'Only one trusted scholar for now (TEST)',
      requestId: 'req-confirm-1',
      decisionId: confirmation.decision.decisionId,
      proposal: {
        recordId: 'policy#1',
        recordDigest: proposal.record.recordDigest,
        requestId: 'req-change-1',
      },
    });
    expect(activeGovernancePolicy(confirmation.registry, MARJA)).toEqual({
      ok: true,
      value: 'SINGLE_SCHOLAR_V1',
    });
    expect(Object.isFrozen(confirmation.registry)).toBe(true);
    // Append-only: earlier records are carried over unchanged.
    expect(confirmation.registry.records.slice(0, 2)).toEqual(proposal.registry.records);
    expect(confirmation.registry.records[0]).toEqual(start.records[0]);
  });

  it('sets a first policy for an unconfigured Marja (previous policy null)', () => {
    const outcome = applied(change(ADMIN, createPolicyRegistry(), MARJA, 'SINGLE_SCHOLAR_V1'));
    expect(outcome.record).toMatchObject({ previousPolicy: null, newPolicy: 'SINGLE_SCHOLAR_V1' });
  });

  it('refuses no-op changes and invalid input', () => {
    const registry = initial([MARJA, 'SINGLE_SCHOLAR_V1']);
    expect(reason(change(ADMIN, registry, MARJA, 'SINGLE_SCHOLAR_V1'))).toBe('POLICY_UNCHANGED');
    for (const [policy, overrides] of [
      ['NO_REVIEW_V1', {}],
      ['INDEPENDENT_REVIEW_V1', { reason: '' }],
      ['INDEPENDENT_REVIEW_V1', { reason: '   ' }],
      ['INDEPENDENT_REVIEW_V1', { reason: 'x'.repeat(501) }],
      ['INDEPENDENT_REVIEW_V1', { reason: 42 }],
      ['INDEPENDENT_REVIEW_V1', { requestId: '' }],
      ['INDEPENDENT_REVIEW_V1', { requestId: null }],
    ] as const) {
      expect(
        reason(change(ADMIN, registry, MARJA, policy, overrides)),
        JSON.stringify(overrides),
      ).toBe('POLICY_CHANGE_INVALID');
    }
    expect(reason(change(ADMIN, { records: 'bad' }, MARJA, 'INDEPENDENT_REVIEW_V1'))).toBe(
      'POLICY_REGISTRY_INVALID',
    );
  });
});

describe('unauthorized policy changes', () => {
  const registry = initial(
    [MARJA, 'INDEPENDENT_REVIEW_V1'],
    [OTHER_MARJA, 'INDEPENDENT_REVIEW_V1'],
  );

  it('denies non-administrators, including governing scholars', () => {
    for (const who of [SCHOLAR, REVIEWER, AUDITOR]) {
      expect(reason(change(who, registry, MARJA, 'SINGLE_SCHOLAR_V1')), who.principalId).toBe(
        'MISSING_PERMISSION',
      );
    }
  });

  it('denies an administrator outside their Marja scope (cross-Marja)', () => {
    expect(reason(change(SCOPED_ADMIN, registry, MARJA, 'SINGLE_SCHOLAR_V1'))).toBe('APPLIED');
    expect(reason(change(SCOPED_ADMIN, registry, OTHER_MARJA, 'SINGLE_SCHOLAR_V1'))).toBe(
      'OUT_OF_SCOPE',
    );
    expect(reason(change(SCOPED_ADMIN, registry, 'Bad Id!', 'SINGLE_SCHOLAR_V1'))).toBe(
      'INVALID_REQUEST',
    );
  });

  it('denies suspended accounts, revoked sessions and forged principals; password sign-in is enough', () => {
    const suspended = principal('test-admin-s', {
      roles: [['SUPER_ADMIN', ALL]],
      accountStatus: 'SUSPENDED',
    });
    expect(reason(change(suspended, registry, MARJA, 'SINGLE_SCHOLAR_V1'))).toBe(
      'ACCOUNT_NOT_ACTIVE',
    );
    expect(
      reason(
        change(ADMIN, registry, MARJA, 'SINGLE_SCHOLAR_V1', {
          session: { sessionId: ADMIN.session.sessionId, state: 'REVOKED' },
        }),
      ),
    ).toBe('SESSION_REVOKED');
    const noMfa = principal('test-admin-p', {
      roles: [['SUPER_ADMIN', ALL]],
      assurance: 'AAL1',
      methods: ['PASSWORD'],
    });
    // Password-only sign-in suffices (no mandatory MFA); the administrator is still authorized.
    expect(change(noMfa, registry, MARJA, 'SINGLE_SCHOLAR_V1').status).toBe('APPLIED');
    const forged = {
      kind: 'VERIFIED_PRINCIPAL',
      ...principalInput('test-intruder', { roles: [['SUPER_ADMIN', ALL]] }),
      permissions: ['governance.policy.change'],
    } as unknown as VerifiedPrincipal;
    expect(reason(change(forged, registry, MARJA, 'SINGLE_SCHOLAR_V1'))).toBe(
      'UNVERIFIED_PRINCIPAL',
    );
  });

  it('SINGLE_SCHOLAR_V1 never relaxes separation for the administrator', () => {
    // Decision 64: SUPER_ADMIN may submit now (formerly MISSING_PERMISSION), but the policy relaxes
    // separation only for scholar roles, so it still cannot review its own submission.
    const changed = twoAdmin(registry, MARJA, 'SINGLE_SCHOLAR_V1');
    const pack = testPack();
    const submitted = ledgerOf(
      run(ADMIN, createLedger(PACK_ID, '1.0.0'), { type: 'SUBMIT', pack }, changed),
    );
    expect(denialOf(run(ADMIN, submitted, { type: 'START_REVIEW', pack }, changed))).toBe(
      'SEPARATION_OF_DUTIES',
    );
  });
});

describe('policy changes and pack versions', () => {
  it('binds the Marja’s active policy at first submission; a client cannot override it', () => {
    const registry = initial([MARJA, 'INDEPENDENT_REVIEW_V1']);
    const smuggled = initial([MARJA, 'SINGLE_SCHOLAR_V1']);
    const ledger = ledgerOf(
      run(
        SCHOLAR,
        createLedger(PACK_ID, '1.0.0'),
        {
          type: 'SUBMIT',
          pack: testPack(),
          governancePolicy: 'SINGLE_SCHOLAR_V1',
          policyRegistry: smuggled,
        },
        registry,
      ),
    );
    expect(ledger.records[0]).toMatchObject({ governancePolicy: 'INDEPENDENT_REVIEW_V1' });
  });

  it('a change during review leaves the pack under review on its bound policy and unchanged', () => {
    const before = initial([MARJA, 'INDEPENDENT_REVIEW_V1']);
    const pack = testPack();
    let ledger = ledgerOf(
      run(SCHOLAR, createLedger(PACK_ID, '1.0.0'), { type: 'SUBMIT', pack }, before),
    );
    ledger = ledgerOf(run(REVIEWER, ledger, { type: 'START_REVIEW', pack }, before));
    const snapshot = JSON.stringify(ledger);
    const after = twoAdmin(before, MARJA, 'SINGLE_SCHOLAR_V1');
    // The ledger is untouched by the change.
    expect(JSON.stringify(ledger)).toBe(snapshot);
    // It keeps independent review: the scholar still cannot approve their own submission.
    ledger = ledgerOf(run(REVIEWER, ledger, { type: 'COMPLETE_REVIEW', pack, evidence }, after));
    expect(denialOf(run(SCHOLAR, ledger, { type: 'APPROVE', pack, evidence }, after))).toBe(
      'SEPARATION_OF_DUTIES',
    );
    expect(replayLedger(ledger)).toMatchObject({
      ok: true,
      value: { policy: 'INDEPENDENT_REVIEW_V1' },
    });
  });

  it('a resubmission after a change keeps the bound policy', () => {
    const before = initial([MARJA, 'INDEPENDENT_REVIEW_V1']);
    const pack = testPack();
    let ledger = ledgerOf(
      run(SCHOLAR, createLedger(PACK_ID, '1.0.0'), { type: 'SUBMIT', pack }, before),
    );
    ledger = ledgerOf(run(REVIEWER, ledger, { type: 'START_REVIEW', pack }, before));
    ledger = ledgerOf(run(REVIEWER, ledger, { type: 'REQUEST_CHANGES', pack, evidence }, before));
    const after = twoAdmin(before, MARJA, 'SINGLE_SCHOLAR_V1');
    const revised = testPack('1.0.0', 'TEST category (revised)');
    ledger = ledgerOf(run(SCHOLAR, ledger, { type: 'SUBMIT', pack: revised }, after));
    expect(ledger.records.at(-1)).toMatchObject({ governancePolicy: 'INDEPENDENT_REVIEW_V1' });
  });

  it('a new pack version submitted after the change gets the new policy', () => {
    const before = initial([MARJA, 'INDEPENDENT_REVIEW_V1']);
    const after = twoAdmin(before, MARJA, 'SINGLE_SCHOLAR_V1');
    const next = ledgerOf(
      run(
        SCHOLAR,
        createLedger(PACK_ID, '1.1.0'),
        { type: 'SUBMIT', pack: testPack('1.1.0') },
        after,
      ),
    );
    expect(next.records[0]).toMatchObject({ governancePolicy: 'SINGLE_SCHOLAR_V1' });
    // And the scholar may now carry it alone.
    expect(
      run(SCHOLAR, next, { type: 'START_REVIEW', pack: testPack('1.1.0') }, after).status,
    ).toBe('APPLIED');
  });

  it('changing one Marja does not affect another', () => {
    const registry = initial(
      [MARJA, 'INDEPENDENT_REVIEW_V1'],
      [OTHER_MARJA, 'INDEPENDENT_REVIEW_V1'],
    );
    const changed = twoAdmin(registry, MARJA, 'SINGLE_SCHOLAR_V1');
    expect(activeGovernancePolicy(changed, OTHER_MARJA)).toEqual({
      ok: true,
      value: 'INDEPENDENT_REVIEW_V1',
    });
    const otherScholar = principal('test-other-scholar', {
      roles: [['GOVERNING_SCHOLAR', marjaScope(OTHER_MARJA)]],
    });
    const otherPack = testPack('1.0.0', 'TEST category', OTHER_MARJA);
    const ledger = ledgerOf(
      run(
        otherScholar,
        createLedger(PACK_ID, '1.0.0'),
        { type: 'SUBMIT', pack: otherPack },
        changed,
      ),
    );
    expect(ledger.records[0]).toMatchObject({ governancePolicy: 'INDEPENDENT_REVIEW_V1' });
  });

  it('refuses a first submission for a Marja with no configured policy', () => {
    const registry = initial([OTHER_MARJA, 'SINGLE_SCHOLAR_V1']);
    expect(
      run(SCHOLAR, createLedger(PACK_ID, '1.0.0'), { type: 'SUBMIT', pack: testPack() }, registry),
    ).toMatchObject({
      status: 'REFUSED',
      issues: [{ code: 'POLICY_NOT_CONFIGURED' }],
    });
  });
});

describe('dual-administrator approval of policy changes', () => {
  const start = () =>
    initial([MARJA, 'INDEPENDENT_REVIEW_V1'], [OTHER_MARJA, 'INDEPENDENT_REVIEW_V1']);
  const proposed = () => applied(change(ADMIN, start(), MARJA, 'SINGLE_SCHOLAR_V1')).registry;

  it('the proposer cannot confirm their own proposal', () => {
    const registry = proposed();
    expect(reason(confirm(ADMIN, registry))).toBe('POLICY_SELF_CONFIRMATION');
    expect(activeGovernancePolicy(registry, MARJA)).toEqual({
      ok: true,
      value: 'INDEPENDENT_REVIEW_V1',
    });
  });

  it('refuses a confirmation that does not bind the exact proposal (tampering)', () => {
    const registry = proposed();
    for (const expected of [
      { proposalRecordId: 'policy#0' },
      { marjaId: OTHER_MARJA },
      { previousPolicy: 'SINGLE_SCHOLAR_V1' },
      { previousPolicy: null },
      { newPolicy: 'INDEPENDENT_REVIEW_V1' },
      { reason: 'Something else' },
      { reason: 'Only one trusted scholar for now (TEST) ' },
      { proposalRequestId: 'req-other' },
    ]) {
      const outcome = confirm(ADMIN_2, registry, { expected });
      // A changed Marja is checked against the confirmer's scope first, then the proposal.
      expect(reason(outcome), JSON.stringify(expected)).toBe('POLICY_PROPOSAL_MISMATCH');
    }
  });

  it('refuses confirmation when nothing is pending', () => {
    expect(reason(confirm(ADMIN_2, start()))).toBe('POLICY_PROPOSAL_NOT_PENDING');
  });

  it('any intervening registry change invalidates the pending proposal', () => {
    const first = applied(change(ADMIN, start(), MARJA, 'SINGLE_SCHOLAR_V1')).registry;
    const pendingBefore = replayPolicyRegistry(first);
    // Another proposal (here for another Marja) is appended before the confirmation.
    const intervening = applied(change(ADMIN_2, first, OTHER_MARJA, 'SINGLE_SCHOLAR_V1')).registry;
    const stale = pendingBefore.ok ? pendingBefore.value.pending : null;
    const outcome = confirm(ADMIN_2, intervening, {
      expected: {
        proposalRecordId: stale?.recordId,
        marjaId: stale?.marjaId,
        previousPolicy: stale?.previousPolicy,
        newPolicy: stale?.newPolicy,
        reason: stale?.reason,
        proposalRequestId: stale?.requestId,
      },
    });
    expect(reason(outcome)).toBe('POLICY_PROPOSAL_MISMATCH');
    expect(activeGovernancePolicy(intervening, MARJA)).toEqual({
      ok: true,
      value: 'INDEPENDENT_REVIEW_V1',
    });
    // A stored confirmation that does not directly follow its proposal is rejected on read.
    const done = applied(confirm(ADMIN_2, proposed())).registry;
    const [r0, r1, r2] = done.records;
    if (r0 === undefined || r1 === undefined || r2 === undefined) throw new Error('fixture');
    const spliced = applied(change(ADMIN, { records: [r0, r1] }, OTHER_MARJA, 'SINGLE_SCHOLAR_V1'));
    const forged = {
      records: [...spliced.registry.records, { ...r2, sequence: 3, recordId: 'policy#3' }],
    };
    expect(replayPolicyRegistry(forged)).toEqual({ ok: false, error: 'POLICY_REGISTRY_INVALID' });
  });

  it('a confirmation cannot be replayed', () => {
    const done = applied(confirm(ADMIN_2, proposed())).registry;
    // Confirming again: the proposal is no longer pending.
    expect(reason(confirm(ADMIN_2, done))).toBe('POLICY_PROPOSAL_NOT_PENDING');
    // Re-appending the stored confirmation record is rejected.
    const confirmation = done.records.at(-1);
    if (confirmation === undefined) throw new Error('fixture');
    const replayed = {
      records: [...done.records, { ...confirmation, sequence: 3, recordId: 'policy#3' }],
    };
    expect(replayPolicyRegistry(replayed)).toEqual({ ok: false, error: 'POLICY_REGISTRY_INVALID' });
    // Copying it onto a fresh proposal (different digest and request) is rejected too.
    const fresh = applied(change(ADMIN, done, MARJA, 'INDEPENDENT_REVIEW_V1')).registry;
    const copied = {
      records: [...fresh.records, { ...confirmation, sequence: 4, recordId: 'policy#4' }],
    };
    expect(replayPolicyRegistry(copied)).toEqual({ ok: false, error: 'POLICY_REGISTRY_INVALID' });
  });

  it('a stored self-confirmation is rejected on read', () => {
    const registry = proposed();
    const proposal = registry.records.at(-1);
    if (proposal === undefined) throw new Error('fixture');
    // Build a confirmation by the proposer outside the API (as storage tampering would).
    const viaOtherAdmin = applied(confirm(ADMIN_2, registry)).registry;
    const confirmation = viaOtherAdmin.records.at(-1);
    if (confirmation === undefined) throw new Error('fixture');
    const forged = {
      records: [...registry.records, { ...confirmation, actor: proposal.actor }],
    };
    expect(replayPolicyRegistry(forged)).toEqual({ ok: false, error: 'POLICY_REGISTRY_INVALID' });
  });

  it('the confirmer must be an active, authenticated, in-scope administrator', () => {
    const registry = proposed();
    const suspended = principal('test-admin-s', {
      roles: [['SUPER_ADMIN', ALL]],
      accountStatus: 'SUSPENDED',
    });
    expect(reason(confirm(suspended, registry))).toBe('ACCOUNT_NOT_ACTIVE');
    expect(
      reason(
        confirm(ADMIN_2, registry, {
          session: { sessionId: ADMIN_2.session.sessionId, state: 'REVOKED' },
        }),
      ),
    ).toBe('SESSION_REVOKED');
    const otherScope = principal('test-admin-other', {
      roles: [['SUPER_ADMIN', marjaScope(OTHER_MARJA)]],
    });
    expect(reason(confirm(otherScope, registry))).toBe('OUT_OF_SCOPE');
    for (const who of [SCHOLAR, AUDITOR, REVIEWER]) {
      expect(reason(confirm(who, registry)), who.principalId).toBe('MISSING_PERMISSION');
    }
    // A scoped administrator for this Marja may confirm.
    expect(reason(confirm(SCOPED_ADMIN, registry))).toBe('APPLIED');
  });

  it('the proposer must be authorized too: suspended or revoked proposers record nothing', () => {
    const suspended = principal('test-admin-s', {
      roles: [['SUPER_ADMIN', ALL]],
      accountStatus: 'SUSPENDED',
    });
    expect(reason(change(suspended, start(), MARJA, 'SINGLE_SCHOLAR_V1'))).toBe(
      'ACCOUNT_NOT_ACTIVE',
    );
    expect(
      reason(
        change(ADMIN, start(), MARJA, 'SINGLE_SCHOLAR_V1', {
          session: { sessionId: ADMIN.session.sessionId, state: 'REVOKED' },
        }),
      ),
    ).toBe('SESSION_REVOKED');
  });

  it('two administrators still get no relaxed separation (decision 64)', () => {
    // Formerly: neither administrator could submit. Now both may, under the strict rules.
    const changed = twoAdmin(start(), MARJA, 'SINGLE_SCHOLAR_V1');
    const pack = testPack();
    for (const who of [ADMIN, ADMIN_2]) {
      const submitted = ledgerOf(
        run(who, createLedger(PACK_ID, '1.0.0'), { type: 'SUBMIT', pack }, changed),
      );
      expect(denialOf(run(who, submitted, { type: 'START_REVIEW', pack }, changed))).toBe(
        'SEPARATION_OF_DUTIES',
      );
    }
  });
});
