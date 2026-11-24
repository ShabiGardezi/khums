import { describe, expect, it } from 'vitest';

import type { GovernanceLedger, RulePack, VerifiedPrincipal } from '@khums/shared-types';

import {
  ledgerUnderReview,
  marjaScope,
  MINUTE,
  NOW,
  PACK_ID,
  policyRegistryFor,
  principal,
  shift,
  testPack,
} from '../authorization/test-support';
import { executeGovernanceCommand, type AuthorizedGovernanceOutcome } from './authorized';
import { preparePackForPublication } from './commands';
import { createLedger, replayLedger } from './ledger';

/**
 * Governance through the authorized entry point (M4.6.1). Test identities and a test pack only;
 * no religious content. The evaluator decides who may attempt an action; the governance domain
 * still decides whether the transition is valid.
 */

const AUTHOR = principal('test-author', { roles: ['RULE_PACK_AUTHOR'] });
const REVIEWER = principal('test-reviewer', { roles: ['SCHOLAR_REVIEWER'] });
const APPROVER = principal('test-approver', { roles: ['INDEPENDENT_APPROVER'] });
const ADMIN = principal('test-admin', { roles: ['SUPER_ADMIN'] });
/** M5.2.1: activation needs a scholar's authority (an in-scope scholar outside the chain). */
const ACTIVATOR = principal('test-activator', {
  roles: [['GOVERNING_SCHOLAR', marjaScope('test-marja')]],
});
const emergencyNote = 'TEST emergency: error reported in the published content';
const evidence = { reference: 'docs/research/reviews/test/test-pack.REVIEW.md' };

let tick = 0;
/**
 * Server context; time advances one millisecond per call, so every request stays inside the
 * principal-age and step-up windows of principals established at NOW.
 */
const ctx = (who: VerifiedPrincipal) => {
  tick += 1;
  return {
    decisionId: `decision-${String(tick)}`,
    evaluatedAt: shift(NOW, tick),
    session: { sessionId: who.session.sessionId, state: 'ACTIVE' },
    policyRegistry: policyRegistryFor('INDEPENDENT_REVIEW_V1'),
  };
};

const run = (who: unknown, ledger: unknown, command: unknown, sessionOf = who) =>
  executeGovernanceCommand({
    principal: who,
    ledger,
    command,
    context: ctx(sessionOf as VerifiedPrincipal),
  });

function applied(outcome: AuthorizedGovernanceOutcome) {
  if (outcome.status !== 'APPLIED') {
    throw new Error(
      `expected APPLIED, got ${outcome.status}: ${
        outcome.status === 'DENIED'
          ? outcome.decision.allowed
            ? ''
            : outcome.decision.reason
          : outcome.issues.map((i) => i.code).join(', ')
      }`,
    );
  }
  return outcome;
}
const denial = (outcome: AuthorizedGovernanceOutcome) =>
  outcome.status === 'DENIED' && !outcome.decision.allowed
    ? outcome.decision.reason
    : outcome.status;
const refusal = (outcome: AuthorizedGovernanceOutcome) =>
  outcome.status === 'REFUSED' ? outcome.issues.map((i) => i.code) : outcome.status;

/** Drives the pack to the given point through the authorized entry point only. */
function through(
  stage: 'SUBMITTED' | 'UNDER_REVIEW' | 'REVIEWED' | 'APPROVED' | 'PUBLISHED',
  version = '1.0.0',
) {
  const pack = testPack(version);
  let ledger: GovernanceLedger = createLedger(PACK_ID, version);
  ledger = applied(run(AUTHOR, ledger, { type: 'SUBMIT', pack })).ledger;
  if (stage === 'SUBMITTED') return { ledger, pack };
  ledger = applied(run(REVIEWER, ledger, { type: 'START_REVIEW', pack })).ledger;
  if (stage === 'UNDER_REVIEW') return { ledger, pack };
  ledger = applied(run(REVIEWER, ledger, { type: 'COMPLETE_REVIEW', pack, evidence })).ledger;
  if (stage === 'REVIEWED') return { ledger, pack };
  ledger = applied(run(APPROVER, ledger, { type: 'APPROVE', pack, evidence })).ledger;
  const approvedPack = preparePackForPublication(pack, ledger);
  if (!approvedPack.ok) throw new Error('prepare failed');
  if (stage === 'APPROVED') return { ledger, pack: approvedPack.value };
  const published = applied(run(APPROVER, ledger, { type: 'PUBLISH', pack: approvedPack.value }));
  if (published.pack === null) throw new Error('no published pack');
  return { ledger: published.ledger, pack: published.pack };
}

