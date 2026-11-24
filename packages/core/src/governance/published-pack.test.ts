import { describe, expect, it } from 'vitest';

import {
  checkProductionReadiness,
  computeRulePackIntegrity,
  sealRulePack,
} from '@khums/calculation-engine';
import type { GovernanceActorRef, RulePack, RulePackActivation } from '@khums/shared-types';

// Raw domain commands (internal to core since M4.6.1; the public entry point authorizes).
import {
  activate,
  approve,
  checkGovernedProductionReadiness,
  completeReview,
  preparePackForPublication,
  publish,
  startReview,
  submit,
} from './commands';
import { createLedger } from './ledger';

/**
 * Published-pack immutability (M4.4.3 final correction). TEST data only; the packs are not
 * rulings and are never exported.
 */

const actor = (subject: string): GovernanceActorRef => ({ kind: 'UNVERIFIED_REFERENCE', subject });
const AUTHOR = actor('test-author');
const REVIEWER = actor('test-reviewer');
const APPROVER = actor('test-approver');
const OPERATOR = actor('test-operator');
const evidence = { reference: 'docs/research/reviews/test/pack.REVIEW.md' };

let clock = 0;
const at = () => {
  clock += 1;
  return new Date(Date.UTC(2026, 10, 22, 9, 0, clock)).toISOString();
};

