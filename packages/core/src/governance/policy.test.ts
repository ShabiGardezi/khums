import { describe, expect, it } from 'vitest';

import type { GovernanceActorRef, GovernanceLedger, GovernancePolicyId } from '@khums/shared-types';

import { NOW, PACK_ID, shift, testPack } from '../authorization/test-support';
import {
  approvalsFromLedger,
  approve,
  bindLegacyPolicy,
  completeReview,
  requestChanges,
  startReview,
  submit,
  withdraw,
} from './commands';
import { storedHistory } from './legacy-test-support';
import { append, createLedger, replayLedger } from './ledger';
import {
  BUILDER_GOVERNANCE_POLICIES,
  GOVERNANCE_POLICIES,
  isGovernancePolicyId,
  isRegistryAssignablePolicy,
  LEGACY_GOVERNANCE_POLICY,
} from './policy';

/** Versioned governance policies bound to the ledger (single-scholar governance, stage 1). */

const actor = (subject: string): GovernanceActorRef => ({ kind: 'UNVERIFIED_REFERENCE', subject });
const SCHOLAR = actor('test-scholar');
const OTHER = actor('test-other-scholar');
const evidence = { reference: 'docs/research/reviews/test/test-pack.REVIEW.md' };
let tick = 0;
const at = () => shift(NOW, ++tick * 1000);

function must<T>(result: { ok: true; value: T } | { ok: false; error: unknown }): T {
  if (!result.ok) throw new Error(`step failed: ${JSON.stringify(result.error)}`);
  return result.value;
}
const codes = (result: { ok: boolean; error?: unknown }) =>
  result.ok ? [] : (result.error as { code: string }[]).map((i) => i.code);

function submitted(policy: GovernancePolicyId, by = SCHOLAR, pack = testPack()) {
  return must(
    submit({
      ledger: createLedger(PACK_ID, '1.0.0'),
      actor: by,
      at: at(),
      pack,
      policyForNewVersion: policy,
    }),
  ).ledger;
}

describe('governance policy definitions', () => {
  it('defines exactly the three versioned policies, frozen', () => {
    expect(Object.keys(GOVERNANCE_POLICIES)).toEqual([
      'INDEPENDENT_REVIEW_V1',
      'SINGLE_SCHOLAR_V1',
      'SOURCE_VERIFIED_AUTO_V1',
    ]);
    expect(Object.isFrozen(GOVERNANCE_POLICIES)).toBe(true);
    expect(Object.isFrozen(GOVERNANCE_POLICIES.SINGLE_SCHOLAR_V1)).toBe(true);
    expect(GOVERNANCE_POLICIES.INDEPENDENT_REVIEW_V1).toEqual({
      id: 'INDEPENDENT_REVIEW_V1',
      relaxedForRoles: [],
      reviewerMustDifferFromAuthor: true,
      approverMustBeIndependent: true,
      historicalAuthorship: true,
      independentActivation: true,
    });
    expect(GOVERNANCE_POLICIES.SINGLE_SCHOLAR_V1).toEqual({
      id: 'SINGLE_SCHOLAR_V1',
      // Decision 64: SCHOLAR added beside the legacy GOVERNING_SCHOLAR (not hashed anywhere).
      relaxedForRoles: ['SCHOLAR', 'GOVERNING_SCHOLAR'],
      reviewerMustDifferFromAuthor: false,
      approverMustBeIndependent: false,
      historicalAuthorship: false,
      independentActivation: false,
    });
    // Decision 67: rule-builder packs only; relaxed for the Marja's scholars and SUPER_ADMIN.
    expect(GOVERNANCE_POLICIES.SOURCE_VERIFIED_AUTO_V1).toEqual({
      id: 'SOURCE_VERIFIED_AUTO_V1',
      relaxedForRoles: ['SCHOLAR', 'GOVERNING_SCHOLAR', 'SUPER_ADMIN'],
      reviewerMustDifferFromAuthor: false,
      approverMustBeIndependent: false,
      historicalAuthorship: false,
      independentActivation: false,
    });
    expect(BUILDER_GOVERNANCE_POLICIES).toEqual({
      sistani: 'SOURCE_VERIFIED_AUTO_V1',
      khamenei: 'SOURCE_VERIFIED_AUTO_V1',
    });
    expect(isRegistryAssignablePolicy('SOURCE_VERIFIED_AUTO_V1')).toBe(false);
    expect(isRegistryAssignablePolicy('SINGLE_SCHOLAR_V1')).toBe(true);
    expect(LEGACY_GOVERNANCE_POLICY).toBe('INDEPENDENT_REVIEW_V1');
    expect(isGovernancePolicyId('SINGLE_SCHOLAR_V1')).toBe(true);
    for (const bad of ['single_scholar_v1', 'SINGLE_SCHOLAR_V2', '', 'toString', 1, null]) {
      expect(isGovernancePolicyId(bad)).toBe(false);
    }
  });
});

