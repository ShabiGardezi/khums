import { describe, expect, it } from 'vitest';

import {
  checkProductionReadiness,
  computeRulePackIntegrity,
  sealRulePack,
} from '@khums/calculation-engine';
import type {
  GovernanceActorRef,
  GovernanceLedger,
  GovernanceRecord,
  RulePack,
  RulePackActivation,
} from '@khums/shared-types';

// Raw domain commands (internal to core since M4.6.1; the public entry point authorizes).
import {
  activate,
  approvalsFromLedger,
  approve,
  checkGovernedProductionReadiness,
  completeReview,
  preparePackForPublication,
  publish,
  requestChanges,
  startReview,
  submit,
  supersede,
  withdraw,
} from './commands';
import { createLedger, replayLedger } from './ledger';

/**
 * Adversarial governance tests (M4.4.3). TEST data only: the pack below is structurally valid and
 * `isMock: false` ONLY so the governance gates can be exercised; it is not a ruling and is never
 * exported. Identities are unverified references (FR-2).
 */

const actor = (subject: string): GovernanceActorRef => ({ kind: 'UNVERIFIED_REFERENCE', subject });
const AUTHOR = actor('test-author');
const REVIEWER = actor('test-reviewer');
const APPROVER = actor('test-approver');
const OPERATOR = actor('test-operator');
const evidence = { reference: 'docs/research/reviews/test/test-pack.REVIEW.md' };

let clock = 0;
const at = () => {
  clock += 1;
  return new Date(Date.UTC(2026, 10, 20, 9, 0, clock)).toISOString();
};

function testPack(version = '1.0.0', label = 'TEST category'): RulePack {
  const pack: RulePack = {
    metadata: {
      packId: 'test-governed-pack',
      marjaId: 'test-marja',
      version,
      schemaVersion: 1,
      title: 'TEST PACK — governance fixture (not a ruling)',
      status: 'DRAFT',
      isMock: false,
      effectiveFrom: '2000-01-01',
      effectiveTo: null,
      contentHash: null,
      researchBaseline: null,
      approvals: [],
      supersedes: null,
    },
    sources: [{ id: 'test-source', title: 'TEST source', url: null, locator: null }],
    rules: [
      {
        id: 'test-rule',
        status: 'APPROVED',
        summary: 'TEST',
        sourceRefs: ['test-source'],
        rulingRefs: [],
      },
    ],
    inputCategories: [{ id: 'test-category', label, ruleIds: ['test-rule'] }],
    questions: [],
    parameters: [],
    consultations: [],
    workflows: {
      annual: null,
      firstTime: {
        steps: [
          {
            id: 'test-sum',
            label: 'TEST sum',
            ruleIds: ['test-rule'],
            expression: { op: 'sumCategories', categoryIds: ['test-category'] },
            rounding: null,
          },
        ],
        outputs: [{ id: 'test-out', label: 'TEST', stepId: 'test-sum' }],
      },
      missedYear: null,
    },
  };
  const sealed = sealRulePack(pack);
  if (!sealed.ok) throw new Error('seal failed');
  return sealed.value;
}

/** Unwraps a command result, failing the test with the issue codes. */
function must<T>(
  result: { ok: true; value: T } | { ok: false; error: readonly { code: string }[] },
): T {
  if (!result.ok) throw new Error(`expected ok: ${result.error.map((i) => i.code).join(', ')}`);
  return result.value;
}
const codesOf = (result: { ok: boolean; error?: readonly { code: string }[] }) =>
  result.ok ? [] : (result.error ?? []).map((i) => i.code);

