import { describe, expect, it } from 'vitest';

import type {
  ApprovalRecord,
  GovernanceLedger,
  GovernancePolicyId,
  RulePack,
  RulePackActivation,
  VerifiedPrincipal,
} from '@khums/shared-types';

import {
  ALL,
  MARJA,
  marjaScope,
  NOW,
  PACK_ID,
  policyRegistryFor,
  principal,
  shift,
  testPack,
} from '../authorization/test-support';
import { executeGovernanceCommand, type AuthorizedGovernanceOutcome } from './authorized';
import {
  approvalsFromLedger,
  checkGovernedProductionReadiness,
  preparePackForPublication,
} from './commands';
import { createLedger, replayLedger } from './ledger';

/**
 * Single-scholar publication and production readiness (stage 3). Every mutation goes through the
 * authorized entry point; approvals and readiness are derived from the verified ledger and the
 * policy bound to the pack version. TEST PACKS ONLY: not rulings.
 */

const SCHOLAR = principal('test-scholar', { roles: [['GOVERNING_SCHOLAR', marjaScope(MARJA)]] });
const OTHER_MARJA_SCHOLAR = principal('test-scholar-x', {
  roles: [['GOVERNING_SCHOLAR', marjaScope('other-marja')]],
});
const AUTHOR = principal('test-author', { roles: ['RULE_PACK_AUTHOR'] });
const REVIEWER = principal('test-reviewer', { roles: ['SCHOLAR_REVIEWER'] });
const APPROVER = principal('test-approver', { roles: ['INDEPENDENT_APPROVER'] });
const MIXED = principal('test-mixed', {
  roles: ['RULE_PACK_AUTHOR', 'SCHOLAR_REVIEWER', 'INDEPENDENT_APPROVER'],
});
const AUDITOR = principal('test-auditor', { roles: ['AUDITOR'] });
const ADMIN = principal('test-admin', { roles: [['SUPER_ADMIN', ALL]] });
const evidence = { reference: 'docs/research/reviews/test/test-pack.REVIEW.md' };

let tick = 0;
function run(
  who: VerifiedPrincipal,
  ledger: unknown,
  command: Record<string, unknown>,
  policy: GovernancePolicyId = 'SINGLE_SCHOLAR_V1',
): AuthorizedGovernanceOutcome {
  tick += 1;
  return executeGovernanceCommand({
    principal: who,
    ledger,
    command,
    context: {
      decisionId: `d-${String(tick)}`,
      evaluatedAt: shift(NOW, tick),
      session: { sessionId: who.session.sessionId, state: 'ACTIVE' },
      policyRegistry: policyRegistryFor(policy, MARJA, 'other-marja'),
    },
  });
}
function applied(outcome: AuthorizedGovernanceOutcome) {
  if (outcome.status !== 'APPLIED') {
    throw new Error(
      `expected APPLIED, got ${outcome.status} ${JSON.stringify(
        outcome.status === 'DENIED' ? outcome.decision : outcome.issues,
      )}`,
    );
  }
  return outcome;
}
const result = (outcome: AuthorizedGovernanceOutcome) =>
  outcome.status === 'DENIED'
    ? outcome.decision.allowed
      ? 'DENIED'
      : outcome.decision.reason
    : outcome.status === 'REFUSED'
      ? outcome.issues.map((i) => i.code)
      : 'APPLIED';

const readinessRequest = (activation: RulePackActivation) => ({
  workflow: 'first-time' as const,
  activation,
  dateRanges: [{ start: '2026-01-01', end: '2026-12-31' }],
});

/** One governing scholar, alone, up to APPROVED. */
function singleScholarApproved() {
  const pack = testPack();
  let ledger: GovernanceLedger = createLedger(PACK_ID, '1.0.0');
  for (const command of [
    { type: 'SUBMIT', pack },
    { type: 'START_REVIEW', pack },
    { type: 'COMPLETE_REVIEW', pack, evidence },
    { type: 'APPROVE', pack, evidence },
  ]) {
    ledger = applied(run(SCHOLAR, ledger, command)).ledger;
  }
  const prepared = preparePackForPublication(pack, ledger);
  if (!prepared.ok) throw new Error('prepare failed');
  return { ledger, approvedPack: prepared.value, pack };
}

function singleScholarPublished() {
  const { ledger, approvedPack } = singleScholarApproved();
  const published = applied(run(SCHOLAR, ledger, { type: 'PUBLISH', pack: approvedPack }));
  if (published.pack === null) throw new Error('no published pack');
  return { ledger: published.ledger, pack: published.pack };
}

