import { describe, expect, it } from 'vitest';

import type {
  GovernanceActorRef,
  GovernanceLedger,
  GovernancePermission,
  VerifiedPrincipal,
} from '@khums/shared-types';

import { authorize } from '../authorization/evaluate';
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
import { isGovernancePolicyId } from './policy';
import { append, createLedger, replayLedger } from './ledger';
import { storedHistory } from './legacy-test-support';

/**
 * Policy-aware authorization (single-scholar governance, stage 2). Every action goes through the
 * real entry point and the unchanged evaluator; the policy comes only from the server context and
 * the ledger, never from the client command.
 */

const SCHOLAR = principal('test-scholar', { roles: [['GOVERNING_SCHOLAR', marjaScope(MARJA)]] });
const SECOND_SCHOLAR = principal('test-scholar-2', {
  roles: [['GOVERNING_SCHOLAR', marjaScope(MARJA)]],
});
const OTHER_MARJA_SCHOLAR = principal('test-scholar-x', {
  roles: [['GOVERNING_SCHOLAR', marjaScope('other-marja')]],
});
const AUDITOR = principal('test-auditor', { roles: ['AUDITOR'] });
const ADMIN = principal('test-admin', { roles: [['SUPER_ADMIN', ALL]] });
const evidence = { reference: 'docs/research/reviews/test/test-pack.REVIEW.md' };

let tick = 0;
function run(
  who: VerifiedPrincipal,
  ledger: unknown,
  command: Record<string, unknown>,
  governancePolicy: unknown = 'SINGLE_SCHOLAR_V1',
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
      policyRegistry: isGovernancePolicyId(governancePolicy)
        ? policyRegistryFor(governancePolicy, MARJA, 'other-marja')
        : governancePolicy,
    },
  });
}
const ledgerOf = (outcome: AuthorizedGovernanceOutcome): GovernanceLedger => {
  if (outcome.status !== 'APPLIED') {
    throw new Error(
      `expected APPLIED, got ${outcome.status} ${JSON.stringify(
        outcome.status === 'DENIED' ? outcome.decision : outcome.issues,
      )}`,
    );
  }
  return outcome.ledger;
};
const reason = (outcome: AuthorizedGovernanceOutcome) =>
  outcome.status === 'DENIED' && !outcome.decision.allowed
    ? outcome.decision.reason
    : outcome.status;

/** Asks the evaluator directly (publication and activation execution arrive in stage 3). */
function decide(
  who: VerifiedPrincipal,
  permission: GovernancePermission,
  ledger: GovernanceLedger,
) {
  tick += 1;
  const decision = authorize({
    principal: who,
    permission,
    resource: {
      type: 'RULE_PACK_VERSION',
      packId: PACK_ID,
      version: '1.0.0',
      marjaId: MARJA,
      contentDigest: null,
    },
    context: {
      decisionId: `d-${String(tick)}`,
      evaluatedAt: shift(NOW, tick),
      session: { sessionId: who.session.sessionId, state: 'ACTIVE' },
      governance: { ledger },
    },
  });
  return decision.allowed ? 'ALLOWED' : decision.reason;
}

const fresh = () => createLedger(PACK_ID, '1.0.0');