function reviewed(pack = testPack()) {
  let ledger = createLedger(pack.metadata.packId, pack.metadata.version);
  ledger = must(
    submit({ policyForNewVersion: 'INDEPENDENT_REVIEW_V1', ledger, actor: AUTHOR, at: at(), pack }),
  ).ledger;
  ledger = must(startReview({ ledger, actor: REVIEWER, at: at(), pack })).ledger;
  ledger = must(completeReview({ ledger, actor: REVIEWER, at: at(), pack, evidence })).ledger;
  return { pack, ledger };
}
function approved(pack = testPack()) {
  const r = reviewed(pack);
  const ledger = must(
    approve({ ledger: r.ledger, actor: APPROVER, at: at(), pack, evidence }),
  ).ledger;
  return { pack: must(preparePackForPublication(pack, ledger)), ledger };
}
function published(pack = testPack()) {
  const a = approved(pack);
  const result = must(publish({ ledger: a.ledger, actor: OPERATOR, at: at(), pack: a.pack }));
  return { pack: result.pack, ledger: result.ledger };
}
function activated(pack = testPack()) {
  const p = published(pack);
  const result = must(activate({ ledger: p.ledger, actor: OPERATOR, at: at(), pack: p.pack }));
  return { ...p, ledger: result.ledger, activation: result.activation };
}
const request = (activation: RulePackActivation) => ({
  workflow: 'first-time' as const,
  activation,
  dateRanges: [{ start: '2026-06-30', end: '2026-06-30' }],
});
/** A mutable JSON copy, as an attacker would edit stored data. */
interface MutableLedger {
  packId: string;
  version: string;
  records: Record<string, unknown>[];
}
const tampered = (ledger: GovernanceLedger): MutableLedger =>
  JSON.parse(JSON.stringify(ledger)) as MutableLedger;
const asLedger = (copy: MutableLedger) => copy as unknown as GovernanceLedger;

describe('full lifecycle', () => {
  it('submit → review → approve → publish → activate passes every gate', () => {
    const { pack, ledger, activation } = activated();
    expect(replayLedger(ledger)).toMatchObject({ ok: true, value: { state: 'PUBLISHED' } });
    expect(ledger.records.map((r) => r.type)).toEqual([
      'SUBMITTED',
      'REVIEW_STARTED',
      'REVIEW_COMPLETED',
      'APPROVED',
      'PUBLISHED',
      'ACTIVATED',
    ]);
    expect(activation).toMatchObject({
      packId: 'test-governed-pack',
      version: '1.0.0',
      integrity: pack.metadata.integrity,
      publicationReference: `test-governed-pack@1.0.0#4/${ledger.records[4]!.recordDigest}`,
      approvalReferences: [
        `test-governed-pack@1.0.0#2/${ledger.records[2]!.recordDigest}`,
        `test-governed-pack@1.0.0#3/${ledger.records[3]!.recordDigest}`,
      ],
    });
    expect(checkProductionReadiness(pack, request(activation))).toEqual([]);
    expect(checkGovernedProductionReadiness(pack, ledger, request(activation))).toEqual([]);
  });

  it('publication changes only the status, never the content digest', () => {
    const a = approved();
    const p = must(publish({ ledger: a.ledger, actor: OPERATOR, at: at(), pack: a.pack }));
    expect(p.pack.metadata.status).toBe('PUBLISHED');
    expect(p.record).toMatchObject({ type: 'PUBLISHED', integrity: a.pack.metadata.integrity });
    // Deep equality (key order is irrelevant) apart from status, and the same recomputed digest.
    expect({ ...p.pack, metadata: { ...p.pack.metadata, status: null } }).toEqual({
      ...a.pack,
      metadata: { ...a.pack.metadata, status: null },
    });
    const digestOf = (pack: RulePack) => {
      const computed = computeRulePackIntegrity(pack);
      return computed.ok ? computed.value.digest : null;
    };
    expect(digestOf(p.pack)).toBe(digestOf(a.pack));
    expect(digestOf(p.pack)).toBe(a.pack.metadata.integrity?.digest);
  });

  it('never activates automatically on publication', () => {
    const { ledger } = published();
    expect(ledger.records.some((r) => r.type === 'ACTIVATED')).toBe(false);
  });
});