describe('authorized governance lifecycle', () => {
  it('runs the full lifecycle with server-derived actors and times', () => {
    const { ledger, pack } = through('PUBLISHED');
    const activated = applied(run(ACTIVATOR, ledger, { type: 'ACTIVATE', pack }));
    const actors = activated.ledger.records.map((r) => [r.type, r.actor.subject]);
    expect(actors).toEqual([
      ['SUBMITTED', 'test-author'],
      ['REVIEW_STARTED', 'test-reviewer'],
      ['REVIEW_COMPLETED', 'test-reviewer'],
      ['APPROVED', 'test-approver'],
      ['PUBLISHED', 'test-approver'],
      ['ACTIVATED', 'test-activator'],
    ]);
    expect(activated.activation?.activatedBy).toBe('test-activator');
    expect(activated.record.recordedAt).toBe(activated.decision.evaluatedAt);
    expect(activated.decision).toMatchObject({ allowed: true, permission: 'governance.activate' });
    expect(replayLedger(activated.ledger)).toMatchObject({
      ok: true,
      value: { state: 'PUBLISHED' },
    });
  });

  it('ignores actor, time and resource fields smuggled into the command', () => {
    const pack = testPack();
    const outcome = applied(
      run(AUTHOR, createLedger(PACK_ID, '1.0.0'), {
        type: 'SUBMIT',
        pack,
        actor: { kind: 'UNVERIFIED_REFERENCE', subject: 'test-approver' },
        at: '2000-01-01T00:00:00.000Z',
        resource: { type: 'RULE_PACK_VERSION', marjaId: 'test-other-marja' },
      }),
    );
    expect(outcome.record.actor).toEqual({ kind: 'STAFF_PRINCIPAL', subject: 'test-author' });
    expect(outcome.record.recordedAt).toBe(outcome.decision.evaluatedAt);
  });
});

describe('verified staff actors (D3, M4.6.4a)', () => {
  it('writes every record with the STAFF_PRINCIPAL actor of the established principal', () => {
    const { ledger } = through('PUBLISHED');
    for (const record of ledger.records) expect(record.actor.kind).toBe('STAFF_PRINCIPAL');
  });

  it('keeps legacy UNVERIFIED_REFERENCE records readable next to new records (no re-hash)', () => {
    const legacy = ledgerUnderReview('test-author', 'test-reviewer');
    expect(legacy.records.map((r) => r.actor.kind)).toEqual([
      'UNVERIFIED_REFERENCE',
      'UNVERIFIED_REFERENCE',
    ]);
    const before = legacy.records.map((r) => r.recordDigest);
    const next = applied(
      run(REVIEWER, legacy, {
        type: 'COMPLETE_REVIEW',
        pack: testPack(),
        evidence,
      }),
    );
    expect(next.record.actor).toEqual({ kind: 'STAFF_PRINCIPAL', subject: 'test-reviewer' });
    expect(next.ledger.records.slice(0, 2).map((r) => r.recordDigest)).toEqual(before);
    expect(replayLedger(next.ledger).ok).toBe(true);
  });

  it('applies separation of duties across actor kinds (same subject = same person)', () => {
    const legacy = ledgerUnderReview('test-author', 'test-reviewer', true);
    const selfApproval = run(
      principal('test-author', { roles: ['INDEPENDENT_APPROVER'] }),
      legacy,
      { type: 'APPROVE', pack: testPack(), evidence },
    );
    expect(selfApproval.status).not.toBe('APPLIED');
  });

  it('refuses records with an unknown actor kind', () => {
    const { ledger } = through('SUBMITTED');
    const [first] = ledger.records;
    if (first === undefined) throw new Error('fixture');
    const forged = {
      ...ledger,
      records: [{ ...first, actor: { kind: 'VERIFIED', subject: 'x' } }],
    };
    expect(replayLedger(forged).ok).toBe(false);
  });
});