describe('SINGLE_SCHOLAR_V1 with GOVERNING_SCHOLAR', () => {
  it('one governing scholar carries a pack from submission to approval alone', () => {
    const pack = testPack();
    let ledger = ledgerOf(run(SCHOLAR, fresh(), { type: 'SUBMIT', pack }));
    ledger = ledgerOf(run(SCHOLAR, ledger, { type: 'START_REVIEW', pack }));
    ledger = ledgerOf(run(SCHOLAR, ledger, { type: 'COMPLETE_REVIEW', pack, evidence }));
    ledger = ledgerOf(run(SCHOLAR, ledger, { type: 'APPROVE', pack, evidence }));
    const view = replayLedger(ledger);
    expect(view.ok && view.value.state).toBe('APPROVED');
    expect(view.ok && view.value.policy).toBe('SINGLE_SCHOLAR_V1');
    expect(ledger.records.map((r) => r.actor.subject)).toEqual(Array(4).fill('test-scholar'));
    // The same scholar is authorized to publish, activate, supersede and withdraw it.
    for (const permission of [
      'governance.publish',
      'governance.activate',
      'governance.supersede',
      'governance.withdraw',
    ] as const) {
      expect(decide(SCHOLAR, permission, ledger), permission).toBe('ALLOWED');
    }
  });

  it('can request changes on their own submission and resubmit', () => {
    const pack = testPack();
    let ledger = ledgerOf(run(SCHOLAR, fresh(), { type: 'SUBMIT', pack }));
    ledger = ledgerOf(run(SCHOLAR, ledger, { type: 'START_REVIEW', pack }));
    ledger = ledgerOf(run(SCHOLAR, ledger, { type: 'REQUEST_CHANGES', pack, evidence }));
    const revised = testPack('1.0.0', 'TEST category (revised)');
    ledger = ledgerOf(run(SCHOLAR, ledger, { type: 'SUBMIT', pack: revised }));
    expect(ledger.records.at(-1)).toMatchObject({ governancePolicy: 'SINGLE_SCHOLAR_V1' });
  });

  it('only the scholar who started a review may continue it', () => {
    const pack = testPack();
    let ledger = ledgerOf(run(SCHOLAR, fresh(), { type: 'SUBMIT', pack }));
    ledger = ledgerOf(run(SCHOLAR, ledger, { type: 'START_REVIEW', pack }));
    expect(reason(run(SECOND_SCHOLAR, ledger, { type: 'COMPLETE_REVIEW', pack, evidence }))).toBe(
      'SEPARATION_OF_DUTIES',
    );
  });

  it("cannot act on another Marja's packs", () => {
    const pack = testPack();
    expect(reason(run(OTHER_MARJA_SCHOLAR, fresh(), { type: 'SUBMIT', pack }))).toBe(
      'OUT_OF_SCOPE',
    );
    const ledger = ledgerOf(run(SCHOLAR, fresh(), { type: 'SUBMIT', pack }));
    for (const type of ['START_REVIEW', 'WITHDRAW'] as const) {
      expect(reason(run(OTHER_MARJA_SCHOLAR, ledger, { type, pack, reason: 'OTHER' })), type).toBe(
        'OUT_OF_SCOPE',
      );
    }
    expect(decide(OTHER_MARJA_SCHOLAR, 'governance.ledger.read', ledger)).toBe('OUT_OF_SCOPE');
    // A pack of the other Marja is outside the first scholar's scope too.
    const foreign = testPack('1.0.0', 'TEST category', 'other-marja');
    expect(reason(run(SCHOLAR, fresh(), { type: 'SUBMIT', pack: foreign }))).toBe('OUT_OF_SCOPE');
  });

  it('an auditor cannot write', () => {
    const pack = testPack();
    expect(reason(run(AUDITOR, fresh(), { type: 'SUBMIT', pack }))).toBe('MISSING_PERMISSION');
    const ledger = ledgerOf(run(SCHOLAR, fresh(), { type: 'SUBMIT', pack }));
    expect(reason(run(AUDITOR, ledger, { type: 'START_REVIEW', pack }))).toBe('MISSING_PERMISSION');
    expect(decide(AUDITOR, 'governance.ledger.read', ledger)).toBe('ALLOWED');
  });

  it('a platform administrator holds the permissions but never the relaxed rules', () => {
    // Decision 64 (owner decision 2026-11-23): SUPER_ADMIN holds every permission (formerly each
    // step below was MISSING_PERMISSION). SINGLE_SCHOLAR_V1 relaxes separation only for scholar
    // roles, so an administrator acting alone is held to the strict rules.
    const pack = testPack();
    const own = ledgerOf(run(ADMIN, fresh(), { type: 'SUBMIT', pack }));
    expect(reason(run(ADMIN, own, { type: 'START_REVIEW', pack }))).toBe('SEPARATION_OF_DUTIES');
    let ledger = ledgerOf(run(SCHOLAR, fresh(), { type: 'SUBMIT', pack }));
    expect(reason(run(ADMIN, ledger, { type: 'START_REVIEW', pack }))).toBe('APPLIED');
    ledger = ledgerOf(run(SCHOLAR, ledger, { type: 'START_REVIEW', pack }));
    ledger = ledgerOf(run(SCHOLAR, ledger, { type: 'COMPLETE_REVIEW', pack, evidence }));
    // Not author or reviewer: may approve under the strict rules.
    expect(reason(run(ADMIN, ledger, { type: 'APPROVE', pack, evidence }))).toBe('APPLIED');
    ledger = ledgerOf(run(SCHOLAR, ledger, { type: 'APPROVE', pack, evidence }));
    expect(decide(ADMIN, 'governance.publish', ledger)).toBe('ALLOWED');
    expect(decide(ADMIN, 'governance.supersede', ledger)).toBe('ALLOWED');
  });
});