describe('reviewer and approver separation', () => {
  it('refuses a reviewer approving their own review', () => {
    const { pack, ledger } = reviewed();
    expect(codesOf(approve({ ledger, actor: REVIEWER, at: at(), pack, evidence }))).toEqual([
      'SELF_APPROVAL',
    ]);
  });

  it('refuses the author reviewing or approving their own submission', () => {
    const pack = testPack();
    let ledger = createLedger(pack.metadata.packId, pack.metadata.version);
    ledger = must(
      submit({
        policyForNewVersion: 'INDEPENDENT_REVIEW_V1',
        ledger,
        actor: AUTHOR,
        at: at(),
        pack,
      }),
    ).ledger;
    expect(codesOf(startReview({ ledger, actor: AUTHOR, at: at(), pack }))).toEqual([
      'SELF_REVIEW',
    ]);
    const r = reviewed();
    expect(
      codesOf(approve({ ledger: r.ledger, actor: AUTHOR, at: at(), pack: r.pack, evidence })),
    ).toEqual(['SELF_APPROVAL']);
  });

  it('only the reviewer who started the review can complete it or request changes', () => {
    const pack = testPack();
    let ledger = createLedger(pack.metadata.packId, pack.metadata.version);
    ledger = must(
      submit({
        policyForNewVersion: 'INDEPENDENT_REVIEW_V1',
        ledger,
        actor: AUTHOR,
        at: at(),
        pack,
      }),
    ).ledger;
    ledger = must(startReview({ ledger, actor: REVIEWER, at: at(), pack })).ledger;
    expect(codesOf(completeReview({ ledger, actor: APPROVER, at: at(), pack, evidence }))).toEqual([
      'NOT_THE_REVIEWER',
    ]);
    expect(codesOf(requestChanges({ ledger, actor: APPROVER, at: at(), pack, evidence }))).toEqual([
      'NOT_THE_REVIEWER',
    ]);
  });

  it('identities are explicitly unverified references; malformed ones are refused', () => {
    const pack = testPack();
    const ledger = createLedger(pack.metadata.packId, pack.metadata.version);
    expect(
      codesOf(
        submit({
          policyForNewVersion: 'INDEPENDENT_REVIEW_V1',
          ledger,
          actor: actor('bad subject!'),
          at: at(),
          pack,
        }),
      ),
    ).toEqual(['INVALID_ACTOR']);
    expect(
      codesOf(
        submit({
          policyForNewVersion: 'INDEPENDENT_REVIEW_V1',
          ledger,
          actor: { kind: 'VERIFIED', subject: 'x' } as unknown as GovernanceActorRef,
          at: at(),
          pack,
        }),
      ),
    ).toEqual(['INVALID_ACTOR']);
  });
});

describe('integrity-bound approvals', () => {
  it('refuses approval of content that changed after review (stale digest)', () => {
    const { ledger } = reviewed();
    const changed = testPack('1.0.0', 'TEST category (edited)');
    expect(
      codesOf(approve({ ledger, actor: APPROVER, at: at(), pack: changed, evidence })),
    ).toEqual(['STALE_CONTENT']);
  });

  it('refuses a pack of a different version or identity', () => {
    const { ledger } = reviewed();
    expect(
      codesOf(approve({ ledger, actor: APPROVER, at: at(), pack: testPack('1.0.1'), evidence })),
    ).toEqual(['VERSION_MISMATCH']);
    const other = { ...testPack(), metadata: { ...testPack().metadata, packId: 'other-pack' } };
    expect(codesOf(approve({ ledger, actor: APPROVER, at: at(), pack: other, evidence }))).toEqual([
      'PACK_MISMATCH',
    ]);
  });

  it('refuses unsealed or MOCK content at submission', () => {
    const pack = testPack();
    const ledger = createLedger(pack.metadata.packId, pack.metadata.version);
    const { integrity: _omit, ...unsealedMeta } = pack.metadata;
    expect(
      codesOf(
        submit({
          policyForNewVersion: 'INDEPENDENT_REVIEW_V1',
          ledger,
          actor: AUTHOR,
          at: at(),
          pack: { ...pack, metadata: unsealedMeta },
        }),
      ),
    ).toEqual(expect.arrayContaining(['NOT_ELIGIBLE', 'READINESS_MISSING_CONTENT_HASH']));
    const sealedMock = sealRulePack({ ...pack, metadata: { ...pack.metadata, isMock: true } });
    if (!sealedMock.ok) throw new Error('seal failed');
    const mock = sealedMock.value;
    expect(
      codesOf(
        submit({
          policyForNewVersion: 'INDEPENDENT_REVIEW_V1',
          ledger,
          actor: AUTHOR,
          at: at(),
          pack: mock,
        }),
      ),
    ).toEqual(expect.arrayContaining(['NOT_ELIGIBLE', 'READINESS_MOCK_RULE_PACK']));
  });
});