describe('authorization denials leave the ledger untouched', () => {
  it('lets a SUPER_ADMIN outside the chain approve, publish or review (decision 64)', () => {
    // Policy change (owner decision 2026-11-23): SUPER_ADMIN holds every permission. Formerly each
    // of these was MISSING_PERMISSION. Separation of duties still applies (next tests).
    const reviewed = through('REVIEWED');
    expect(
      denial(run(ADMIN, reviewed.ledger, { type: 'APPROVE', pack: reviewed.pack, evidence })),
    ).toBe('APPLIED');
    const approved = through('APPROVED');
    expect(denial(run(ADMIN, approved.ledger, { type: 'PUBLISH', pack: approved.pack }))).toBe(
      'APPLIED',
    );
    const submitted = through('SUBMITTED');
    expect(
      denial(run(ADMIN, submitted.ledger, { type: 'START_REVIEW', pack: submitted.pack })),
    ).toBe('APPLIED');
  });

  it('denies self-review, self-approval and a reviewer approving their own review', () => {
    const authorReviewer = principal('test-author', {
      roles: ['RULE_PACK_AUTHOR', 'SCHOLAR_REVIEWER'],
    });
    const submitted = through('SUBMITTED');
    expect(
      denial(run(authorReviewer, submitted.ledger, { type: 'START_REVIEW', pack: submitted.pack })),
    ).toBe('SEPARATION_OF_DUTIES');

    const reviewed = through('REVIEWED');
    const authorApprover = principal('test-author', { roles: ['INDEPENDENT_APPROVER'] });
    const reviewerApprover = principal('test-reviewer', {
      roles: ['SCHOLAR_REVIEWER', 'INDEPENDENT_APPROVER'],
    });
    for (const who of [authorApprover, reviewerApprover]) {
      const outcome = run(who, reviewed.ledger, { type: 'APPROVE', pack: reviewed.pack, evidence });
      expect(denial(outcome)).toBe('SEPARATION_OF_DUTIES');
    }
  });

  it('denies unauthorized publication and activation', () => {
    const approved = through('APPROVED');
    // Decision 64: ADMIN (SUPER_ADMIN) may publish and activate now; removed from these lists.
    for (const who of [AUTHOR, REVIEWER]) {
      expect(denial(run(who, approved.ledger, { type: 'PUBLISH', pack: approved.pack }))).toBe(
        'MISSING_PERMISSION',
      );
    }
    const published = through('PUBLISHED');
    for (const who of [AUTHOR, REVIEWER, APPROVER]) {
      expect(denial(run(who, published.ledger, { type: 'ACTIVATE', pack: published.pack }))).toBe(
        'MISSING_PERMISSION',
      );
    }
    // Under independent review, a governing scholar in this cycle's chain cannot activate it.
    for (const id of ['test-approver', 'test-author']) {
      const inChain = principal(id, { roles: [['GOVERNING_SCHOLAR', marjaScope('test-marja')]] });
      expect(
        denial(run(inChain, published.ledger, { type: 'ACTIVATE', pack: published.pack })),
      ).toBe('SEPARATION_OF_DUTIES');
    }
  });

  it('denies forged and missing principals', () => {
    const submitted = through('SUBMITTED');
    const forged = { ...REVIEWER };
    expect(
      denial(
        run(forged, submitted.ledger, { type: 'START_REVIEW', pack: submitted.pack }, REVIEWER),
      ),
    ).toBe('UNVERIFIED_PRINCIPAL');
    expect(
      denial(run(null, submitted.ledger, { type: 'START_REVIEW', pack: submitted.pack }, REVIEWER)),
    ).toBe('NOT_AUTHENTICATED');
  });

  it('denies a reviewer scoped to another Marja', () => {
    const scoped = principal('test-reviewer', {
      roles: [['SCHOLAR_REVIEWER', marjaScope('test-other-marja')]],
    });
    const submitted = through('SUBMITTED');
    expect(
      denial(run(scoped, submitted.ledger, { type: 'START_REVIEW', pack: submitted.pack })),
    ).toBe('OUT_OF_SCOPE');
  });

  it('needs no re-authentication for approval (MFA at sign-in only)', () => {
    const signedInEarlier = principal('test-approver', {
      roles: ['INDEPENDENT_APPROVER'],
      authenticatedAt: shift(NOW, -20 * MINUTE),
    });
    const reviewed = through('REVIEWED');
    expect(
      run(signedInEarlier, reviewed.ledger, { type: 'APPROVE', pack: reviewed.pack, evidence })
        .status,
    ).toBe('APPLIED');
  });

  it('accepts approval from a password sign-in (no mandatory MFA; separation still applies)', () => {
    const passwordOnly = principal('test-approver', {
      roles: ['INDEPENDENT_APPROVER'],
      assurance: 'AAL1',
      methods: ['PASSWORD'],
    });
    const reviewed = through('REVIEWED');
    expect(
      run(passwordOnly, reviewed.ledger, { type: 'APPROVE', pack: reviewed.pack, evidence }).status,
    ).toBe('APPLIED');
  });
});