describe('SINGLE_SCHOLAR_V1 with SCHOLAR (decision 64)', () => {
  const NEW_SCHOLAR = principal('test-new-scholar', { roles: [['SCHOLAR', marjaScope(MARJA)]] });
  const NEW_OTHER = principal('test-new-scholar-x', {
    roles: [['SCHOLAR', marjaScope('other-marja')]],
  });

  it('one SCHOLAR carries a pack from submission to approval alone, exactly like GOVERNING_SCHOLAR', () => {
    const pack = testPack();
    let ledger = ledgerOf(run(NEW_SCHOLAR, fresh(), { type: 'SUBMIT', pack }));
    ledger = ledgerOf(run(NEW_SCHOLAR, ledger, { type: 'START_REVIEW', pack }));
    ledger = ledgerOf(run(NEW_SCHOLAR, ledger, { type: 'COMPLETE_REVIEW', pack, evidence }));
    ledger = ledgerOf(run(NEW_SCHOLAR, ledger, { type: 'APPROVE', pack, evidence }));
    for (const permission of [
      'governance.publish',
      'governance.activate',
      'governance.supersede',
      'governance.withdraw',
    ] as const) {
      expect(decide(NEW_SCHOLAR, permission, ledger), permission).toBe('ALLOWED');
    }
  });

  it('keeps every rule for a SCHOLAR under INDEPENDENT_REVIEW_V1, and for other Marjas', () => {
    const pack = testPack();
    const ledger = ledgerOf(
      run(NEW_SCHOLAR, fresh(), { type: 'SUBMIT', pack }, 'INDEPENDENT_REVIEW_V1'),
    );
    expect(
      reason(run(NEW_SCHOLAR, ledger, { type: 'START_REVIEW', pack }, 'INDEPENDENT_REVIEW_V1')),
    ).toBe('SEPARATION_OF_DUTIES');
    // Cross-Marja read-only access never reaches governance commands.
    expect(reason(run(NEW_OTHER, fresh(), { type: 'SUBMIT', pack }))).toBe('OUT_OF_SCOPE');
    const own = ledgerOf(run(NEW_SCHOLAR, fresh(), { type: 'SUBMIT', pack }));
    expect(reason(run(NEW_OTHER, own, { type: 'START_REVIEW', pack }))).toBe('OUT_OF_SCOPE');
  });
});

describe('INDEPENDENT_REVIEW_V1 keeps every separation rule, also for governing scholars', () => {
  it('rejects self-review and self-approval', () => {
    const pack = testPack();
    let ledger = ledgerOf(run(SCHOLAR, fresh(), { type: 'SUBMIT', pack }, 'INDEPENDENT_REVIEW_V1'));
    expect(
      reason(run(SCHOLAR, ledger, { type: 'START_REVIEW', pack }, 'INDEPENDENT_REVIEW_V1')),
    ).toBe('SEPARATION_OF_DUTIES');
    ledger = ledgerOf(run(SECOND_SCHOLAR, ledger, { type: 'START_REVIEW', pack }));
    ledger = ledgerOf(run(SECOND_SCHOLAR, ledger, { type: 'COMPLETE_REVIEW', pack, evidence }));
    for (const who of [SCHOLAR, SECOND_SCHOLAR]) {
      expect(reason(run(who, ledger, { type: 'APPROVE', pack, evidence })), who.principalId).toBe(
        'SEPARATION_OF_DUTIES',
      );
    }
  });
});

