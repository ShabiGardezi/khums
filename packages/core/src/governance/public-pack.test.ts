import { describe, expect, it } from 'vitest';

import type {
  FinancialFactSheet,
  GovernanceLedger,
  RulePack,
  VerifiedPrincipal,
} from '@khums/shared-types';

import {
  marjaScope,
  MARJA,
  NOW,
  policyRegistryFor,
  principal,
  shift,
} from '../authorization/test-support';
import { runVerifiedAssessment } from '../financial/run-assessment';
import { sealRulePack } from '../index';
import { executeGovernanceCommand, type AuthorizedGovernanceOutcome } from './authorized';
import { preparePackForPublication } from './commands';
import { createLedger } from './ledger';
import {
  activationFromLedger,
  checkPublicPackBundle,
  checkPublicVerifiedPack,
  publicBundleOf,
  selectPublicVerifiedPack,
} from './public-pack';

/**
 * Decision 65: the public verified pack. TEST PACKS ONLY — arbitrary engineering values, not
 * rulings; `isMock: false` only so the governance and production gates run.
 */

const SCHOLAR = principal('test-scholar', { roles: [['SCHOLAR', marjaScope(MARJA)]] });
const evidence = { reference: 'docs/research/reviews/test/public-pack.REVIEW.md' };
const clarify = { handling: 'clarify' } as const;

function publicTestPack(
  options: { version?: string; packId?: string; channel?: 'PRODUCTION' | 'SCHOLAR_REVIEW' } = {},
  withMapping = true,
): RulePack {
  const sealed = sealRulePack({
    metadata: {
      packId: options.packId ?? 'test-public-pack',
      marjaId: MARJA,
      version: options.version ?? '1.0.0',
      schemaVersion: 3,
      releaseChannel: options.channel ?? 'PRODUCTION',
      title: 'TEST PACK — public verified fixture (not a ruling)',
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
    inputCategories: [{ id: 'test-category', label: 'TEST category', ruleIds: ['test-rule'] }],
    questions: [],
    parameters: [{ id: 'test-rate', label: 'TEST rate', value: '12.5', ruleIds: ['test-rule'] }],
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
          {
            id: 'test-share',
            label: 'TEST share',
            ruleIds: ['test-rule'],
            expression: {
              op: 'percentage',
              of: { op: 'step', stepId: 'test-sum' },
              rate: { op: 'parameter', parameterId: 'test-rate' },
            },
            rounding: { scale: 'currency', mode: 'HALF_EVEN' },
          },
        ],
        outputs: [{ id: 'test-out', label: 'TEST share', stepId: 'test-share' }],
      },
      missedYear: null,
    },
    ...(withMapping
      ? {
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
                  amount: {
                    estimated: clarify,
                    range: clarify,
                    unknown: clarify,
                    notProvided: clarify,
                  },
                  date: {
                    field: null,
                    approximate: clarify,
                    unknown: clarify,
                    notProvided: clarify,
                  },
                },
              },
            ],
          },
        }
      : {}),
  });
  if (!sealed.ok) throw new Error('seal failed');
  return sealed.value;
}

let tick = 0;
function run(who: VerifiedPrincipal, ledger: unknown, command: Record<string, unknown>) {
  tick += 1;
  const outcome: AuthorizedGovernanceOutcome = executeGovernanceCommand({
    principal: who,
    ledger,
    command,
    context: {
      decisionId: `d-public-${String(tick)}`,
      evaluatedAt: shift(NOW, tick),
      session: { sessionId: who.session.sessionId, state: 'ACTIVE' },
      policyRegistry: policyRegistryFor('SINGLE_SCHOLAR_V1', MARJA),
    },
  });
  if (outcome.status !== 'APPLIED') throw new Error(`expected APPLIED, got ${outcome.status}`);
  return outcome;
}

/** Submitted, reviewed, approved and published by one scholar (SINGLE_SCHOLAR_V1). */
function published(pack: RulePack = publicTestPack()) {
  let ledger: GovernanceLedger = createLedger(pack.metadata.packId, pack.metadata.version);
  for (const command of [
    { type: 'SUBMIT', pack },
    { type: 'START_REVIEW', pack },
    { type: 'COMPLETE_REVIEW', pack, evidence },
    { type: 'APPROVE', pack, evidence },
  ]) {
    ledger = run(SCHOLAR, ledger, command).ledger;
  }
  const prepared = preparePackForPublication(pack, ledger);
  if (!prepared.ok) throw new Error('prepare failed');
  const out = run(SCHOLAR, ledger, { type: 'PUBLISH', pack: prepared.value });
  if (out.pack === null) throw new Error('no published pack');
  return { ledger: out.ledger, pack: out.pack };
}

function activated(pack?: RulePack) {
  const p = published(pack);
  const out = run(SCHOLAR, p.ledger, { type: 'ACTIVATE', pack: p.pack });
  if (out.activation === null) throw new Error('no activation');
  return { ledger: out.ledger, pack: p.pack, activation: out.activation };
}