describe('publication safeguards', () => {
  it('refuses publication without approval', () => {
    const { pack, ledger } = reviewed();
    const ready = { ...pack, metadata: { ...pack.metadata, status: 'APPROVED' as const } };
    expect(codesOf(publish({ ledger, actor: OPERATOR, at: at(), pack: ready }))).toEqual([
      'INVALID_TRANSITION',
    ]);
  });

  it('refuses publication of a MOCK or modified pack (digest differs from the approved one)', () => {
    const a = approved();
    const mock = { ...a.pack, metadata: { ...a.pack.metadata, isMock: true } };
    expect(codesOf(publish({ ledger: a.ledger, actor: OPERATOR, at: at(), pack: mock }))).toEqual([
      'STALE_CONTENT',
    ]);
    const modified = {
      ...a.pack,
      inputCategories: [{ ...a.pack.inputCategories[0]!, label: 'changed' }],
    };
    expect(
      codesOf(publish({ ledger: a.ledger, actor: OPERATOR, at: at(), pack: modified })),
    ).toEqual(['STALE_CONTENT']);
  });

  it('refuses foreign, replayed or missing approvals on the pack', () => {
    const a = approved();
    const noApprovals = { ...a.pack, metadata: { ...a.pack.metadata, approvals: [] } };
    expect(
      codesOf(publish({ ledger: a.ledger, actor: OPERATOR, at: at(), pack: noApprovals })),
    ).toEqual(['APPROVALS_INCONSISTENT']);
    const other = approved();
    const foreign = {
      ...a.pack,
      metadata: { ...a.pack.metadata, approvals: other.pack.metadata.approvals },
    };
    expect(
      codesOf(publish({ ledger: a.ledger, actor: OPERATOR, at: at(), pack: foreign })),
    ).toEqual(['APPROVALS_INCONSISTENT']);
    const draftStatus = { ...a.pack, metadata: { ...a.pack.metadata, status: 'DRAFT' as const } };
    expect(
      codesOf(publish({ ledger: a.ledger, actor: OPERATOR, at: at(), pack: draftStatus })),
    ).toEqual(['STATUS_INCONSISTENT']);
  });

  it('still requires every engine publication gate (e.g. approved, sourced rules)', () => {
    const base = testPack();
    const unsourced = sealRulePack({ ...base, rules: [{ ...base.rules[0]!, sourceRefs: [] }] });
    if (!unsourced.ok) throw new Error('seal');
    const a = approved(unsourced.value);
    expect(codesOf(publish({ ledger: a.ledger, actor: OPERATOR, at: at(), pack: a.pack }))).toEqual(
      expect.arrayContaining(['NOT_ELIGIBLE', 'READINESS_RULE_WITHOUT_SOURCE']),
    );
  });
});

describe('immutability after approval and publication', () => {
  it('a change after publication fails governed readiness and activation', () => {
    const { pack, ledger, activation } = activated();
    const modified = {
      ...pack,
      inputCategories: [{ ...pack.inputCategories[0]!, label: 'changed' }],
    };
    const issues = checkGovernedProductionReadiness(modified, ledger, request(activation)).map(
      (i) => i.code,
    );
    expect(issues).toEqual(
      expect.arrayContaining([
        'READINESS_INTEGRITY_MISMATCH',
        'READINESS_APPROVAL_STALE',
        'READINESS_ACTIVATION_STALE',
        'CONTENT_CHANGED_AFTER_PUBLICATION',
      ]),
    );
    const p = published();
    const changed = {
      ...p.pack,
      inputCategories: [{ ...p.pack.inputCategories[0]!, label: 'changed' }],
    };
    expect(
      codesOf(activate({ ledger: p.ledger, actor: OPERATOR, at: at(), pack: changed })),
    ).toEqual(['STALE_CONTENT']);
  });

  it('a new version needs its own full review; the old approval cannot be reused', () => {
    const v1 = activated();
    const v2pack = testPack('1.1.0');
    const v2 = createLedger(v2pack.metadata.packId, v2pack.metadata.version);
    // Reusing v1's approvals on v2 is refused at publication time (no cycle in v2's ledger).
    const reused = {
      ...v2pack,
      metadata: {
        ...v2pack.metadata,
        status: 'APPROVED' as const,
        approvals: v1.pack.metadata.approvals,
      },
    };
    expect(codesOf(publish({ ledger: v2, actor: OPERATOR, at: at(), pack: reused }))).toEqual([
      'INVALID_TRANSITION',
    ]);
    // An old activation never authorizes the new version.
    expect(checkProductionReadiness(reused, request(v1.activation)).map((i) => i.code)).toEqual(
      expect.arrayContaining(['READINESS_ACTIVATION_MISMATCH', 'READINESS_APPROVAL_STALE']),
    );
  });
});