describe('the domain remains authoritative after authorization', () => {
  it('refuses an authorized but invalid transition', () => {
    const pack = testPack();
    const outcome = run(REVIEWER, createLedger(PACK_ID, '1.0.0'), { type: 'START_REVIEW', pack });
    expect(outcome.decision.allowed).toBe(true);
    expect(refusal(outcome)).toContain('INVALID_TRANSITION');
  });

  it('refuses stale content even for an authorized approver', () => {
    const reviewed = through('REVIEWED');
    const changed = testPack('1.0.0', 'TEST category (changed)');
    expect(
      refusal(run(APPROVER, reviewed.ledger, { type: 'APPROVE', pack: changed, evidence })),
    ).toContain('STALE_CONTENT');
  });
});

describe('withdraw and supersede bind the content used for the scope check', () => {
  it('withdraws with the submitted content', () => {
    const submitted = through('SUBMITTED');
    const outcome = run(APPROVER, submitted.ledger, {
      type: 'WITHDRAW',
      pack: submitted.pack,
      reason: 'ERROR_FOUND',
    });
    expect(applied(outcome).record.type).toBe('WITHDRAWN');
  });

  it('denies a withdrawal presenting other content (e.g. another Marja to escape scope)', () => {
    const submitted = through('SUBMITTED');
    const scopedAdmin = principal('test-approver-2', {
      roles: [['INDEPENDENT_APPROVER', marjaScope('test-other-marja')]],
    });
    const otherMarja = testPack('1.0.0', 'TEST category', 'test-other-marja');
    expect(
      denial(
        run(scopedAdmin, submitted.ledger, { type: 'WITHDRAW', pack: otherMarja, reason: 'OTHER' }),
      ),
    ).toBe('INVALID_REQUEST');
    expect(
      denial(
        run(scopedAdmin, submitted.ledger, {
          type: 'WITHDRAW',
          pack: submitted.pack,
          reason: 'OTHER',
        }),
      ),
    ).toBe('OUT_OF_SCOPE');
  });

  it('supersede requires this version’s published content', () => {
    const submitted = through('SUBMITTED');
    expect(
      denial(
        run(APPROVER, submitted.ledger, {
          type: 'SUPERSEDE',
          pack: submitted.pack,
          successor: submitted.ledger,
        }),
      ),
    ).toBe('INVALID_REQUEST');
  });
});