describe('the policy comes only from trusted server context and the ledger', () => {
  it('ignores a policy smuggled into the client command', () => {
    const pack = testPack();
    const ledger = ledgerOf(
      run(
        SCHOLAR,
        fresh(),
        { type: 'SUBMIT', pack, governancePolicy: 'SINGLE_SCHOLAR_V1' },
        'INDEPENDENT_REVIEW_V1',
      ),
    );
    expect(ledger.records[0]).toMatchObject({ governancePolicy: 'INDEPENDENT_REVIEW_V1' });
    expect(
      reason(
        run(SCHOLAR, ledger, { type: 'START_REVIEW', pack, governancePolicy: 'SINGLE_SCHOLAR_V1' }),
      ),
    ).toBe('SEPARATION_OF_DUTIES');
  });

  it('applies the bound policy even when the server context now names another', () => {
    const pack = testPack();
    const ledger = ledgerOf(
      run(SCHOLAR, fresh(), { type: 'SUBMIT', pack }, 'INDEPENDENT_REVIEW_V1'),
    );
    // The Marja switched to SINGLE_SCHOLAR_V1 afterwards: this version keeps independent review.
    expect(reason(run(SCHOLAR, ledger, { type: 'START_REVIEW', pack }, 'SINGLE_SCHOLAR_V1'))).toBe(
      'SEPARATION_OF_DUTIES',
    );
  });

  it('refuses a first submission when the server has no valid policy (fail closed)', () => {
    const pack = testPack();
    const missing = executeGovernanceCommand({
      principal: SCHOLAR,
      ledger: fresh(),
      command: { type: 'SUBMIT', pack },
      context: {
        decisionId: 'd-missing',
        evaluatedAt: NOW,
        session: { sessionId: SCHOLAR.session.sessionId, state: 'ACTIVE' },
        policyRegistry: undefined,
      },
    });
    expect(missing).toMatchObject({
      status: 'REFUSED',
      issues: [{ code: 'POLICY_REGISTRY_INVALID' }],
    });
    for (const bad of [null, '', 'single_scholar_v1', 'NO_REVIEW', 1, { records: 'x' }]) {
      expect(
        run(SCHOLAR, fresh(), { type: 'SUBMIT', pack }, bad),
        JSON.stringify(bad),
      ).toMatchObject({
        status: 'REFUSED',
        issues: [{ code: 'POLICY_REGISTRY_INVALID' }],
      });
    }
  });
});