const sheet = (amount: string): FinancialFactSheet => ({
  schemaVersion: 1,
  currency: 'GBP',
  context: { workflow: 'first-time', assessmentDate: '2026-06-30' },
  facts: [
    {
      id: 'f1',
      kind: 'BALANCE',
      subtype: 'CASH',
      label: null,
      note: null,
      currency: 'GBP',
      value: { status: 'KNOWN', amount },
      periodId: null,
      valuedOn: { status: 'NOT_PROVIDED' },
    },
  ],
});

describe('activationFromLedger', () => {
  it('rebuilds exactly the activation the ACTIVATE command produced', () => {
    const a = activated();
    expect(activationFromLedger(a.ledger)).toEqual({ ok: true, value: a.activation });
  });

  it('fails for a ledger without activation, and for malformed ledgers', () => {
    expect(activationFromLedger(published().ledger).ok).toBe(false);
    expect(activationFromLedger({ packId: 'x' })).toEqual({
      ok: false,
      error: [{ code: 'LEDGER_MALFORMED', recordId: null }],
    });
  });
});

describe('checkPublicVerifiedPack', () => {
  it('accepts a governed, published, activated and ready production pack', () => {
    const a = activated();
    const checked = checkPublicVerifiedPack(a.pack, a.ledger);
    expect(checked.ok).toBe(true);
    if (!checked.ok) return;
    expect(checked.value.workflows).toEqual(['first-time']);
    expect(checked.value.activation).toEqual(a.activation);
  });

  it('refuses published but unactivated, withdrawn and tampered versions', () => {
    const p = published();
    expect(checkPublicVerifiedPack(p.pack, p.ledger).ok).toBe(false);
    const a = activated();
    const withdrawn = run(SCHOLAR, a.ledger, {
      type: 'WITHDRAW',
      pack: a.pack,
      reason: 'ERROR_FOUND',
    }).ledger;
    expect(checkPublicVerifiedPack(a.pack, withdrawn)).toMatchObject({ ok: false });
    const tampered = { ...a.pack, sources: [{ ...a.pack.sources[0], title: 'TEST changed' }] };
    expect(checkPublicVerifiedPack(tampered, a.ledger).ok).toBe(false);
    // Another version's ledger never vouches for this content.
    const other = activated(publicTestPack({ version: '1.0.1' }));
    expect(checkPublicVerifiedPack(a.pack, other.ledger).ok).toBe(false);
  });

  it('refuses mock and scholar-review content outright, and packs without a fact mapping', () => {
    const a = activated();
    expect(
      checkPublicVerifiedPack(
        { ...a.pack, metadata: { ...a.pack.metadata, isMock: true } },
        a.ledger,
      ),
    ).toEqual({ ok: false, error: [{ code: 'NOT_ELIGIBLE', recordId: null }] });
    const review = publicTestPack({ channel: 'SCHOLAR_REVIEW' });
    expect(checkPublicVerifiedPack(review, a.ledger)).toEqual({
      ok: false,
      error: [{ code: 'NOT_ELIGIBLE', recordId: null }],
    });
    const unmapped = activated(publicTestPack({ packId: 'test-unmapped' }, false));
    expect(checkPublicVerifiedPack(unmapped.pack, unmapped.ledger).ok).toBe(false);
    expect(checkPublicVerifiedPack({}, a.ledger)).toEqual({
      ok: false,
      error: [{ code: 'PACK_MALFORMED', recordId: null }],
    });
    expect(checkPublicVerifiedPack(a.pack, null)).toEqual({
      ok: false,
      error: [{ code: 'LEDGER_MALFORMED', recordId: null }],
    });
  });
});

describe('selectPublicVerifiedPack', () => {
  it('picks the most recently activated qualifying version of the Marja, or null', () => {
    const first = activated(publicTestPack({ version: '1.0.0', packId: 'test-select' }));
    const second = activated(publicTestPack({ version: '1.1.0', packId: 'test-select' }));
    const unactivated = published(publicTestPack({ version: '2.0.0', packId: 'test-select' }));
    const chosen = selectPublicVerifiedPack(MARJA, [first, unactivated, second]);
    expect(chosen?.pack.metadata.version).toBe('1.1.0');
    expect(selectPublicVerifiedPack(MARJA, [second, first])?.pack.metadata.version).toBe('1.1.0');
    expect(selectPublicVerifiedPack('other-marja', [first, second])).toBeNull();
    expect(selectPublicVerifiedPack(MARJA, [unactivated])).toBeNull();
    expect(selectPublicVerifiedPack(MARJA, [])).toBeNull();
  });
});