describe('append-only history', () => {
  it('records and ledgers are frozen: updates and deletions throw', () => {
    const { ledger } = published();
    const record = ledger.records[0] as GovernanceRecord & { recordedAt: string };
    expect(Object.isFrozen(ledger)).toBe(true);
    expect(Object.isFrozen(ledger.records)).toBe(true);
    expect(Object.isFrozen(record)).toBe(true);
    expect(() => {
      (record as { recordedAt: string }).recordedAt = '2000-01-01T00:00:00.000Z';
    }).toThrow(TypeError);
    expect(() => {
      (ledger.records as GovernanceRecord[]).pop();
    }).toThrow(TypeError);
    expect(() => {
      (ledger.records as GovernanceRecord[]).splice(0, 1);
    }).toThrow(TypeError);
    expect(() => {
      (record as unknown as { integrity: { digest: string } }).integrity.digest = '0'.repeat(64);
    }).toThrow(TypeError);
  });

  it('appending returns a new ledger and leaves the original unchanged', () => {
    const r = reviewed();
    const before = r.ledger.records.length;
    const next = must(
      approve({ ledger: r.ledger, actor: APPROVER, at: at(), pack: r.pack, evidence }),
    );
    expect(r.ledger.records).toHaveLength(before);
    expect(next.ledger.records).toHaveLength(before + 1);
  });

  it('detects modified, deleted, inserted and reordered records on replay', () => {
    const { ledger } = published();
    const modified = tampered(ledger);
    modified.records[1]!.recordedAt = '2026-11-20T09:00:00.500Z';
    expect(replayLedger(modified)).toMatchObject({ ok: false, error: { code: 'LEDGER_TAMPERED' } });
    const deleted = tampered(ledger);
    deleted.records.splice(1, 1);
    expect(replayLedger(deleted).ok).toBe(false);
    const reordered = tampered(ledger);
    [reordered.records[1], reordered.records[2]] = [reordered.records[2]!, reordered.records[1]!];
    expect(replayLedger(reordered).ok).toBe(false);
    const inserted = tampered(ledger);
    inserted.records.splice(2, 0, { ...inserted.records[2]! });
    expect(replayLedger(inserted).ok).toBe(false);
    const swappedDigest = tampered(ledger);
    (swappedDigest.records[3]!.integrity as { digest: string }).digest = 'f'.repeat(64);
    expect(replayLedger(swappedDigest)).toMatchObject({
      ok: false,
      error: { code: 'LEDGER_TAMPERED' },
    });
  });

  it('refuses commands on a tampered ledger and records from another ledger', () => {
    const p = published();
    const broken = tampered(p.ledger);
    broken.records[0]!.actor = actor('someone-else');
    expect(
      codesOf(activate({ ledger: asLedger(broken), actor: OPERATOR, at: at(), pack: p.pack })),
    ).toEqual(['LEDGER_TAMPERED']);
    const other = published(testPack('2.0.0'));
    const spliced = tampered(p.ledger);
    spliced.records[3] = tampered(other.ledger).records[3]!;
    expect(replayLedger(spliced)).toMatchObject({ ok: false, error: { code: 'VERSION_MISMATCH' } });
  });

  it('refuses timestamps that go backwards or are malformed', () => {
    const pack = testPack();
    let ledger = createLedger(pack.metadata.packId, pack.metadata.version);
    ledger = must(
      submit({
        policyForNewVersion: 'INDEPENDENT_REVIEW_V1',
        ledger,
        actor: AUTHOR,
        at: '2026-11-20T10:00:00.000Z',
        pack,
      }),
    ).ledger;
    expect(
      codesOf(startReview({ ledger, actor: REVIEWER, at: '2026-11-20T09:59:59.999Z', pack })),
    ).toEqual(['INVALID_TIMESTAMP']);
    expect(
      codesOf(startReview({ ledger, actor: REVIEWER, at: '2026-11-20T10:00:00Z', pack })),
    ).toEqual(['INVALID_TIMESTAMP']);
  });
});