describe('historical ledgers (no recorded policy)', () => {
  const actor = (subject: string): GovernanceActorRef => ({
    kind: 'UNVERIFIED_REFERENCE',
    subject,
  });

  function legacy(by: string): GovernanceLedger {
    const integrity = testPack().metadata.integrity;
    if (integrity === undefined) throw new Error('fixture not sealed');
    const appended = append(fresh(), {
      type: 'SUBMITTED',
      recordedAt: shift(NOW, -60_000),
      actor: actor(by),
      integrity,
    });
    if (!appended.ok) throw new Error('fixture');
    return appended.value.ledger;
  }

  it('fail closed whatever the server context names (M5.2.1)', () => {
    const pack = testPack();
    const ledger = legacy('test-scholar');
    // The submitter is denied by the strict authorization rules; anyone else is refused by the
    // domain: an unbound legacy ledger accepts no new lifecycle record under any assumed policy.
    expect(reason(run(SCHOLAR, ledger, { type: 'START_REVIEW', pack }, 'SINGLE_SCHOLAR_V1'))).toBe(
      'SEPARATION_OF_DUTIES',
    );
    const second = run(SECOND_SCHOLAR, ledger, { type: 'START_REVIEW', pack }, 'SINGLE_SCHOLAR_V1');
    expect(second).toMatchObject({ status: 'REFUSED', issues: [{ code: 'POLICY_UNBOUND' }] });
  });

  it('a resubmission on stored legacy history is refused until bound', () => {
    const pack = testPack();
    const integrity = pack.metadata.integrity;
    if (integrity === undefined) throw new Error('fixture not sealed');
    const reviewer = { kind: 'UNVERIFIED_REFERENCE' as const, subject: 'test-reviewer' };
    let ledger = legacy('test-scholar');
    ledger = storedHistory(ledger, {
      type: 'REVIEW_STARTED',
      recordedAt: shift(NOW, -50_000),
      actor: reviewer,
      integrity,
    });
    ledger = storedHistory(ledger, {
      type: 'CHANGES_REQUESTED',
      recordedAt: shift(NOW, -40_000),
      actor: reviewer,
      integrity,
      evidence,
    });
    const revised = testPack('1.0.0', 'TEST category (revised)');
    expect(
      run(SECOND_SCHOLAR, ledger, { type: 'SUBMIT', pack: revised }, 'SINGLE_SCHOLAR_V1'),
    ).toMatchObject({ status: 'REFUSED', issues: [{ code: 'POLICY_UNBOUND' }] });
  });

  it('an administrator binds it to the Marja’s CURRENT registry policy, never a caller value', () => {
    const pack = testPack();
    const ledger = legacy('test-scholar');
    const bound = run(
      ADMIN,
      ledger,
      // A smuggled policy is ignored: the registry (here SINGLE_SCHOLAR_V1) decides.
      { type: 'BIND_POLICY', pack, policy: 'INDEPENDENT_REVIEW_V1' },
      'SINGLE_SCHOLAR_V1',
    );
    expect(bound).toMatchObject({
      status: 'APPLIED',
      record: { type: 'POLICY_BOUND', governancePolicy: 'SINGLE_SCHOLAR_V1' },
      decision: { permission: 'governance.policy.bindLegacy' },
    });
    const after = ledgerOf(bound);
    // The original submitter, a governing scholar of this Marja, now works under single-scholar rules.
    expect(ledgerOf(run(SCHOLAR, after, { type: 'START_REVIEW', pack })).records.at(-1)?.type).toBe(
      'REVIEW_STARTED',
    );
    // Binding again is refused.
    expect(run(ADMIN, after, { type: 'BIND_POLICY', pack })).toMatchObject({
      status: 'REFUSED',
      issues: [{ code: 'POLICY_ALREADY_BOUND' }],
    });
  });

  it('binding needs the administrative permission, the Marja’s configuration and the bound content', () => {
    const pack = testPack();
    const ledger = legacy('test-scholar');
    for (const who of [SCHOLAR, SECOND_SCHOLAR, AUDITOR]) {
      expect(reason(run(who, ledger, { type: 'BIND_POLICY', pack }))).toBe('MISSING_PERMISSION');
    }
    expect(run(ADMIN, ledger, { type: 'BIND_POLICY', pack }, { malformed: true })).toMatchObject({
      status: 'REFUSED',
      issues: [{ code: 'POLICY_REGISTRY_INVALID' }],
    });
    expect(
      reason(run(ADMIN, ledger, { type: 'BIND_POLICY', pack: testPack('1.0.0', 'TEST other') })),
    ).toBe('INVALID_REQUEST');
  });

  it('an administrator outside the Marja cannot bind, and forged content cannot widen the scope', () => {
    const pack = testPack();
    const ledger = legacy('test-scholar');
    const scopedAdmin = principal('test-admin-x', {
      roles: [['SUPER_ADMIN', marjaScope('other-marja')]],
    });
    expect(reason(run(scopedAdmin, ledger, { type: 'BIND_POLICY', pack }))).toBe('OUT_OF_SCOPE');
    // Presenting another Marja's content to pass the scope check is refused before authorization.
    expect(
      reason(
        run(scopedAdmin, ledger, {
          type: 'BIND_POLICY',
          pack: testPack('1.0.0', 'TEST category', 'other-marja'),
        }),
      ),
    ).toBe('INVALID_REQUEST');
  });

  it('binds exactly the policy the registry holds for the Marja now', () => {
    const pack = testPack();
    for (const policy of ['INDEPENDENT_REVIEW_V1', 'SINGLE_SCHOLAR_V1'] as const) {
      const outcome = run(ADMIN, legacy('test-scholar'), { type: 'BIND_POLICY', pack }, policy);
      expect(outcome).toMatchObject({
        status: 'APPLIED',
        record: { type: 'POLICY_BOUND', governancePolicy: policy },
      });
    }
    // A Marja the registry does not configure: refused (never a default).
    const unconfigured = run(
      ADMIN,
      legacy('test-scholar'),
      { type: 'BIND_POLICY', pack },
      policyRegistryFor('SINGLE_SCHOLAR_V1', 'some-other-marja'),
    );
    expect(unconfigured).toMatchObject({
      status: 'REFUSED',
      issues: [{ code: 'POLICY_NOT_CONFIGURED' }],
    });
  });

  it('a binding grants nobody authority: out-of-scope scholars and auditors stay denied', () => {
    const pack = testPack();
    const bound = ledgerOf(run(ADMIN, legacy('test-scholar'), { type: 'BIND_POLICY', pack }));
    expect(reason(run(OTHER_MARJA_SCHOLAR, bound, { type: 'START_REVIEW', pack }))).toBe(
      'OUT_OF_SCOPE',
    );
    // Decision 64: SUPER_ADMIN holds review now (formerly MISSING_PERMISSION); not an author.
    expect(reason(run(ADMIN, bound, { type: 'START_REVIEW', pack }))).toBe('APPLIED');
    expect(reason(run(AUDITOR, bound, { type: 'START_REVIEW', pack }))).toBe('MISSING_PERMISSION');
  });
});