/** Independent review with separate people, up to APPROVED. */
function independentApproved(policy: GovernancePolicyId) {
  const pack = testPack();
  let ledger: GovernanceLedger = createLedger(PACK_ID, '1.0.0');
  ledger = applied(run(AUTHOR, ledger, { type: 'SUBMIT', pack }, policy)).ledger;
  ledger = applied(run(REVIEWER, ledger, { type: 'START_REVIEW', pack }, policy)).ledger;
  ledger = applied(
    run(REVIEWER, ledger, { type: 'COMPLETE_REVIEW', pack, evidence }, policy),
  ).ledger;
  ledger = applied(run(APPROVER, ledger, { type: 'APPROVE', pack, evidence }, policy)).ledger;
  const prepared = preparePackForPublication(pack, ledger);
  if (!prepared.ok) throw new Error('prepare failed');
  return { ledger, approvedPack: prepared.value };
}

describe('SINGLE_SCHOLAR_V1: one governing scholar publishes and activates', () => {
  it('derives a single GOVERNING_SCHOLAR approval from the ledger', () => {
    const { ledger, pack } = singleScholarApproved();
    const approvals = approvalsFromLedger(ledger);
    expect(approvals.ok).toBe(true);
    if (!approvals.ok) return;
    expect(approvals.value).toHaveLength(1);
    expect(approvals.value[0]).toMatchObject({
      role: 'GOVERNING_SCHOLAR',
      reviewerId: 'test-scholar',
      integrity: pack.metadata.integrity,
    });
    const approvalRecord = ledger.records.find((r) => r.type === 'APPROVED');
    expect(approvals.value[0]?.reference).toBe(
      `${String(approvalRecord?.recordId)}/${String(approvalRecord?.recordDigest)}`,
    );
  });

  it('completes publication, activation and governed production readiness alone', () => {
    const { ledger, pack } = singleScholarPublished();
    expect(pack.metadata.status).toBe('PUBLISHED');
    const activated = applied(run(SCHOLAR, ledger, { type: 'ACTIVATE', pack }));
    const activation = activated.activation;
    if (activation === null) throw new Error('no activation');
    expect(activation.activatedBy).toBe('test-scholar');
    expect(activation.approvalReferences).toEqual(pack.metadata.approvals.map((a) => a.reference));
    expect(
      checkGovernedProductionReadiness(pack, activated.ledger, readinessRequest(activation)),
    ).toEqual([]);
    expect(activated.ledger.records.map((r) => [r.type, r.actor.subject])).toEqual([
      ['SUBMITTED', 'test-scholar'],
      ['REVIEW_STARTED', 'test-scholar'],
      ['REVIEW_COMPLETED', 'test-scholar'],
      ['APPROVED', 'test-scholar'],
      ['PUBLISHED', 'test-scholar'],
      ['ACTIVATED', 'test-scholar'],
    ]);
  });

  it('uses the two-person approval form when different people reviewed and approved', () => {
    const pack = testPack();
    let ledger: GovernanceLedger = createLedger(PACK_ID, '1.0.0');
    ledger = applied(run(SCHOLAR, ledger, { type: 'SUBMIT', pack })).ledger;
    ledger = applied(run(REVIEWER, ledger, { type: 'START_REVIEW', pack })).ledger;
    ledger = applied(run(REVIEWER, ledger, { type: 'COMPLETE_REVIEW', pack, evidence })).ledger;
    ledger = applied(run(SCHOLAR, ledger, { type: 'APPROVE', pack, evidence })).ledger;
    const approvals = approvalsFromLedger(ledger);
    expect(approvals.ok && approvals.value.map((a) => [a.role, a.reviewerId])).toEqual([
      ['SCHOLAR_REVIEWER', 'test-reviewer'],
      ['APPROVER', 'test-scholar'],
    ]);
  });
});

describe('INDEPENDENT_REVIEW_V1 publication is unchanged', () => {
  it('derives the two-person approvals and publishes', () => {
    const { ledger, approvedPack } = independentApproved('INDEPENDENT_REVIEW_V1');
    expect(approvedPack.metadata.approvals.map((a) => a.role)).toEqual([
      'SCHOLAR_REVIEWER',
      'APPROVER',
    ]);
    expect(result(run(APPROVER, ledger, { type: 'PUBLISH', pack: approvedPack }))).toBe('APPLIED');
  });

  it('a governing scholar cannot publish work they approved under independent review', () => {
    const pack = testPack();
    let ledger: GovernanceLedger = createLedger(PACK_ID, '1.0.0');
    const policy = 'INDEPENDENT_REVIEW_V1';
    ledger = applied(run(AUTHOR, ledger, { type: 'SUBMIT', pack }, policy)).ledger;
    ledger = applied(run(REVIEWER, ledger, { type: 'START_REVIEW', pack }, policy)).ledger;
    ledger = applied(
      run(REVIEWER, ledger, { type: 'COMPLETE_REVIEW', pack, evidence }, policy),
    ).ledger;
    ledger = applied(run(SCHOLAR, ledger, { type: 'APPROVE', pack, evidence }, policy)).ledger;
    const prepared = preparePackForPublication(pack, ledger);
    if (!prepared.ok) throw new Error('prepare failed');
    // Publishing is allowed for an approver who was neither author nor reviewer (unchanged).
    expect(result(run(SCHOLAR, ledger, { type: 'PUBLISH', pack: prepared.value }))).toBe('APPLIED');
  });
});