/** The public bundle the API serves for a server-verified bundle (no ledger). */
function publicOf(bundle: { pack: RulePack; ledger: GovernanceLedger }) {
  const checked = checkPublicVerifiedPack(bundle.pack, bundle.ledger);
  if (!checked.ok) throw new Error('fixture: not verified');
  return publicBundleOf(checked.value);
}

describe('publicBundleOf / checkPublicPackBundle (no ledger, no staff ids)', () => {
  it('serves no person identifier and keeps the digest; the browser re-check passes', () => {
    const a = activated();
    const bundle = publicOf(a);
    const json = JSON.stringify(bundle);
    expect(json).not.toContain('test-scholar');
    expect(json).not.toContain('records');
    expect(bundle.pack.metadata.approvals.map((x) => x.reviewerId)).toEqual(['redacted-1']);
    expect(bundle.summary).toMatchObject({
      packId: 'test-public-pack',
      version: '1.0.0',
      contentDigest: a.pack.metadata.integrity?.digest,
      workflows: ['first-time'],
      rules: [{ ruleId: 'test-rule', verified: true }],
    });
    expect(bundle.summary.publishedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const checked = checkPublicPackBundle(bundle.pack, bundle.summary);
    expect(checked.ok).toBe(true);
  });

  it('refuses changed content, a wrong digest, references or rule list, and review packs', () => {
    const bundle = publicOf(activated());
    const changed = {
      ...bundle.pack,
      rules: bundle.pack.rules.map((r) => ({ ...r, summary: 'TEST changed' })),
    };
    expect(checkPublicPackBundle(changed, bundle.summary).ok).toBe(false);
    expect(
      checkPublicPackBundle(bundle.pack, { ...bundle.summary, contentDigest: '0'.repeat(64) }).ok,
    ).toBe(false);
    expect(
      checkPublicPackBundle(bundle.pack, {
        ...bundle.summary,
        approvalReferences: ['approval#9/abc'],
      }).ok,
    ).toBe(false);
    expect(checkPublicPackBundle(bundle.pack, { ...bundle.summary, rules: [] }).ok).toBe(false);
    expect(checkPublicPackBundle(bundle.pack, { ...bundle.summary, version: '9.0.0' }).ok).toBe(
      false,
    );
    expect(checkPublicPackBundle(bundle.pack, null).ok).toBe(false);
    const review = publicTestPack({ channel: 'SCHOLAR_REVIEW' });
    expect(checkPublicPackBundle(review, bundle.summary).ok).toBe(false);
    // An unapproved pack can never pass in the browser either.
    const unapproved = { ...bundle.pack, metadata: { ...bundle.pack.metadata, approvals: [] } };
    expect(checkPublicPackBundle(unapproved, bundle.summary).ok).toBe(false);
  });
});

describe('runVerifiedAssessment', () => {
  it('calculates in production mode with approved guidance and the pack trace', () => {
    const a = activated();
    const result = runVerifiedAssessment(sheet('200.00'), publicOf(a));
    expect(result.kind).toBe('CALCULATED');
    if (result.kind !== 'CALCULATED' || result.report.workflow === 'missed-year') return;
    expect(result.report.meta).toMatchObject({
      mode: 'production',
      guidance: 'APPROVED_RULE_PACK',
      disclaimer: null,
      rulePack: {
        packId: 'test-public-pack',
        version: '1.0.0',
        isMock: false,
        contentDigest: a.pack.metadata.integrity?.digest,
      },
    });
    expect(result.report.result.outputs).toEqual([
      { id: 'test-out', label: 'TEST share', value: { amount: '25', currency: 'GBP' } },
    ]);
    expect(JSON.stringify(result.report)).not.toContain('test-scholar');
  });

  it('never calculates with an unverified bundle; stops for input before calculating', () => {
    const a = publicOf(activated());
    const p = published();
    expect(runVerifiedAssessment(sheet('1.00'), { pack: p.pack, summary: a.summary })).toEqual({
      kind: 'NOT_VERIFIED',
    });
    const review = publicTestPack({ channel: 'SCHOLAR_REVIEW' });
    expect(runVerifiedAssessment(sheet('1.00'), { pack: review, summary: a.summary })).toEqual({
      kind: 'NOT_VERIFIED',
    });
    const estimated = sheet('1.00');
    const unclear = {
      ...estimated,
      facts: [{ ...estimated.facts[0], value: { status: 'ESTIMATED', amount: '1.00' } }],
    };
    expect(runVerifiedAssessment(unclear, a)).toMatchObject({
      kind: 'NEEDS_INPUT',
      mapping: { status: 'NEEDS_CLARIFICATION' },
    });
  });

  it('reports engine refusals (dates outside the effective period)', () => {
    const a = publicOf(activated());
    const early = {
      ...sheet('1.00'),
      context: { workflow: 'first-time', assessmentDate: '1999-01-01' },
    };
    expect(runVerifiedAssessment(early, a).kind).toBe('REFUSED');
  });
});