describe('a governing scholar assigned two Marjas (M5.2.1)', () => {
  const SECOND_MARJA = 'second-marja';
  const THIRD_MARJA = 'third-marja';
  const TWO = principal('test-two-marja-scholar', {
    roles: [['GOVERNING_SCHOLAR', marjaScope(MARJA, SECOND_MARJA)]],
  });
  function runIn(who: VerifiedPrincipal, ledger: unknown, command: Record<string, unknown>) {
    tick += 1;
    return executeGovernanceCommand({
      principal: who,
      ledger,
      command,
      context: {
        decisionId: `d-${String(tick)}`,
        evaluatedAt: shift(NOW, tick),
        session: { sessionId: who.session.sessionId, state: 'ACTIVE' },
        policyRegistry: policyRegistryFor('SINGLE_SCHOLAR_V1', MARJA, SECOND_MARJA, THIRD_MARJA),
      },
    });
  }
  /** Carries one Marja's pack from submission to approval by the same scholar. */
  function approveAlone(marjaId: string) {
    const pack = testPack('1.0.0', 'TEST category', marjaId);
    let ledger: GovernanceLedger = createLedger(PACK_ID, '1.0.0');
    ledger = ledgerOf(runIn(TWO, ledger, { type: 'SUBMIT', pack }));
    ledger = ledgerOf(runIn(TWO, ledger, { type: 'START_REVIEW', pack }));
    ledger = ledgerOf(runIn(TWO, ledger, { type: 'COMPLETE_REVIEW', pack, evidence }));
    ledger = ledgerOf(runIn(TWO, ledger, { type: 'APPROVE', pack, evidence }));
    return { ledger, pack };
  }

  it('manages each authorized Marja independently and alone', () => {
    for (const marjaId of [MARJA, SECOND_MARJA]) {
      const { ledger } = approveAlone(marjaId);
      const view = replayLedger(ledger);
      expect(view.ok && view.value.state).toBe('APPROVED');
      expect(ledger.records.every((r) => r.actor.subject === 'test-two-marja-scholar')).toBe(true);
    }
  });

  it('cannot act on a third Marja it is not authorized for', () => {
    const pack = testPack('1.0.0', 'TEST category', THIRD_MARJA);
    expect(reason(runIn(TWO, createLedger(PACK_ID, '1.0.0'), { type: 'SUBMIT', pack }))).toBe(
      'OUT_OF_SCOPE',
    );
  });

  it("an approval for one Marja does not affect the other Marja's version", () => {
    const first = approveAlone(MARJA);
    const secondPack = testPack('2.0.0', 'TEST category', SECOND_MARJA);
    const secondLedger = ledgerOf(
      runIn(TWO, createLedger(PACK_ID, '2.0.0'), { type: 'SUBMIT', pack: secondPack }),
    );
    expect(replayLedger(first.ledger)).toMatchObject({ ok: true, value: { state: 'APPROVED' } });
    expect(replayLedger(secondLedger)).toMatchObject({ ok: true, value: { state: 'SUBMITTED' } });
    // The first Marja's approval cannot be presented for the second Marja's version.
    expect(reason(runIn(TWO, secondLedger, { type: 'PUBLISH', pack: first.pack }))).not.toBe(
      'ALLOWED',
    );
  });
});