describe('malformed input fails closed', () => {
  const pack: RulePack = testPack();
  const ledger = createLedger(PACK_ID, '1.0.0');

  it('denies unknown commands, missing packs, malformed ledgers and missing evidence', () => {
    for (const command of [
      null,
      'SUBMIT',
      {},
      { type: 'DELETE_EVERYTHING', pack },
      { type: 'toString', pack },
      { type: 'SUBMIT' },
      { type: 'SUBMIT', pack: { ...pack, extra: true } },
    ]) {
      expect(denial(run(AUTHOR, ledger, command))).toBe('INVALID_REQUEST');
    }
    expect(denial(run(AUTHOR, { packId: PACK_ID }, { type: 'SUBMIT', pack }))).toBe(
      'INVALID_REQUEST',
    );
    const reviewed = through('UNDER_REVIEW');
    expect(
      denial(run(REVIEWER, reviewed.ledger, { type: 'COMPLETE_REVIEW', pack: reviewed.pack })),
    ).toBe('INVALID_REQUEST');
    expect(
      denial(
        run(REVIEWER, reviewed.ledger, {
          type: 'COMPLETE_REVIEW',
          pack: reviewed.pack,
          evidence: { reference: 42 },
        }),
      ),
    ).toBe('INVALID_REQUEST');
  });

  it('denies a malformed context and never throws on hostile input', () => {
    const bad = executeGovernanceCommand({
      principal: AUTHOR,
      ledger,
      command: { type: 'SUBMIT', pack },
      context: {
        decisionId: 'd',
        evaluatedAt: 'yesterday',
        session: null,
        policyRegistry: policyRegistryFor('INDEPENDENT_REVIEW_V1'),
      },
    });
    expect(denial(bad)).toBe('INVALID_REQUEST');
    const hostile = new Proxy(
      {},
      {
        get() {
          throw new Error('boom');
        },
      },
    );
    expect(denial(executeGovernanceCommand(hostile as never))).toBe('INVALID_REQUEST');
    expect(denial(run(AUTHOR, ledger, hostile))).toBe('INVALID_REQUEST');
  });
});

