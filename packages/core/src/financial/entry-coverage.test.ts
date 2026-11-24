import { describe, expect, it } from 'vitest';

import type {
  FactMappingRule,
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
import { executeGovernanceCommand } from '../governance/authorized';
import { preparePackForPublication } from '../governance/commands';
import { createLedger } from '../governance/ledger';
import { checkPublicVerifiedPack, publicBundleOf } from '../governance/public-pack';
import {
  describeEntryCoverage,
  describeVerifiedEntryCoverage,
  entryCoverageFor,
  FACT_KINDS,
  FINANCIAL_FACT_SUBTYPES,
  sealRulePack,
  verifiedBundleWorkflows,
} from '../index';

/**
 * Phase 3 step 2: entry coverage read from a pack's own fact mapping. TEST PACKS ONLY — arbitrary
 * engineering ids and values, never a ruling.
 */

const clarify = { handling: 'clarify' } as const;
const categoryAction = {
  action: 'category',
  categoryId: 'test-category',
  amount: { estimated: clarify, range: clarify, unknown: clarify, notProvided: clarify },
  date: { field: null, approximate: clarify, unknown: clarify, notProvided: clarify },
} as const;

function testPack(
  rules: readonly FactMappingRule[],
  workflows: Partial<Record<'annual' | 'firstTime', boolean>> = { firstTime: true },
  withMapping = true,
): RulePack {
  const workflow = {
    steps: [
      {
        id: 'test-sum',
        label: 'TEST sum',
        ruleIds: ['test-rule'],
        expression: { op: 'sumCategories', categoryIds: ['test-category'] },
        rounding: null,
      },
    ],
    outputs: [{ id: 'test-out', label: 'TEST sum', stepId: 'test-sum' }],
  } as const;
  return {
    metadata: {
      packId: 'test-coverage-pack',
      marjaId: MARJA,
      version: '1.0.0',
      schemaVersion: 3,
      releaseChannel: 'PRODUCTION',
      title: 'TEST PACK — entry coverage fixture (not a ruling)',
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
    parameters: [],
    consultations: [
      { id: 'test-unmatched', label: 'TEST', ruleIds: ['test-rule'] },
      { id: 'test-consult', label: 'TEST', ruleIds: ['test-rule'] },
    ],
    workflows: {
      annual: workflows.annual === true ? workflow : null,
      firstTime: workflows.firstTime === true ? workflow : null,
      missedYear: null,
    },
    ...(withMapping
      ? {
          factMapping: {
            mappingVersion: 1,
            factSheetSchemaVersions: [1],
            ruleIds: ['test-rule'],
            unmatched: { handling: 'consult', consultationId: 'test-unmatched' },
            rules,
          },
        }
      : {}),
  };
}

const rule = (
  id: string,
  match: FactMappingRule['match'],
  then: FactMappingRule['then'],
): FactMappingRule => ({ id, ruleIds: ['test-rule'], match, then });

const CASH_RULE = rule(
  'map-cash',
  { workflows: ['first-time'], kinds: ['BALANCE'], subtypes: ['CASH'] },
  categoryAction,
);

const MIXED = [
  CASH_RULE,
  rule(
    'map-gift',
    { workflows: ['first-time'], kinds: ['INCOME'], subtypes: ['GIFT'] },
    { action: 'exclude', ruleIds: ['test-rule'] },
  ),
  rule(
    'map-loan',
    { workflows: ['first-time'], kinds: ['LIABILITY'], subtypes: ['LOAN'] },
    { action: 'consult', consultationId: 'test-consult' },
  ),
  rule(
    'map-car',
    { workflows: ['first-time'], kinds: ['ASSET'], subtypes: ['VEHICLE'] },
    {
      action: 'ask',
      questionId: 'test-question',
      cases: [{ equals: true, then: categoryAction }],
      otherwise: { handling: 'consult', consultationId: 'test-consult' },
    },
  ),
  // A rule for another workflow only: it never applies to first-time entries.
  rule(
    'map-employment-annual',
    { workflows: ['annual'], kinds: ['INCOME'], subtypes: ['EMPLOYMENT'] },
    categoryAction,
  ),
];

describe('describeEntryCoverage', () => {
  it('classifies each mapped action and sends every other type to the unmatched review', () => {
    const result = describeEntryCoverage(testPack(MIXED), 'first-time');
    if (!result.ok) throw new Error('expected coverage');
    const c = result.value;
    expect(c).toMatchObject({ packId: 'test-coverage-pack', version: '1.0.0' });
    expect(entryCoverageFor(c, 'BALANCE', 'CASH')).toEqual({
      status: 'CALCULATED',
      categoryId: 'test-category',
    });
    expect(entryCoverageFor(c, 'INCOME', 'GIFT')).toEqual({ status: 'EXCLUDED' });
    expect(entryCoverageFor(c, 'LIABILITY', 'LOAN')).toEqual({
      status: 'REVIEW',
      consultationId: 'test-consult',
      unmatched: false,
    });
    expect(entryCoverageFor(c, 'ASSET', 'VEHICLE')).toEqual({
      status: 'ASKS_QUESTION',
      questionId: 'test-question',
    });
    // Mapped only for the annual workflow: unmatched here.
    expect(entryCoverageFor(c, 'INCOME', 'EMPLOYMENT')).toEqual({
      status: 'REVIEW',
      consultationId: 'test-unmatched',
      unmatched: true,
    });
  });

  it('describes every kind and subtype the fact sheet knows, and nothing else', () => {
    const result = describeEntryCoverage(testPack(MIXED), 'first-time');
    if (!result.ok) throw new Error('expected coverage');
    for (const kind of FACT_KINDS) {
      expect(Object.keys(result.value.entries[kind]).sort()).toEqual(
        [...FINANCIAL_FACT_SUBTYPES[kind]].sort(),
      );
    }
    const statuses = FACT_KINDS.flatMap((kind) =>
      Object.values(result.value.entries[kind]).map((e) => e.status),
    );
    expect(statuses.filter((s) => s !== 'REVIEW')).toHaveLength(3);
    expect(entryCoverageFor(result.value, 'INCOME', 'NOT_A_SUBTYPE')).toBeNull();
    expect(entryCoverageFor(result.value, 'INCOME', 'toString')).toBeNull();
  });

  it('matches a rule naming several kinds and subtypes on each listed pair only', () => {
    const pack = testPack([
      rule(
        'map-many',
        { workflows: ['first-time'], kinds: ['BALANCE'], subtypes: ['CASH', 'BANK_ACCOUNT'] },
        categoryAction,
      ),
    ]);
    const result = describeEntryCoverage(pack, 'first-time');
    if (!result.ok) throw new Error('expected coverage');
    expect(entryCoverageFor(result.value, 'BALANCE', 'CASH')?.status).toBe('CALCULATED');
    expect(entryCoverageFor(result.value, 'BALANCE', 'BANK_ACCOUNT')?.status).toBe('CALCULATED');
    expect(entryCoverageFor(result.value, 'BALANCE', 'DIGITAL_WALLET')?.status).toBe('REVIEW');
  });

  it('refuses a workflow the pack does not define, and a pack without a usable mapping', () => {
    expect(describeEntryCoverage(testPack(MIXED), 'annual')).toEqual({
      ok: false,
      error: { code: 'WORKFLOW_NOT_SUPPORTED' },
    });
    expect(describeEntryCoverage(testPack([], { firstTime: true }, false), 'first-time')).toEqual({
      ok: false,
      error: { code: 'MAPPING_NOT_DEFINED' },
    });
    const future = testPack(MIXED);
    const unsupported = {
      ...future,
      factMapping: { ...future.factMapping, mappingVersion: 99 },
    } as unknown as RulePack;
    expect(describeEntryCoverage(unsupported, 'first-time')).toEqual({
      ok: false,
      error: { code: 'MAPPING_NOT_DEFINED' },
    });
  });
});

// ── Public verified bundles (governed TEST pack, as in governance/public-pack.test.ts) ──

const SCHOLAR = principal('test-scholar', { roles: [['SCHOLAR', marjaScope(MARJA)]] });
const evidence = { reference: 'docs/research/reviews/test/entry-coverage.REVIEW.md' };
let tick = 0;
function run(who: VerifiedPrincipal, ledger: unknown, command: Record<string, unknown>) {
  tick += 1;
  const outcome = executeGovernanceCommand({
    principal: who,
    ledger,
    command,
    context: {
      decisionId: `d-coverage-${String(tick)}`,
      evaluatedAt: shift(NOW, tick),
      session: { sessionId: who.session.sessionId, state: 'ACTIVE' },
      policyRegistry: policyRegistryFor('SINGLE_SCHOLAR_V1', MARJA),
    },
  });
  if (outcome.status !== 'APPLIED') throw new Error(`expected APPLIED, got ${outcome.status}`);
  return outcome;
}

function publicBundle() {
  const sealed = sealRulePack(testPack([CASH_RULE]));
  if (!sealed.ok) throw new Error('seal failed');
  const pack = sealed.value;
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
  const activated = run(SCHOLAR, out.ledger, { type: 'ACTIVATE', pack: out.pack });
  const checked = checkPublicVerifiedPack(out.pack, activated.ledger);
  if (!checked.ok) throw new Error('fixture: not verified');
  return publicBundleOf(checked.value);
}

describe('verified bundles', () => {
  it('describes a bundle that passes the browser check, and lists its workflows', () => {
    const bundle = publicBundle();
    expect(verifiedBundleWorkflows(bundle)).toEqual(['first-time']);
    const result = describeVerifiedEntryCoverage(bundle, 'first-time');
    if (!result.ok) throw new Error('expected coverage');
    expect(entryCoverageFor(result.value, 'BALANCE', 'CASH')?.status).toBe('CALCULATED');
    expect(entryCoverageFor(result.value, 'INCOME', 'GIFT')?.status).toBe('REVIEW');
    expect(describeVerifiedEntryCoverage(bundle, 'annual')).toEqual({
      ok: false,
      error: { code: 'WORKFLOW_NOT_SUPPORTED' },
    });
  });

  it('describes nothing for a bundle that fails the check', () => {
    const bundle = publicBundle();
    const tampered = { pack: bundle.pack, summary: { ...bundle.summary, version: '9.9.9' } };
    expect(verifiedBundleWorkflows(tampered)).toBeNull();
    expect(describeVerifiedEntryCoverage(tampered, 'first-time')).toEqual({
      ok: false,
      error: { code: 'NOT_VERIFIED' },
    });
    expect(verifiedBundleWorkflows({ pack: null, summary: null })).toBeNull();
  });
});