describe('role-grant dual control covers GOVERNING_SCHOLAR', () => {
  it('needs a second administrator to confirm the grant', () => {
    const superAdmin = principal('test-admin-1', { roles: [['SUPER_ADMIN', ALL]] });
    const grant = (stage: 'PROPOSE' | 'CONFIRM', proposedBy: string | null) => ({
      type: 'ROLE_ASSIGNMENT' as const,
      targetPrincipalId: 'test-new-scholar',
      role: 'GOVERNING_SCHOLAR' as const,
      scope: marjaScope(MARJA),
      stage,
      proposedBy,
    });
    const ask = (resource: ReturnType<typeof grant>) => {
      const decision = authorize({
        principal: superAdmin,
        permission: 'identity.role.assign',
        resource,
        context: {
          decisionId: 'd-grant',
          evaluatedAt: NOW,
          session: { sessionId: superAdmin.session.sessionId, state: 'ACTIVE' },
          governance: null,
        },
      });
      return decision.allowed ? 'ALLOWED' : decision.reason;
    };
    expect(ask(grant('PROPOSE', null))).toBe('ALLOWED');
    expect(ask(grant('CONFIRM', 'test-admin-1'))).toBe('SEPARATION_OF_DUTIES');
    expect(ask(grant('CONFIRM', 'test-admin-2'))).toBe('ALLOWED');
  });
});