describe('binding the policy to a pack version', () => {
  it('writes the server-chosen policy into the first SUBMITTED record', () => {
    const ledger = submitted('SINGLE_SCHOLAR_V1');
    expect(ledger.records[0]).toMatchObject({
      type: 'SUBMITTED',
      governancePolicy: 'SINGLE_SCHOLAR_V1',
    });
    expect(must(replayLedger(ledger)).policy).toBe('SINGLE_SCHOLAR_V1');
  });

  it('keeps the bound policy on resubmission, whatever the Marja is configured to now', () => {
    let ledger = submitted('INDEPENDENT_REVIEW_V1');
    const pack = testPack();
    ledger = must(startReview({ ledger, actor: OTHER, at: at(), pack })).ledger;
    ledger = must(requestChanges({ ledger, actor: OTHER, at: at(), pack, evidence })).ledger;
    // The Marja has since moved to the single-scholar policy: this version stays independent.
    ledger = must(
      submit({
        ledger,
        actor: SCHOLAR,
        at: at(),
        pack: testPack('1.0.0', 'TEST category (revised)'),
        policyForNewVersion: 'SINGLE_SCHOLAR_V1',
      }),
    ).ledger;
    expect(ledger.records.at(-1)).toMatchObject({ governancePolicy: 'INDEPENDENT_REVIEW_V1' });
    expect(must(replayLedger(ledger)).policy).toBe('INDEPENDENT_REVIEW_V1');
  });

  it('refuses an unknown policy id', () => {
    const result = submit({
      ledger: createLedger(PACK_ID, '1.0.0'),
      actor: SCHOLAR,
      at: at(),
      pack: testPack(),
      policyForNewVersion: 'ANYTHING_GOES' as GovernancePolicyId,
    });
    expect(codes(result)).toEqual(['POLICY_INVALID']);
  });

  it('detects a stored resubmission that switches policy (POLICY_MISMATCH)', () => {
    let ledger = submitted('INDEPENDENT_REVIEW_V1');
    const pack = testPack();
    ledger = must(startReview({ ledger, actor: OTHER, at: at(), pack })).ledger;
    ledger = must(requestChanges({ ledger, actor: OTHER, at: at(), pack, evidence })).ledger;
    const revised = testPack('1.0.0', 'TEST category (revised)');
    const integrity = revised.metadata.integrity;
    if (integrity === undefined) throw new Error('fixture not sealed');
    const switched = append(ledger, {
      type: 'SUBMITTED',
      recordedAt: at(),
      actor: SCHOLAR,
      integrity,
      governancePolicy: 'SINGLE_SCHOLAR_V1',
    });
    expect(switched).toEqual({ ok: false, error: { code: 'POLICY_MISMATCH', recordId: null } });
  });

  it('rejects a stored ledger naming an unknown policy', () => {
    const ledger = submitted('SINGLE_SCHOLAR_V1');
    const forged = {
      ...ledger,
      records: [{ ...ledger.records[0], governancePolicy: 'NO_REVIEW_V9' }],
    };
    expect(replayLedger(forged)).toEqual({
      ok: false,
      error: { code: 'LEDGER_MALFORMED', recordId: null },
    });
  });
});

describe('SINGLE_SCHOLAR_V1', () => {
  it('lets one governing scholar submit, review and approve their own content', () => {
    const pack = testPack();
    let ledger = submitted('SINGLE_SCHOLAR_V1');
    ledger = must(startReview({ ledger, actor: SCHOLAR, at: at(), pack })).ledger;
    ledger = must(completeReview({ ledger, actor: SCHOLAR, at: at(), pack, evidence })).ledger;
    ledger = must(approve({ ledger, actor: SCHOLAR, at: at(), pack, evidence })).ledger;
    const view = must(replayLedger(ledger));
    expect(view.state).toBe('APPROVED');
    expect(view.approval?.actor).toEqual(SCHOLAR);
    // Evidence is still required and bound to the exact content digest.
    expect(view.approval?.evidence).toEqual(evidence);
    expect(view.approval?.integrity).toEqual(pack.metadata.integrity);
  });

  it('still requires the reviewer who started a review to complete it', () => {
    const pack = testPack();
    let ledger = submitted('SINGLE_SCHOLAR_V1');
    ledger = must(startReview({ ledger, actor: SCHOLAR, at: at(), pack })).ledger;
    expect(codes(completeReview({ ledger, actor: OTHER, at: at(), pack, evidence }))).toEqual([
      'NOT_THE_REVIEWER',
    ]);
  });

  it('keeps every content rule: stale content is refused', () => {
    let ledger = submitted('SINGLE_SCHOLAR_V1');
    const changed = testPack('1.0.0', 'TEST category (changed)');
    expect(codes(startReview({ ledger, actor: SCHOLAR, at: at(), pack: changed }))).toEqual([
      'STALE_CONTENT',
    ]);
    ledger = must(startReview({ ledger, actor: SCHOLAR, at: at(), pack: testPack() })).ledger;
    expect(must(replayLedger(ledger)).state).toBe('UNDER_REVIEW');
  });
});