describe('approved governance policies (M4.6.1 review decision)', () => {
  it('policy 1: every historical submitter of the version stays an author of that version', () => {
    const firstAuthor = principal('test-author', { roles: ['RULE_PACK_AUTHOR'] });
    const secondAuthor = principal('test-author-2', { roles: ['RULE_PACK_AUTHOR'] });
    const first = testPack();
    const revised = testPack('1.0.0', 'TEST category (revised)');
    let ledger: GovernanceLedger = createLedger(PACK_ID, '1.0.0');
    ledger = applied(run(firstAuthor, ledger, { type: 'SUBMIT', pack: first })).ledger;
    ledger = applied(run(REVIEWER, ledger, { type: 'START_REVIEW', pack: first })).ledger;
    ledger = applied(
      run(REVIEWER, ledger, { type: 'REQUEST_CHANGES', pack: first, evidence }),
    ).ledger;
    ledger = applied(run(secondAuthor, ledger, { type: 'SUBMIT', pack: revised })).ledger;

    // The first author, now also holding reviewer and approver roles, may not review…
    const firstAuthorStaff = principal('test-author', {
      roles: ['SCHOLAR_REVIEWER', 'INDEPENDENT_APPROVER'],
    });
    expect(denial(run(firstAuthorStaff, ledger, { type: 'START_REVIEW', pack: revised }))).toBe(
      'SEPARATION_OF_DUTIES',
    );
    ledger = applied(run(REVIEWER, ledger, { type: 'START_REVIEW', pack: revised })).ledger;
    ledger = applied(
      run(REVIEWER, ledger, { type: 'COMPLETE_REVIEW', pack: revised, evidence }),
    ).ledger;
    // …or approve, although the domain alone would accept it (it compares the current cycle).
    expect(
      denial(run(firstAuthorStaff, ledger, { type: 'APPROVE', pack: revised, evidence })),
    ).toBe('SEPARATION_OF_DUTIES');
    expect(
      applied(run(APPROVER, ledger, { type: 'APPROVE', pack: revised, evidence })).record.type,
    ).toBe('APPROVED');
  });

  it('policy 1 is scoped to the pack version: an author of 1.0.0 may review 1.1.0', () => {
    const v1 = through('SUBMITTED', '1.0.0');
    const v11 = testPack('1.1.0');
    const otherAuthor = principal('test-author-2', { roles: ['RULE_PACK_AUTHOR'] });
    const v11Ledger = applied(
      run(otherAuthor, createLedger(PACK_ID, '1.1.0'), { type: 'SUBMIT', pack: v11 }),
    ).ledger;
    const authorReviewer = principal('test-author', { roles: ['SCHOLAR_REVIEWER'] });
    expect(denial(run(authorReviewer, v1.ledger, { type: 'START_REVIEW', pack: v1.pack }))).toBe(
      'SEPARATION_OF_DUTIES',
    );
    expect(
      applied(run(authorReviewer, v11Ledger, { type: 'START_REVIEW', pack: v11 })).record.type,
    ).toBe('REVIEW_STARTED');
  });

  it('policy 2: the activator differs from the author, reviewer and approver', () => {
    const published = through('PUBLISHED');
    for (const id of ['test-author', 'test-reviewer', 'test-approver']) {
      const scholarInChain = principal(id, {
        roles: [['GOVERNING_SCHOLAR', marjaScope('test-marja')]],
      });
      expect(
        denial(run(scholarInChain, published.ledger, { type: 'ACTIVATE', pack: published.pack })),
      ).toBe('SEPARATION_OF_DUTIES');
    }
    expect(
      applied(run(ACTIVATOR, published.ledger, { type: 'ACTIVATE', pack: published.pack })).record
        .type,
    ).toBe('ACTIVATED');
  });

  it('policy 4: withdraw accepts only the content the ledger bound, never a replacement', () => {
    const submitted = through('SUBMITTED');
    const replacement = testPack('1.0.0', 'TEST category (replacement)');
    const otherPackId = {
      ...submitted.pack,
      metadata: { ...submitted.pack.metadata, packId: 'test-other-pack' },
    };
    for (const pack of [replacement, otherPackId, testPack('1.1.0')]) {
      expect(
        denial(run(APPROVER, submitted.ledger, { type: 'WITHDRAW', pack, reason: 'OTHER' })),
      ).toBe('INVALID_REQUEST');
    }
    // After a resubmission, only the LATEST submitted content is accepted.
    const first = testPack();
    const revised = testPack('1.0.0', 'TEST category (revised)');
    let ledger: GovernanceLedger = createLedger(PACK_ID, '1.0.0');
    ledger = applied(run(AUTHOR, ledger, { type: 'SUBMIT', pack: first })).ledger;
    ledger = applied(run(REVIEWER, ledger, { type: 'START_REVIEW', pack: first })).ledger;
    ledger = applied(
      run(REVIEWER, ledger, { type: 'REQUEST_CHANGES', pack: first, evidence }),
    ).ledger;
    ledger = applied(run(AUTHOR, ledger, { type: 'SUBMIT', pack: revised })).ledger;
    expect(denial(run(APPROVER, ledger, { type: 'WITHDRAW', pack: first, reason: 'OTHER' }))).toBe(
      'INVALID_REQUEST',
    );
    expect(
      applied(run(APPROVER, ledger, { type: 'WITHDRAW', pack: revised, reason: 'OTHER' })).record
        .type,
    ).toBe('WITHDRAWN');
  });

  it('policy 4: supersede accepts only this version’s published content', () => {
    const v1 = through('PUBLISHED', '1.0.0');
    const v2 = through('PUBLISHED', '2.0.0');
    const changedV1 = {
      ...v1.pack,
      metadata: { ...v1.pack.metadata, title: 'TEST PACK — altered' },
    };
    // (The same content in DRAFT status has the same digest, so it is not a replacement.)
    for (const pack of [v2.pack, changedV1]) {
      expect(
        denial(run(APPROVER, v1.ledger, { type: 'SUPERSEDE', pack, successor: v2.ledger })),
      ).toBe('INVALID_REQUEST');
    }
    const superseded = applied(
      run(APPROVER, v1.ledger, { type: 'SUPERSEDE', pack: v1.pack, successor: v2.ledger }),
    );
    expect(superseded.record.type).toBe('SUPERSEDED');
  });
});