describe('single-scholar relaxation applies only to a GOVERNING_SCHOLAR scoped to that Marja', () => {
  /**
   * Every ordinary religious governance role, scope ALL: the strongest non-scholar combination.
   * (SUPER_ADMIN can no longer be combined with these roles at all; decision 37.)
   */
  const MIXED = principal('test-mixed', {
    roles: ['RULE_PACK_AUTHOR', 'SCHOLAR_REVIEWER', 'INDEPENDENT_APPROVER'],
  });
  /** Holds GOVERNING_SCHOLAR, but for another Marja, plus ordinary roles for every Marja. */
  const SCHOLAR_ELSEWHERE = principal('test-scholar-elsewhere', {
    roles: [
      ['GOVERNING_SCHOLAR', marjaScope('other-marja')],
      'RULE_PACK_AUTHOR',
      'SCHOLAR_REVIEWER',
      'INDEPENDENT_APPROVER',
    ],
  });
  const REVIEWER = principal('test-plain-reviewer', { roles: ['SCHOLAR_REVIEWER'] });
  const APPROVER = principal('test-plain-approver', { roles: ['INDEPENDENT_APPROVER'] });

  for (const [label, who] of [
    ['mixed author/reviewer/approver', MIXED],
    ['governing scholar of another Marja with ordinary roles', SCHOLAR_ELSEWHERE],
  ] as const) {
    it(`${label}: cannot review their own submission under SINGLE_SCHOLAR_V1`, () => {
      const pack = testPack();
      const ledger = ledgerOf(run(who, fresh(), { type: 'SUBMIT', pack }));
      expect(ledger.records[0]).toMatchObject({ governancePolicy: 'SINGLE_SCHOLAR_V1' });
      expect(reason(run(who, ledger, { type: 'START_REVIEW', pack }))).toBe('SEPARATION_OF_DUTIES');
    });

    it(`${label}: cannot approve, publish or activate work they authored or reviewed`, () => {
      const pack = testPack();
      let ledger = ledgerOf(run(who, fresh(), { type: 'SUBMIT', pack }));
      ledger = ledgerOf(run(REVIEWER, ledger, { type: 'START_REVIEW', pack }));
      ledger = ledgerOf(run(REVIEWER, ledger, { type: 'COMPLETE_REVIEW', pack, evidence }));
      // As the author: no approval.
      expect(reason(run(who, ledger, { type: 'APPROVE', pack, evidence }))).toBe(
        'SEPARATION_OF_DUTIES',
      );
      ledger = ledgerOf(run(APPROVER, ledger, { type: 'APPROVE', pack, evidence }));
      for (const permission of ['governance.publish', 'governance.supersede'] as const) {
        expect(decide(who, permission, ledger), permission).toBe('SEPARATION_OF_DUTIES');
      }
      if (who === MIXED) {
        // Without SUPER_ADMIN or GOVERNING_SCHOLAR there is no activation permission at all.
        expect(decide(MIXED, 'governance.activate', ledger)).toBe('MISSING_PERMISSION');
      }
    });
  }

  it('a plain reviewer who reviewed cannot also approve under SINGLE_SCHOLAR_V1', () => {
    const pack = testPack();
    const dual = principal('test-reviewer-approver', {
      roles: ['SCHOLAR_REVIEWER', 'INDEPENDENT_APPROVER'],
    });
    let ledger = ledgerOf(run(SCHOLAR, fresh(), { type: 'SUBMIT', pack }));
    ledger = ledgerOf(run(dual, ledger, { type: 'START_REVIEW', pack }));
    ledger = ledgerOf(run(dual, ledger, { type: 'COMPLETE_REVIEW', pack, evidence }));
    expect(reason(run(dual, ledger, { type: 'APPROVE', pack, evidence }))).toBe(
      'SEPARATION_OF_DUTIES',
    );
  });

  it('keeps historical authorship for non-scholars under SINGLE_SCHOLAR_V1', () => {
    const author = principal('test-plain-author', {
      roles: ['RULE_PACK_AUTHOR', 'SCHOLAR_REVIEWER'],
    });
    const pack = testPack();
    let ledger = ledgerOf(run(author, fresh(), { type: 'SUBMIT', pack }));
    ledger = ledgerOf(run(REVIEWER, ledger, { type: 'START_REVIEW', pack }));
    ledger = ledgerOf(run(REVIEWER, ledger, { type: 'REQUEST_CHANGES', pack, evidence }));
    const revised = testPack('1.0.0', 'TEST category (revised)');
    ledger = ledgerOf(run(SCHOLAR, ledger, { type: 'SUBMIT', pack: revised }));
    // The earlier (non-scholar) submitter is still an author of this version.
    expect(reason(run(author, ledger, { type: 'START_REVIEW', pack: revised }))).toBe(
      'SEPARATION_OF_DUTIES',
    );
  });

  it('a mixed team works normally with independent people under SINGLE_SCHOLAR_V1', () => {
    const pack = testPack();
    let ledger = ledgerOf(run(SCHOLAR, fresh(), { type: 'SUBMIT', pack }));
    ledger = ledgerOf(run(REVIEWER, ledger, { type: 'START_REVIEW', pack }));
    ledger = ledgerOf(run(REVIEWER, ledger, { type: 'COMPLETE_REVIEW', pack, evidence }));
    // The governing scholar may approve their own submission reviewed by someone else.
    ledger = ledgerOf(run(SCHOLAR, ledger, { type: 'APPROVE', pack, evidence }));
    expect(decide(SCHOLAR, 'governance.publish', ledger)).toBe('ALLOWED');
    // The plain reviewer may not approve or publish what they reviewed.
    expect(decide(REVIEWER, 'governance.publish', ledger)).toBe('MISSING_PERMISSION');
  });

  it('a governing scholar of this Marja is held to the strict rules under INDEPENDENT_REVIEW_V1', () => {
    const pack = testPack();
    let ledger = ledgerOf(run(SCHOLAR, fresh(), { type: 'SUBMIT', pack }, 'INDEPENDENT_REVIEW_V1'));
    expect(reason(run(SCHOLAR, ledger, { type: 'START_REVIEW', pack }))).toBe(
      'SEPARATION_OF_DUTIES',
    );
    ledger = ledgerOf(run(REVIEWER, ledger, { type: 'START_REVIEW', pack }));
    ledger = ledgerOf(run(REVIEWER, ledger, { type: 'COMPLETE_REVIEW', pack, evidence }));
    expect(reason(run(SCHOLAR, ledger, { type: 'APPROVE', pack, evidence }))).toBe(
      'SEPARATION_OF_DUTIES',
    );
    ledger = ledgerOf(run(APPROVER, ledger, { type: 'APPROVE', pack, evidence }));
    expect(decide(SCHOLAR, 'governance.publish', ledger)).toBe('SEPARATION_OF_DUTIES');
    expect(decide(SCHOLAR, 'governance.activate', ledger)).toBe('SEPARATION_OF_DUTIES');
  });

  it('a governing scholar of another Marja gains nothing on this Marja, even with a single-scholar ledger', () => {
    const pack = testPack();
    const ledger = ledgerOf(run(SCHOLAR, fresh(), { type: 'SUBMIT', pack }));
    for (const permission of [
      'governance.review.start',
      'governance.approve',
      'governance.publish',
      'governance.activate',
    ] as const) {
      expect(decide(OTHER_MARJA_SCHOLAR, permission, ledger), permission).toBe('OUT_OF_SCOPE');
    }
  });
});