describe('lifecycle transitions', () => {
  it('rejects duplicate transitions', () => {
    const r = reviewed();
    expect(
      codesOf(
        completeReview({ ledger: r.ledger, actor: REVIEWER, at: at(), pack: r.pack, evidence }),
      ),
    ).toEqual(['DUPLICATE_TRANSITION']);
    const a = approved();
    expect(
      codesOf(approve({ ledger: a.ledger, actor: APPROVER, at: at(), pack: testPack(), evidence })),
    ).toEqual(['DUPLICATE_TRANSITION']);
    const p = published();
    expect(
      codesOf(
        publish({
          ledger: p.ledger,
          actor: OPERATOR,
          at: at(),
          pack: { ...p.pack, metadata: { ...p.pack.metadata, status: 'APPROVED' } },
        }),
      ),
    ).toEqual(['INVALID_TRANSITION']);
    const act = activated();
    expect(
      codesOf(activate({ ledger: act.ledger, actor: OPERATOR, at: at(), pack: act.pack })),
    ).toEqual(['ALREADY_ACTIVATED']);
  });

  it('rejects invalid transitions', () => {
    const pack = testPack();
    const empty = createLedger(pack.metadata.packId, pack.metadata.version);
    expect(codesOf(startReview({ ledger: empty, actor: REVIEWER, at: at(), pack }))).toEqual([
      'INVALID_TRANSITION',
    ]);
    expect(
      codesOf(withdraw({ ledger: empty, actor: OPERATOR, at: at(), reason: 'OTHER' })),
    ).toEqual(['INVALID_TRANSITION']);
    const submitted = must(
      submit({
        policyForNewVersion: 'INDEPENDENT_REVIEW_V1',
        ledger: empty,
        actor: AUTHOR,
        at: at(),
        pack,
      }),
    ).ledger;
    expect(
      codesOf(approve({ ledger: submitted, actor: APPROVER, at: at(), pack, evidence })),
    ).toEqual(['INVALID_TRANSITION']);
    expect(
      codesOf(
        submit({
          policyForNewVersion: 'INDEPENDENT_REVIEW_V1',
          ledger: submitted,
          actor: AUTHOR,
          at: at(),
          pack,
        }),
      ),
    ).toEqual(['DUPLICATE_TRANSITION']);
  });

  it('changes requested: resubmission must change the content and restarts review', () => {
    const pack = testPack();
    let ledger = createLedger(pack.metadata.packId, pack.metadata.version);
    ledger = must(
      submit({
        policyForNewVersion: 'INDEPENDENT_REVIEW_V1',
        ledger,
        actor: AUTHOR,
        at: at(),
        pack,
      }),
    ).ledger;
    ledger = must(startReview({ ledger, actor: REVIEWER, at: at(), pack })).ledger;
    ledger = must(requestChanges({ ledger, actor: REVIEWER, at: at(), pack, evidence })).ledger;
    expect(
      codesOf(
        submit({
          policyForNewVersion: 'INDEPENDENT_REVIEW_V1',
          ledger,
          actor: AUTHOR,
          at: at(),
          pack,
        }),
      ),
    ).toEqual(['RESUBMISSION_UNCHANGED']);
    const revised = testPack('1.0.0', 'TEST category (revised)');
    ledger = must(
      submit({
        policyForNewVersion: 'INDEPENDENT_REVIEW_V1',
        ledger,
        actor: AUTHOR,
        at: at(),
        pack: revised,
      }),
    ).ledger;
    // The earlier cycle's review does not carry over: approval needs a new completed review.
    expect(
      codesOf(approve({ ledger, actor: APPROVER, at: at(), pack: revised, evidence })),
    ).toEqual(['INVALID_TRANSITION']);
    ledger = must(startReview({ ledger, actor: REVIEWER, at: at(), pack: revised })).ledger;
    ledger = must(
      completeReview({ ledger, actor: REVIEWER, at: at(), pack: revised, evidence }),
    ).ledger;
    ledger = must(approve({ ledger, actor: APPROVER, at: at(), pack: revised, evidence })).ledger;
    expect(
      must(approvalsFromLedger(ledger)).every(
        (a) => a.integrity?.digest === revised.metadata.integrity?.digest,
      ),
    ).toBe(true);
  });

  it('withdrawal and supersession are terminal; governed readiness then refuses', () => {
    const v1 = activated();
    const withdrawn = must(
      withdraw({ ledger: v1.ledger, actor: OPERATOR, at: at(), reason: 'ERROR_FOUND' }),
    ).ledger;
    expect(replayLedger(withdrawn)).toMatchObject({ ok: true, value: { state: 'WITHDRAWN' } });
    expect(
      codesOf(withdraw({ ledger: withdrawn, actor: OPERATOR, at: at(), reason: 'OTHER' })),
    ).toEqual(['LEDGER_TERMINAL']);
    expect(
      checkGovernedProductionReadiness(v1.pack, withdrawn, request(v1.activation)).map(
        (i) => i.code,
      ),
    ).toContain('LEDGER_TERMINAL');

    const old = activated();
    const successor = published(testPack('1.1.0'));
    const superseded = must(
      supersede({ ledger: old.ledger, actor: OPERATOR, at: at(), successor: successor.ledger }),
    ).ledger;
    expect(replayLedger(superseded)).toMatchObject({ ok: true, value: { state: 'SUPERSEDED' } });
    expect(
      checkGovernedProductionReadiness(old.pack, superseded, request(old.activation)).map(
        (i) => i.code,
      ),
    ).toContain('LEDGER_TERMINAL');
  });

  it('supersession needs a newer, published version of the same pack', () => {
    const v1 = published();
    const unpublished = approved(testPack('1.1.0'));
    expect(
      codesOf(
        supersede({ ledger: v1.ledger, actor: OPERATOR, at: at(), successor: unpublished.ledger }),
      ),
    ).toEqual(['SUCCESSOR_INVALID']);
    const older = published(testPack('0.9.0'));
    expect(
      codesOf(supersede({ ledger: v1.ledger, actor: OPERATOR, at: at(), successor: older.ledger })),
    ).toEqual(['SUCCESSOR_INVALID']);
    const unpublishedLedger = reviewed().ledger;
    expect(
      codesOf(
        supersede({
          ledger: unpublishedLedger,
          actor: OPERATOR,
          at: at(),
          successor: published(testPack('3.0.0')).ledger,
        }),
      ),
    ).toEqual(['INVALID_TRANSITION']);
  });
});