describe('SUPER_ADMIN withdrawals (M5.2.1; decision 64)', () => {
  it('may use the normal withdrawal too (decision 64; formerly MISSING_PERMISSION)', () => {
    const submitted = through('SUBMITTED');
    expect(
      denial(
        run(ADMIN, submitted.ledger, { type: 'WITHDRAW', pack: submitted.pack, reason: 'OTHER' }),
      ),
    ).toBe('APPLIED');
  });

  it('withdraws a PUBLISHED version in an emergency, with a reason', () => {
    const published = through('PUBLISHED');
    const outcome = applied(
      run(ADMIN, published.ledger, {
        type: 'EMERGENCY_WITHDRAW',
        pack: published.pack,
        reason: 'ERROR_FOUND',
        note: emergencyNote,
      }),
    );
    expect(outcome.record).toMatchObject({
      type: 'WITHDRAWN',
      reason: 'ERROR_FOUND',
      actor: { kind: 'STAFF_PRINCIPAL', subject: 'test-admin' },
    });
    expect(outcome.decision).toMatchObject({ permission: 'governance.withdraw.emergency' });
  });

  it('refuses an emergency withdrawal before publication, without a reason, or with other content', () => {
    // Before publication: authorized (the submitted content proves the Marja), then refused.
    for (const stage of ['SUBMITTED', 'REVIEWED', 'APPROVED'] as const) {
      const at = through(stage);
      expect(
        refusal(
          run(ADMIN, at.ledger, {
            type: 'EMERGENCY_WITHDRAW',
            pack: at.pack,
            reason: 'OTHER',
            note: emergencyNote,
          }),
        ),
      ).toEqual(['INVALID_TRANSITION']);
    }
    // A withdrawn (terminal) version cannot be withdrawn again.
    const once = through('PUBLISHED');
    const withdrawn = applied(
      run(ADMIN, once.ledger, {
        type: 'EMERGENCY_WITHDRAW',
        pack: once.pack,
        reason: 'OTHER',
        note: emergencyNote,
      }),
    );
    expect(
      refusal(
        run(ADMIN, withdrawn.ledger, {
          type: 'EMERGENCY_WITHDRAW',
          pack: once.pack,
          reason: 'OTHER',
          note: emergencyNote,
        }),
      ),
    ).toContain('INVALID_TRANSITION');
    const published = through('PUBLISHED');
    for (const note of [undefined, '', '  ', 'ab', ' padded ', 'x'.repeat(501)]) {
      expect(
        denial(
          run(ADMIN, published.ledger, {
            type: 'EMERGENCY_WITHDRAW',
            pack: published.pack,
            reason: 'OTHER',
            note,
          }),
        ),
      ).toBe('INVALID_REQUEST');
    }
    expect(
      denial(
        run(ADMIN, published.ledger, {
          type: 'EMERGENCY_WITHDRAW',
          pack: testPack('1.0.0', 'TEST category (other)'),
          reason: 'OTHER',
          note: emergencyNote,
        }),
      ),
    ).toBe('INVALID_REQUEST');
  });

  it('only administrators hold the emergency permission', () => {
    const published = through('PUBLISHED');
    for (const who of [AUTHOR, REVIEWER, APPROVER, ACTIVATOR]) {
      expect(
        denial(
          run(who, published.ledger, {
            type: 'EMERGENCY_WITHDRAW',
            pack: published.pack,
            reason: 'OTHER',
            note: emergencyNote,
          }),
        ),
      ).toBe('MISSING_PERMISSION');
    }
  });
});