/** Version 2 pack with a fact mapping, so mappings are covered too. */
function testPack(): RulePack {
  const clarify = { handling: 'clarify' } as const;
  const sealed = sealRulePack({
    metadata: {
      packId: 'test-published-pack',
      marjaId: 'test-marja',
      version: '1.0.0',
      schemaVersion: 2,
      title: 'TEST PACK — published immutability fixture (not a ruling)',
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
    inputCategories: [{ id: 'test-category', label: 'TEST', ruleIds: ['test-rule'] }],
    questions: [],
    parameters: [],
    consultations: [{ id: 'test-consultation', label: 'TEST', ruleIds: ['test-rule'] }],
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
    factMapping: {
      mappingVersion: 1,
      factSheetSchemaVersions: [1],
      ruleIds: ['test-rule'],
      unmatched: { handling: 'consult', consultationId: 'test-consultation' },
      rules: [
        {
          id: 'test-map',
          ruleIds: ['test-rule'],
          match: { workflows: ['first-time'], kinds: ['BALANCE'], subtypes: ['CASH'] },
          then: {
            action: 'category',
            categoryId: 'test-category',
            amount: { estimated: clarify, range: clarify, unknown: clarify, notProvided: clarify },
            date: { field: null, approximate: clarify, unknown: clarify, notProvided: clarify },
          },
        },
      ],
    },
  });
  if (!sealed.ok) throw new Error('seal failed');
  return sealed.value;
}

function must<T>(
  result: { ok: true; value: T } | { ok: false; error: readonly { code: string }[] },
): T {
  if (!result.ok) throw new Error(`expected ok: ${result.error.map((i) => i.code).join(', ')}`);
  return result.value;
}
const codesOf = (result: { ok: boolean; error?: readonly { code: string }[] }) =>
  result.ok ? [] : (result.error ?? []).map((i) => i.code);
const digestOf = (pack: unknown) => {
  const computed = computeRulePackIntegrity(pack);
  return computed.ok ? computed.value.digest : null;
};

/** Visits every object and array reachable from a value. */
function everyObject(
  value: unknown,
  test: (o: object) => boolean,
  seen = new Set<unknown>(),
): boolean {
  if (typeof value !== 'object' || value === null || seen.has(value)) return true;
  seen.add(value);
  return test(value) && Object.values(value).every((v) => everyObject(v, test, seen));
}
const isDeepFrozen = (v: unknown) => everyObject(v, Object.isFrozen);
const nothingFrozen = (v: unknown) => everyObject(v, (o) => !Object.isFrozen(o));

/** Runs the lifecycle up to an approved pack that the CALLER owns (mutable, unfrozen). */
function callerApproved() {
  const pack = testPack();
  let ledger = createLedger(pack.metadata.packId, pack.metadata.version);
  ledger = must(
    submit({ policyForNewVersion: 'INDEPENDENT_REVIEW_V1', ledger, actor: AUTHOR, at: at(), pack }),
  ).ledger;
  ledger = must(startReview({ ledger, actor: REVIEWER, at: at(), pack })).ledger;
  ledger = must(completeReview({ ledger, actor: REVIEWER, at: at(), pack, evidence })).ledger;
  ledger = must(approve({ ledger, actor: APPROVER, at: at(), pack, evidence })).ledger;
  // A fully mutable, caller-owned copy (approvals are frozen by preparePackForPublication).
  const original = JSON.parse(
    JSON.stringify(must(preparePackForPublication(pack, ledger))),
  ) as RulePack;
  return { original, ledger, approvedDigest: pack.metadata.integrity?.digest };
}

type Mutable = Record<string, unknown> & {
  metadata: Record<string, unknown> & { approvals: Record<string, unknown>[] };
  sources: Record<string, unknown>[];
  rules: { sourceRefs: string[] }[];
  inputCategories: Record<string, unknown>[];
  workflows: { firstTime: { steps: { expression: { categoryIds: string[] } }[] } };
  factMapping: { rules: { then: Record<string, unknown> }[] };
};

describe('published snapshot is detached and deeply frozen', () => {
  it('keeps the approved digest and changes only the status', () => {
    const { original, ledger, approvedDigest } = callerApproved();
    const result = must(publish({ ledger, actor: OPERATOR, at: at(), pack: original }));
    expect(result.pack.metadata.status).toBe('PUBLISHED');
    expect(digestOf(result.pack)).toBe(approvedDigest);
    expect(result.pack.metadata.integrity?.digest).toBe(approvedDigest);
    expect(result.record).toMatchObject({
      type: 'PUBLISHED',
      integrity: { digest: approvedDigest },
    });
  });

  it('freezes everything in the published pack: metadata, sources, rules, workflows, mapping, arrays', () => {
    const { original, ledger } = callerApproved();
    const published = must(publish({ ledger, actor: OPERATOR, at: at(), pack: original }))
      .pack as unknown as Mutable;
    expect(isDeepFrozen(published)).toBe(true);
    const attempts: (() => void)[] = [
      () => {
        published.metadata.status = 'DRAFT';
      },
      () => {
        published.metadata.approvals.pop();
      },
      () => {
        published.sources[0]!.title = 'changed';
      },
      () => {
        published.rules[0]!.sourceRefs.push('extra');
      },
      () => {
        published.inputCategories[0]!.label = 'changed';
      },
      () => {
        published.workflows.firstTime.steps[0]!.expression.categoryIds.push('extra');
      },
      () => {
        published.factMapping.rules[0]!.then.action = 'exclude';
      },
      () => {
        (published.metadata.integrity as { digest: string }).digest = '0'.repeat(64);
      },
    ];
    for (const attempt of attempts) expect(attempt).toThrow(TypeError);
  });

  it('neither retains nor freezes any caller-owned object', () => {
    const { original, ledger } = callerApproved();
    const result = must(publish({ ledger, actor: OPERATOR, at: at(), pack: original }));
    expect(nothingFrozen(original)).toBe(true);
    const published = result.pack as unknown as Mutable;
    const caller = original as unknown as Mutable;
    expect(published).not.toBe(caller);
    expect(published.metadata).not.toBe(caller.metadata);
    expect(published.rules).not.toBe(caller.rules);
    expect(published.factMapping).not.toBe(caller.factMapping);
    expect(published.workflows.firstTime.steps[0]).not.toBe(caller.workflows.firstTime.steps[0]);
  });

  it('mutating the original pack after publication cannot change the published snapshot', () => {
    const { original, ledger, approvedDigest } = callerApproved();
    const published = must(publish({ ledger, actor: OPERATOR, at: at(), pack: original })).pack;
    const before = JSON.stringify(published);
    const caller = original as unknown as Mutable;
    caller.inputCategories[0]!.label = 'changed';
    caller.rules[0]!.sourceRefs.push('other-source');
    caller.factMapping.rules[0]!.then.action = 'exclude';
    caller.metadata.status = 'DRAFT';
    expect(JSON.stringify(published)).toBe(before);
    expect(digestOf(published)).toBe(approvedDigest);
  });
});

describe('later decisions use the published snapshot or validated copies', () => {
  const request = (activation: RulePackActivation) => ({
    workflow: 'first-time' as const,
    activation,
    dateRanges: [{ start: '2026-06-30', end: '2026-06-30' }],
    requireFactMapping: true,
  });

  it('mutating caller objects after publication cannot alter activation or readiness decisions', () => {
    const { original, ledger } = callerApproved();
    const p = must(publish({ ledger, actor: OPERATOR, at: at(), pack: original }));
    // The caller edits their own object; the published snapshot is unaffected.
    (original as unknown as Mutable).inputCategories[0]!.label = 'changed after publication';
    const activated = must(activate({ ledger: p.ledger, actor: OPERATOR, at: at(), pack: p.pack }));
    expect(checkProductionReadiness(p.pack, request(activated.activation))).toEqual([]);
    expect(
      checkGovernedProductionReadiness(p.pack, activated.ledger, request(activated.activation)),
    ).toEqual([]);
  });

  it('a pack mutated during a check cannot change the outcome: input is detached first', () => {
    const { original, ledger } = callerApproved();
    const p = must(publish({ ledger, actor: OPERATOR, at: at(), pack: original }));
    // A caller copy whose label getter changes after the first read.
    const shifting = JSON.parse(JSON.stringify(p.pack)) as RulePack;
    let reads = 0;
    Object.defineProperty(shifting.inputCategories[0]!, 'label', {
      enumerable: true,
      get() {
        reads += 1;
        return reads === 1 ? 'TEST' : 'changed';
      },
    });
    const activated = activate({ ledger: p.ledger, actor: OPERATOR, at: at(), pack: shifting });
    expect(activated.ok).toBe(true);
    expect(reads).toBe(1);
  });

  it('tamper detection still works for independently loaded or reconstructed packs', () => {
    const { original, ledger } = callerApproved();
    const p = must(publish({ ledger, actor: OPERATOR, at: at(), pack: original }));
    const activated = must(activate({ ledger: p.ledger, actor: OPERATOR, at: at(), pack: p.pack }));
    // Reconstructed from storage, with a nested change.
    const loaded = JSON.parse(JSON.stringify(p.pack)) as Mutable;
    loaded.factMapping.rules[0]!.then.categoryId = 'test-category';
    loaded.workflows.firstTime.steps[0]!.expression.categoryIds.push('test-category');
    const reconstructed = loaded as unknown as RulePack;
    expect(digestOf(reconstructed)).not.toBe(digestOf(p.pack));
    expect(
      codesOf(activate({ ledger: p.ledger, actor: OPERATOR, at: at(), pack: reconstructed })),
    ).toEqual(['STALE_CONTENT']);
    expect(
      checkGovernedProductionReadiness(
        reconstructed,
        activated.ledger,
        request(activated.activation),
      ).map((i) => i.code),
    ).toEqual(
      expect.arrayContaining(['READINESS_INTEGRITY_MISMATCH', 'CONTENT_CHANGED_AFTER_PUBLICATION']),
    );
    // An unchanged reconstruction is still accepted.
    const faithful = JSON.parse(JSON.stringify(p.pack)) as RulePack;
    expect(
      checkGovernedProductionReadiness(faithful, activated.ledger, request(activated.activation)),
    ).toEqual([]);
  });

  it('refuses a malformed pack instead of detaching it partially', () => {
    const { original, ledger } = callerApproved();
    const malformed = { ...original, extraField: true } as unknown as RulePack;
    expect(codesOf(publish({ ledger, actor: OPERATOR, at: at(), pack: malformed }))).toEqual([
      'PACK_MALFORMED',
    ]);
  });
});