describe('activation relationship', () => {
  it('refuses an activation referencing an incorrect publication or approvals', () => {
    const { pack, ledger, activation } = activated();
    const wrongPublication = {
      ...activation,
      publicationReference: activation.approvalReferences[1]!,
    };
    expect(
      checkGovernedProductionReadiness(pack, ledger, request(wrongPublication)).map((i) => i.code),
    ).toContain('UNKNOWN_REFERENCE');
    const emptyPublication = { ...activation, publicationReference: ' ' };
    expect(checkProductionReadiness(pack, request(emptyPublication)).map((i) => i.code)).toContain(
      'READINESS_ACTIVATION_MISMATCH',
    );
    const otherApprovals = {
      ...activation,
      approvalReferences: [activation.approvalReferences[1]!],
    };
    expect(
      checkGovernedProductionReadiness(pack, ledger, request(otherApprovals)).map((i) => i.code),
    ).toContain('UNKNOWN_REFERENCE');
  });

  it('requires the ledger to contain the activation (no activation outside governance)', () => {
    const p = published();
    const forged: RulePackActivation = {
      packId: p.pack.metadata.packId,
      version: p.pack.metadata.version,
      integrity: p.pack.metadata.integrity!,
      activatedAt: '2026-11-20',
      activatedBy: 'test-operator',
      approvalReferences: p.pack.metadata.approvals.map((a) => a.reference),
      publicationReference: `${p.ledger.records[4]!.recordId}/${p.ledger.records[4]!.recordDigest}`,
    };
    expect(checkProductionReadiness(p.pack, request(forged))).toEqual([]); // engine alone cannot tell
    expect(
      checkGovernedProductionReadiness(p.pack, p.ledger, request(forged)).map((i) => i.code),
    ).toEqual(['UNKNOWN_REFERENCE']);
  });
});