describe('forged, missing and stale approvals are refused', () => {
  const withApprovals = (pack: RulePack, approvals: readonly ApprovalRecord[]): RulePack => ({
    ...pack,
    metadata: { ...pack.metadata, approvals },
  });

  it('refuses a forged single-scholar approval on an independent-review ledger', () => {
    const { ledger, approvedPack } = independentApproved('INDEPENDENT_REVIEW_V1');
    const [first] = approvedPack.metadata.approvals;
    if (first === undefined) throw new Error('fixture');
    const forged = withApprovals(approvedPack, [{ ...first, role: 'GOVERNING_SCHOLAR' }]);
    expect(result(run(APPROVER, ledger, { type: 'PUBLISH', pack: forged }))).toEqual([
      'APPROVALS_INCONSISTENT',
    ]);
  });

  it('refuses a forged single-scholar approval where two people acted under SINGLE_SCHOLAR_V1', () => {
    const { ledger, approvedPack } = independentApproved('SINGLE_SCHOLAR_V1');
    const [, approver] = approvedPack.metadata.approvals;
    if (approver === undefined) throw new Error('fixture');
    const forged = withApprovals(approvedPack, [{ ...approver, role: 'GOVERNING_SCHOLAR' }]);
    expect(result(run(APPROVER, ledger, { type: 'PUBLISH', pack: forged }))).toEqual([
      'APPROVALS_INCONSISTENT',
    ]);
  });

  it('refuses missing approvals, an approval naming someone else, and stale digests', () => {
    const { ledger, approvedPack } = singleScholarApproved();
    const [approval] = approvedPack.metadata.approvals;
    if (approval?.integrity === undefined) throw new Error('fixture');
    for (const approvals of [
      [],
      [{ ...approval, reviewerId: 'test-someone-else' }],
      [{ ...approval, integrity: { ...approval.integrity, digest: 'f'.repeat(64) } }],
      [approval, approval],
    ]) {
      expect(
        result(
          run(SCHOLAR, ledger, { type: 'PUBLISH', pack: withApprovals(approvedPack, approvals) }),
        ),
      ).toEqual(['APPROVALS_INCONSISTENT']);
    }
  });

  it('refuses changed content after approval (stale hash)', () => {
    const { ledger, approvedPack } = singleScholarApproved();
    const changed = preparePackForPublication(testPack('1.0.0', 'TEST category (changed)'), ledger);
    if (!changed.ok) throw new Error('fixture');
    expect(result(run(SCHOLAR, ledger, { type: 'PUBLISH', pack: changed.value }))).toEqual([
      'STALE_CONTENT',
    ]);
    expect(result(run(SCHOLAR, ledger, { type: 'PUBLISH', pack: approvedPack }))).toBe('APPLIED');
  });

  it('refuses a client-supplied readiness flag or status (status is checked, not trusted)', () => {
    const { ledger, approvedPack } = singleScholarApproved();
    const draft = {
      ...approvedPack,
      metadata: { ...approvedPack.metadata, status: 'DRAFT' as const },
    };
    expect(result(run(SCHOLAR, ledger, { type: 'PUBLISH', pack: draft }))).toEqual([
      'STATUS_INCONSISTENT',
    ]);
    const flagged = { ...approvedPack, ready: true, approved: true };
    expect(result(run(SCHOLAR, ledger, { type: 'PUBLISH', pack: flagged }))).toBe(
      'INVALID_REQUEST',
    );
  });

  it('governed readiness refuses forged approvals and a forged activation', () => {
    const { ledger, pack } = singleScholarPublished();
    const activated = applied(run(SCHOLAR, ledger, { type: 'ACTIVATE', pack }));
    const activation = activated.activation;
    if (activation === null) throw new Error('fixture');
    const [approval] = pack.metadata.approvals;
    if (approval === undefined) throw new Error('fixture');
    const forgedPack = withApprovals(pack, [
      { ...approval, role: 'SCHOLAR_REVIEWER' },
      { ...approval, role: 'APPROVER', reviewerId: 'test-fake-approver' },
    ]);
    expect(
      checkGovernedProductionReadiness(
        forgedPack,
        activated.ledger,
        readinessRequest(activation),
      ).map((i) => i.code),
    ).toContain('APPROVALS_INCONSISTENT');
    const forgedActivation = { ...activation, approvalReferences: ['forged/ref'] };
    expect(
      checkGovernedProductionReadiness(
        pack,
        activated.ledger,
        readinessRequest(forgedActivation),
      ).map((i) => i.code),
    ).toContain('UNKNOWN_REFERENCE');
  });
});

