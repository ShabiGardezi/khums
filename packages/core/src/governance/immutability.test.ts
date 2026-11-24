import { describe, expect, it } from 'vitest';

import { sealRulePack } from '@khums/calculation-engine';
import type { GovernanceActorRef, GovernanceLedger, RulePack } from '@khums/shared-types';

// Raw domain commands (internal to core since M4.6.1; the public entry point authorizes).
import {
  activate,
  approvalsFromLedger,
  approve,
  completeReview,
  preparePackForPublication,
  publish,
  startReview,
  submit,
} from './commands';
import { createLedger, replayLedger } from './ledger';

/**
 * Deep-immutability verification of the governance ledger (M4.4.3 security review). TEST data
 * only; the pack is not a ruling and is never exported.
 */

const actor = (subject: string): GovernanceActorRef => ({ kind: 'UNVERIFIED_REFERENCE', subject });
const AUTHOR = actor('test-author');
const REVIEWER = actor('test-reviewer');
const APPROVER = actor('test-approver');
const OPERATOR = actor('test-operator');

let clock = 0;
const at = () => {
  clock += 1;
  return new Date(Date.UTC(2026, 10, 21, 9, 0, clock)).toISOString();
};

function testPack(): RulePack {
  const sealed = sealRulePack({
    metadata: {
      packId: 'test-immutable-pack',
      marjaId: 'test-marja',
      version: '1.0.0',
      schemaVersion: 1,
      title: 'TEST PACK — immutability fixture (not a ruling)',
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

/** Every object/array reachable from `value` is frozen. */
function isDeepFrozen(value: unknown, seen = new Set<unknown>()): boolean {
  if (typeof value !== 'object' || value === null || seen.has(value)) return true;
  seen.add(value);
  return Object.isFrozen(value) && Object.values(value).every((v) => isDeepFrozen(v, seen));
}

function approvedLedger(pack = testPack()) {
  let ledger = createLedger(pack.metadata.packId, pack.metadata.version);
  ledger = must(
    submit({ policyForNewVersion: 'INDEPENDENT_REVIEW_V1', ledger, actor: AUTHOR, at: at(), pack }),
  ).ledger;
  ledger = must(startReview({ ledger, actor: REVIEWER, at: at(), pack })).ledger;
  ledger = must(
    completeReview({ ledger, actor: REVIEWER, at: at(), pack, evidence: { reference: 'r' } }),
  ).ledger;
  ledger = must(
    approve({ ledger, actor: APPROVER, at: at(), pack, evidence: { reference: 'a' } }),
  ).ledger;
  return { pack, ledger };
}

describe('1–2. deep immutability of records and ledgers', () => {
  it('freezes every nested object and array of every record and the ledger', () => {
    const { ledger } = approvedLedger();
    expect(isDeepFrozen(ledger)).toBe(true);
    const record = ledger.records[3] as unknown as {
      integrity: { digest: string };
      actor: { subject: string };
      evidence: { reference: string };
    };
    expect(() => {
      record.integrity.digest = '0'.repeat(64);
    }).toThrow(TypeError);
    expect(() => {
      record.actor.subject = 'test-author';
    }).toThrow(TypeError);
    expect(() => {
      record.evidence.reference = 'forged';
    }).toThrow(TypeError);
  });

  it('appending leaves the existing ledger bit-for-bit unchanged and shares only frozen records', () => {
    const { pack, ledger } = approvedLedger();
    const before = JSON.stringify(ledger);
    const next = must(
      publish({
        ledger,
        actor: OPERATOR,
        at: at(),
        pack: must(preparePackForPublication(pack, ledger)),
      }),
    ).ledger;
    expect(JSON.stringify(ledger)).toBe(before);
    expect(ledger.records).toHaveLength(4);
    expect(next.records).toHaveLength(5);
    expect(isDeepFrozen(next)).toBe(true);
  });
});

describe('3. no retained references to caller input', () => {
  it('does not freeze, keep or depend on the caller’s actor and evidence objects', () => {
    const pack = testPack();
    let ledger = createLedger(pack.metadata.packId, pack.metadata.version);
    const author = { kind: 'UNVERIFIED_REFERENCE' as const, subject: 'test-author' };
    ledger = must(
      submit({
        policyForNewVersion: 'INDEPENDENT_REVIEW_V1',
        ledger,
        actor: author,
        at: at(),
        pack,
      }),
    ).ledger;
    const reviewer = { kind: 'UNVERIFIED_REFERENCE' as const, subject: 'test-reviewer' };
    ledger = must(startReview({ ledger, actor: reviewer, at: at(), pack })).ledger;
    const evidence = { reference: 'original-evidence' };
    ledger = must(completeReview({ ledger, actor: reviewer, at: at(), pack, evidence })).ledger;
    // Caller objects are untouched (not frozen) and changing them afterwards changes nothing.
    expect(Object.isFrozen(author)).toBe(false);
    expect(Object.isFrozen(evidence)).toBe(false);
    author.subject = 'test-reviewer';
    reviewer.subject = 'someone-else';
    evidence.reference = 'tampered-evidence';
    expect(ledger.records[0]?.actor.subject).toBe('test-author');
    expect(ledger.records[1]?.actor.subject).toBe('test-reviewer');
    expect(
      (ledger.records[2] as unknown as { evidence: { reference: string } }).evidence.reference,
    ).toBe('original-evidence');
    expect(replayLedger(ledger).ok).toBe(true);
  });

  it('reads each input value once: a changing getter cannot split the digest from the checks', () => {
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
    // A hostile actor whose subject changes on every read.
    let reads = 0;
    const shifty = {
      kind: 'UNVERIFIED_REFERENCE' as const,
      get subject() {
        reads += 1;
        return reads === 1 ? 'test-reviewer' : 'test-author';
      },
    };
    const result = startReview({ ledger, actor: shifty, at: at(), pack });
    // Whatever was read, the stored record, its digest and the separation check agree.
    if (result.ok) {
      expect(replayLedger(result.value.ledger).ok).toBe(true);
      expect(result.value.record.actor.subject).toBe('test-reviewer');
    } else {
      expect(result.error.map((i) => i.code)).toContain('SELF_REVIEW');
    }
    expect(reads).toBe(1);
  });

  it('copies a ledger loaded from storage instead of freezing or keeping the caller’s objects', () => {
    const { pack, ledger } = approvedLedger();
    const stored = JSON.parse(JSON.stringify(ledger)) as { records: Record<string, unknown>[] };
    // A shallow-frozen record whose nested object is still mutable.
    stored.records[0] = Object.freeze({ ...stored.records[0] });
    const next = must(
      publish({
        ledger: stored as unknown as GovernanceLedger,
        actor: OPERATOR,
        at: at(),
        pack: must(preparePackForPublication(pack, ledger)),
      }),
    ).ledger;
    expect(isDeepFrozen(next)).toBe(true);
    // The caller's storage objects are not frozen and are not shared with the new ledger.
    const nested = stored.records[0].integrity as { digest: string };
    expect(Object.isFrozen(nested)).toBe(false);
    expect(next.records[0]).not.toBe(stored.records[0]);
    nested.digest = 'f'.repeat(64);
    expect(replayLedger(next).ok).toBe(true);
    expect(replayLedger(stored).ok).toBe(false); // the edited copy is detected as tampered
  });
});

describe('4–5. returned views and derived values are immutable', () => {
  it('replay views are deeply frozen', () => {
    const { ledger } = approvedLedger();
    const view = replayLedger(ledger);
    if (!view.ok) throw new Error('replay');
    expect(isDeepFrozen(view.value)).toBe(true);
    expect(() => {
      (view.value as { state: string }).state = 'PUBLISHED';
    }).toThrow(TypeError);
    expect(() => {
      (view.value.approval as unknown as { integrity: { digest: string } }).integrity.digest =
        '0'.repeat(64);
    }).toThrow(TypeError);
  });

  it('a view of stored data cannot be changed through the stored objects, and vice versa', () => {
    const { ledger } = approvedLedger();
    const stored = JSON.parse(JSON.stringify(ledger)) as {
      records: Record<string, { digest: string }>[];
    };
    const view = replayLedger(stored);
    if (!view.ok) throw new Error('replay');
    const digestBefore = view.value.approval?.integrity.digest;
    stored.records[3]!.integrity!.digest = '0'.repeat(64); // mutate after replay
    expect(view.value.approval?.integrity.digest).toBe(digestBefore);
    expect(replayLedger(stored)).toMatchObject({ ok: false, error: { code: 'LEDGER_TAMPERED' } });
  });

  it('derived approvals and activation records are frozen and do not alias ledger records', () => {
    const { pack, ledger } = approvedLedger();
    const approvals = must(approvalsFromLedger(ledger));
    expect(isDeepFrozen(approvals)).toBe(true);
    expect(approvals[0]?.integrity).not.toBe(
      (ledger.records[2] as unknown as { integrity: object }).integrity,
    );
    const published = must(
      publish({
        ledger,
        actor: OPERATOR,
        at: at(),
        pack: must(preparePackForPublication(pack, ledger)),
      }),
    );
    const activated = must(
      activate({ ledger: published.ledger, actor: OPERATOR, at: at(), pack: published.pack }),
    );
    expect(isDeepFrozen(activated.activation)).toBe(true);
  });
});

describe('6–7. mutation attempts cannot change later decisions; chain stays valid', () => {
  it('failed mutation attempts leave replay, publication and activation decisions unchanged', () => {
    const { pack, ledger } = approvedLedger();
    const record = ledger.records[3] as unknown as { integrity: { digest: string } };
    try {
      record.integrity.digest = '0'.repeat(64);
    } catch {
      // expected: frozen
    }
    const view = replayLedger(ledger);
    expect(view).toMatchObject({ ok: true, value: { state: 'APPROVED' } });
    const published = must(
      publish({
        ledger,
        actor: OPERATOR,
        at: at(),
        pack: must(preparePackForPublication(pack, ledger)),
      }),
    );
    const activated = must(
      activate({ ledger: published.ledger, actor: OPERATOR, at: at(), pack: published.pack }),
    );
    expect(
      activated.ledger.records.every(
        (r, i, all) => r.previousRecordDigest === (i === 0 ? null : all[i - 1]!.recordDigest),
      ),
    ).toBe(true);
    expect(replayLedger(activated.ledger)).toMatchObject({
      ok: true,
      value: { state: 'PUBLISHED' },
    });
  });
});