describe('INDEPENDENT_REVIEW_V1 (unchanged)', () => {
  it('refuses self-review and self-approval', () => {
    const pack = testPack();
    let ledger = submitted('INDEPENDENT_REVIEW_V1');
    expect(codes(startReview({ ledger, actor: SCHOLAR, at: at(), pack }))).toEqual(['SELF_REVIEW']);
    ledger = must(startReview({ ledger, actor: OTHER, at: at(), pack })).ledger;
    ledger = must(completeReview({ ledger, actor: OTHER, at: at(), pack, evidence })).ledger;
    expect(codes(approve({ ledger, actor: OTHER, at: at(), pack, evidence }))).toEqual([
      'SELF_APPROVAL',
    ]);
    expect(codes(approve({ ledger, actor: SCHOLAR, at: at(), pack, evidence }))).toEqual([
      'SELF_APPROVAL',
    ]);
  });
});

describe('historical (pre-policy) ledgers', () => {
  /** A ledger exactly as written before policies existed: SUBMITTED names no policy. */
  function legacyLedger(): GovernanceLedger {
    const pack = testPack();
    const integrity = pack.metadata.integrity;
    if (integrity === undefined) throw new Error('fixture not sealed');
    return must(
      append(createLedger(PACK_ID, '1.0.0'), {
        type: 'SUBMITTED',
        recordedAt: at(),
        actor: SCHOLAR,
        integrity,
      }),
    ).ledger;
  }

  it('replays unchanged and is read as INDEPENDENT_REVIEW_V1', () => {
    const ledger = legacyLedger();
    const before = JSON.stringify(ledger);
    expect(ledger.records[0]).not.toHaveProperty('governancePolicy');
    expect(must(replayLedger(ledger)).policy).toBe('INDEPENDENT_REVIEW_V1');
    expect(JSON.stringify(ledger)).toBe(before);
  });

  it('is marked LEGACY_UNRECORDED; its stored history (more records) still replays unchanged', () => {
    const pack = testPack();
    const integrity = pack.metadata.integrity;
    if (integrity === undefined) throw new Error('fixture not sealed');
    let ledger = legacyLedger();
    expect(must(replayLedger(ledger)).policySource).toBe('LEGACY_UNRECORDED');
    // History written before M5.2.1 (built as storage holds it, not through append).
    ledger = storedHistory(ledger, {
      type: 'REVIEW_STARTED',
      recordedAt: at(),
      actor: OTHER,
      integrity,
    });
    ledger = storedHistory(ledger, {
      type: 'CHANGES_REQUESTED',
      recordedAt: at(),
      actor: OTHER,
      integrity,
      evidence,
    });
    const view = must(replayLedger(ledger));
    expect(view).toMatchObject({ state: 'CHANGES_REQUESTED', policySource: 'LEGACY_UNRECORDED' });
  });

  it('fails closed: no new lifecycle record, no derived approvals (M5.2.1)', () => {
    const pack = testPack();
    const ledger = legacyLedger();
    // Even a reviewer who would satisfy the old independent rules is refused.
    expect(codes(startReview({ ledger, actor: OTHER, at: at(), pack }))).toEqual([
      'POLICY_UNBOUND',
    ]);
    expect(codes(startReview({ ledger, actor: SCHOLAR, at: at(), pack }))).toEqual([
      'POLICY_UNBOUND',
    ]);
    expect(codes(approvalsFromLedger(ledger))).toEqual(['POLICY_UNBOUND']);
    let changes = storedHistory(ledger, {
      type: 'REVIEW_STARTED',
      recordedAt: at(),
      actor: OTHER,
      integrity: pack.metadata.integrity ?? (undefined as never),
    });
    changes = storedHistory(changes, {
      type: 'CHANGES_REQUESTED',
      recordedAt: at(),
      actor: OTHER,
      integrity: pack.metadata.integrity ?? (undefined as never),
      evidence,
    });
    expect(
      codes(
        submit({
          ledger: changes,
          actor: SCHOLAR,
          at: at(),
          pack: testPack('1.0.0', 'TEST category (revised)'),
          policyForNewVersion: 'SINGLE_SCHOLAR_V1',
        }),
      ),
    ).toEqual(['POLICY_UNBOUND']);
  });

  it('still accepts a withdrawal (a safety stop is never blocked)', () => {
    const withdrawn = must(
      withdraw({ ledger: legacyLedger(), actor: OTHER, at: at(), reason: 'REVIEW_ABANDONED' }),
    );
    expect(withdrawn.record).toMatchObject({ type: 'WITHDRAWN' });
  });

  it('binds explicitly once, appending POLICY_BOUND; history is byte-identical', () => {
    const pack = testPack();
    const ledger = legacyLedger();
    const before = JSON.stringify(ledger.records);
    const bound = must(
      bindLegacyPolicy({ ledger, actor: OTHER, at: at(), policy: 'SINGLE_SCHOLAR_V1' }),
    );
    expect(bound.record).toMatchObject({
      type: 'POLICY_BOUND',
      governancePolicy: 'SINGLE_SCHOLAR_V1',
    });
    // Same records, same digests (the hash chain is untouched); the caller's ledger is unchanged.
    expect(bound.ledger.records.slice(0, -1)).toEqual(ledger.records);
    expect(bound.ledger.records.slice(0, -1).map((r) => r.recordDigest)).toEqual(
      ledger.records.map((r) => r.recordDigest),
    );
    expect(JSON.stringify(ledger.records)).toBe(before);
    expect(must(replayLedger(bound.ledger))).toMatchObject({
      state: 'SUBMITTED',
      policy: 'SINGLE_SCHOLAR_V1',
      policySource: 'BOUND',
    });
    // The lifecycle continues under the bound policy: single-scholar rules (self-review allowed).
    const reviewed = must(startReview({ ledger: bound.ledger, actor: SCHOLAR, at: at(), pack }));
    expect(reviewed.record.type).toBe('REVIEW_STARTED');
    // Once only.
    expect(
      codes(
        bindLegacyPolicy({
          ledger: bound.ledger,
          actor: OTHER,
          at: at(),
          policy: 'SINGLE_SCHOLAR_V1',
        }),
      ),
    ).toEqual(['POLICY_ALREADY_BOUND']);
  });

  it('binding to independent review keeps the strict rules', () => {
    const bound = must(
      bindLegacyPolicy({
        ledger: legacyLedger(),
        actor: OTHER,
        at: at(),
        policy: 'INDEPENDENT_REVIEW_V1',
      }),
    );
    expect(
      codes(startReview({ ledger: bound.ledger, actor: SCHOLAR, at: at(), pack: testPack() })),
    ).toEqual(['SELF_REVIEW']);
  });

  it('refuses binding a recorded, empty, terminal or unknown-policy ledger', () => {
    const recorded = submitted('SINGLE_SCHOLAR_V1');
    expect(
      codes(
        bindLegacyPolicy({ ledger: recorded, actor: OTHER, at: at(), policy: 'SINGLE_SCHOLAR_V1' }),
      ),
    ).toEqual(['POLICY_ALREADY_BOUND']);
    expect(
      codes(
        bindLegacyPolicy({
          ledger: createLedger(PACK_ID, '1.0.0'),
          actor: OTHER,
          at: at(),
          policy: 'SINGLE_SCHOLAR_V1',
        }),
      ),
    ).toEqual(['INVALID_TRANSITION']);
    const withdrawn = must(
      withdraw({ ledger: legacyLedger(), actor: OTHER, at: at(), reason: 'OTHER' }),
    ).ledger;
    expect(
      codes(
        bindLegacyPolicy({
          ledger: withdrawn,
          actor: OTHER,
          at: at(),
          policy: 'SINGLE_SCHOLAR_V1',
        }),
      ),
    ).toEqual(['LEDGER_TERMINAL']);
    expect(
      codes(
        bindLegacyPolicy({
          ledger: legacyLedger(),
          actor: OTHER,
          at: at(),
          policy: 'ANY' as GovernancePolicyId,
        }),
      ),
    ).toEqual(['POLICY_INVALID']);
  });

  it('a resubmission after binding records the bound policy', () => {
    const pack = testPack();
    let ledger = must(
      bindLegacyPolicy({
        ledger: legacyLedger(),
        actor: OTHER,
        at: at(),
        policy: 'SINGLE_SCHOLAR_V1',
      }),
    ).ledger;
    ledger = must(startReview({ ledger, actor: OTHER, at: at(), pack })).ledger;
    ledger = must(requestChanges({ ledger, actor: OTHER, at: at(), pack, evidence })).ledger;
    ledger = must(
      submit({
        ledger,
        actor: SCHOLAR,
        at: at(),
        pack: testPack('1.0.0', 'TEST category (revised)'),
        policyForNewVersion: 'INDEPENDENT_REVIEW_V1',
      }),
    ).ledger;
    expect(ledger.records[0]).not.toHaveProperty('governancePolicy');
    expect(ledger.records.at(-1)).toMatchObject({ governancePolicy: 'SINGLE_SCHOLAR_V1' });
    expect(must(replayLedger(ledger))).toMatchObject({ policySource: 'BOUND' });
  });
});