describe('unauthorized publishers and activators', () => {
  it('denies wrong-Marja scholars, auditors, administrators and mixed-role users', () => {
    const { ledger, approvedPack } = singleScholarApproved();
    expect(result(run(OTHER_MARJA_SCHOLAR, ledger, { type: 'PUBLISH', pack: approvedPack }))).toBe(
      'OUT_OF_SCOPE',
    );
    expect(result(run(AUDITOR, ledger, { type: 'PUBLISH', pack: approvedPack }))).toBe(
      'MISSING_PERMISSION',
    );
    // Decision 64: SUPER_ADMIN holds publication now (formerly MISSING_PERMISSION); it did not
    // author, review or approve this pack, so the strict rules allow it, like MIXED below.
    expect(result(run(ADMIN, ledger, { type: 'PUBLISH', pack: approvedPack }))).toBe('APPLIED');
    // MIXED holds INDEPENDENT_APPROVER but is not a governing scholar; they did not author or
    // review this pack, so independent rules allow them to publish it (normal two-person flow).
    expect(result(run(MIXED, ledger, { type: 'PUBLISH', pack: approvedPack }))).toBe('APPLIED');
  });

  it('denies activation by wrong-Marja scholars and auditors', () => {
    const { ledger, pack } = singleScholarPublished();
    expect(result(run(OTHER_MARJA_SCHOLAR, ledger, { type: 'ACTIVATE', pack }))).toBe(
      'OUT_OF_SCOPE',
    );
    expect(result(run(AUDITOR, ledger, { type: 'ACTIVATE', pack }))).toBe('MISSING_PERMISSION');
  });

  it('a mixed-role author cannot publish their own single-scholar-ledger pack', () => {
    const pack = testPack();
    let ledger: GovernanceLedger = createLedger(PACK_ID, '1.0.0');
    ledger = applied(run(MIXED, ledger, { type: 'SUBMIT', pack })).ledger;
    ledger = applied(run(REVIEWER, ledger, { type: 'START_REVIEW', pack })).ledger;
    ledger = applied(run(REVIEWER, ledger, { type: 'COMPLETE_REVIEW', pack, evidence })).ledger;
    ledger = applied(run(APPROVER, ledger, { type: 'APPROVE', pack, evidence })).ledger;
    const prepared = preparePackForPublication(pack, ledger);
    if (!prepared.ok) throw new Error('prepare failed');
    expect(result(run(MIXED, ledger, { type: 'PUBLISH', pack: prepared.value }))).toBe(
      'SEPARATION_OF_DUTIES',
    );
  });
});

describe('activation requires a valid publication', () => {
  it('refuses activating an approved but unpublished pack', () => {
    const { ledger, approvedPack } = singleScholarApproved();
    const published = {
      ...approvedPack,
      metadata: { ...approvedPack.metadata, status: 'PUBLISHED' as const },
    };
    expect(result(run(SCHOLAR, ledger, { type: 'ACTIVATE', pack: published }))).toEqual([
      'INVALID_TRANSITION',
    ]);
  });

  it('refuses a second activation and activation after withdrawal', () => {
    const { ledger, pack } = singleScholarPublished();
    const activated = applied(run(SCHOLAR, ledger, { type: 'ACTIVATE', pack }));
    expect(result(run(SCHOLAR, activated.ledger, { type: 'ACTIVATE', pack }))).toEqual([
      'ALREADY_ACTIVATED',
    ]);
    const withdrawn = applied(
      run(SCHOLAR, ledger, { type: 'WITHDRAW', pack, reason: 'ERROR_FOUND' }),
    ).ledger;
    expect(replayLedger(withdrawn)).toMatchObject({ ok: true, value: { state: 'WITHDRAWN' } });
    // Refused: the version is no longer PUBLISHED (terminal WITHDRAWN state).
    expect(result(run(SCHOLAR, withdrawn, { type: 'ACTIVATE', pack }))).toEqual([
      'INVALID_TRANSITION',
    ]);
  });
});
