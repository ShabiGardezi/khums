import { describe, expect, it } from 'vitest';

import { Decimal } from '@khums/money';
import type {
  AmountValue,
  Answers,
  FactAnswers,
  FinancialFactKind,
  ResearchChain,
  ResearchEntityType,
  ResearchReference,
  RulePack,
  VerifiedPrincipal,
} from '@khums/shared-types';
import type { BuilderCondition, BuilderRuleContent, ScholarRuleRevision } from '@khums/validation';

import { marjaScope, NOW, principal, shift } from '../authorization/test-support';
import {
  checkPublicVerifiedPack,
  publicBundleOf,
  type PublicPackBundle,
} from '../governance/public-pack';
import { appendResearchRevision } from '../research/chain';
import { formatUuidV7, researchDisplayRef } from '../research/ids';
import {
  builderPackRuleId,
  compileVerifiedBuilderPack,
  completeVerification,
  type PendingRuleVerification,
  recordRuleVerification,
  runAutomaticBuilderGovernance,
} from '../rule-builder/index';
import { runVerifiedAssessment, type VerifiedAssessmentRun } from './run-assessment';

/**
 * Phase 3 step 7: scenario tests of the PUBLIC calculation (`runVerifiedAssessment`) with TEST
 * builder packs for both Marja ids, taken through the real Phase 2 path: SYNTHETIC TEST research
 * → scholar rule-builder rules → source verification by a TEST scholar of that Marja → automatic
 * approval, publication and activation → the public bundle (no ledger) → calculation in the
 * engine's production mode.
 *
 * EVERYTHING HERE IS TEST DATA. The rates (12.5, 15, 17.5, 10), the entry types each TEST rule
 * counts, deducts or leaves out, and every confirmation label are arbitrary engineering values
 * chosen to exercise the calculator; none of them states how any Marja treats anything, and no
 * real ruling or real rate is presented. `sistani` and `khamenei` are used only as ids (the
 * builder and research workflows are configured for them). The tests prove that the calculator
 * applies whatever a pack contains, exactly; real accuracy can only be tested against rules that
 * scholars verify. Expected figures are computed with `@khums/money` Decimal and, in addition
 * (audit L-7), checked against LITERAL decimal strings worked out by hand (shown in comments), so
 * the expectations do not depend only on the library the engine itself uses.
 */

const MARJAS = ['sistani', 'khamenei'] as const;
type MarjaId = (typeof MARJAS)[number];

// ── SYNTHETIC research records (as in the Phase 2 verification tests) ──────────────────────

let seq = 0;
const uuid = () => {
  seq += 1;
  const random = new Uint8Array(10);
  random[0] = 0x80;
  random[8] = Math.floor(seq / 256);
  random[9] = seq % 256;
  return formatUuidV7(Date.parse('2026-11-24T08:00:00.000Z') + seq, random);
};
const step = (
  kind: string,
  payload: Record<string, unknown> | null,
  refs: ResearchReference[],
) => ({
  kind: kind as 'CREATED',
  payload,
  references: refs,
  aiInvolvement: [],
  actor: { kind: 'STAFF_PRINCIPAL' as const, subject: 'test-scholar' },
  recordedAt: '2026-11-24T08:00:00.000Z',
  reason: null,
  decisionId: `d-${kind}`,
  requestId: `r-${kind}`,
});
const pin = (chain: ResearchChain, revision: number): ResearchReference => ({
  entityType: chain.entityType,
  entityId: chain.entityId,
  revision,
  rulingVersion: chain.records[0]?.rulingVersion ?? null,
  marjaId: chain.records[0]?.marjaId ?? '',
});
const chains = new Map<string, ResearchChain>();
const load = (type: ResearchEntityType, id: string) => {
  const chain = chains.get(id);
  return chain?.entityType === type ? chain : null;
};
function create(
  entityType: ResearchEntityType,
  payload: Record<string, unknown>,
  refs: ResearchReference[],
  marjaId: string,
): ResearchChain {
  const entityId = uuid();
  const question =
    entityType === 'FINDING'
      ? { id: 'INC-01', catalogueRevision: 'research-matrix-rev5-required' }
      : null;
  const made = appendResearchRevision(
    null,
    {
      entityType,
      entityId,
      displayRef: researchDisplayRef(entityType, marjaId, entityId, question?.id ?? null),
      marjaId,
      rulingVersion: entityType === 'RULING' ? 1 : null,
      rulingSeriesId: entityType === 'RULING' ? entityId : null,
      question,
    },
    step('CREATED', payload, refs),
  );
  if (!made.ok) throw new Error(made.error);
  chains.set(entityId, made.value.chain);
  return made.value.chain;
}
function verified(chain: ResearchChain) {
  const next = appendResearchRevision(chain, null, step('VERIFIED', null, []));
  if (!next.ok) throw new Error(next.error);
  chains.set(chain.entityId, next.value.chain);
  return next.value.chain;
}

/** TEST research of one Marja: verified source, passage and finding; a draft ruling. */
function testResearch(marjaId: string) {
  const source = verified(
    create(
      'SOURCE',
      {
        title: { original: 'TEST scenario source', translation: null },
        copyright: 'EXCERPTS_ONLY',
      },
      [],
      marjaId,
    ),
  );
  const passage = verified(
    create(
      'PASSAGE',
      { locator: { page: '1' }, originalLanguage: 'ar', text: 'TEST excerpt' },
      [pin(source, 1)],
      marjaId,
    ),
  );
  const finding = verified(
    create('FINDING', { conclusion: 'TEST finding' }, [pin(passage, 1)], marjaId),
  );
  const ruling = create(
    'RULING',
    { conclusion: 'TEST ruling' },
    [pin(finding, 0), pin(passage, 1)],
    marjaId,
  );
  return { source, ruling };
}

// ── TEST builder rules, verification and publication ───────────────────────────────────────

interface Entry {
  readonly kind: FinancialFactKind;
  readonly subtype: string;
}
const e = (kind: FinancialFactKind, subtype: string): Entry => ({ kind, subtype });

/** A TEST rule: what the scholar would enter in the builder (arbitrary engineering values). */
type TestRule = Partial<BuilderRuleContent> & Pick<BuilderRuleContent, 'category' | 'rate'>;

interface Publication {
  readonly bundle: PublicPackBundle;
  readonly pack: RulePack;
  /** The pack rule id of each TEST rule, in the order given. */
  readonly packRuleIds: readonly string[];
  readonly sourceId: string;
}

let decisions = 0;

/**
 * Verifies `verifiedRules` (a TEST scholar of the Marja records the four attestations for each)
 * and publishes the Marja's builder pack; `unverifiedRules` are saved but never verified.
 */
function publishTestPack(
  marjaId: MarjaId,
  verifiedRules: readonly TestRule[],
  unverifiedRules: readonly TestRule[] = [],
): Publication {
  const { source, ruling } = testResearch(marjaId);
  const scholar: VerifiedPrincipal = principal(`test-scholar-${marjaId}`, {
    roles: [['SCHOLAR', marjaScope(marjaId)]],
  });
  const context = () => {
    decisions += 1;
    return {
      decisionId: `test-decision-${String(decisions)}`,
      evaluatedAt: shift(NOW, decisions),
      session: { sessionId: scholar.session.sessionId, state: 'ACTIVE' as const },
    };
  };
  const revisionOf = (rule: TestRule): ScholarRuleRevision => ({
    ruleId: uuid(),
    revision: 0,
    marjaId,
    content: {
      rulingId: ruling.entityId,
      includedEntries: [],
      deductions: [],
      conditions: [],
      exceptions: [],
      threshold: null,
      sourceRefs: [source.entityId],
      requirementFlags: [],
      otherRequirement: null,
      notes: null,
      ...rule,
    },
    rulingVersion: 1,
    actor: scholar.principalId,
    at: '2026-11-24T08:30:00.000Z',
    reason: 'TEST save',
  });
  const toVerify = verifiedRules.map(revisionOf);
  const unverified = unverifiedRules.map(revisionOf);
  const pending: PendingRuleVerification[] = toVerify.map((revision) => {
    const recorded = recordRuleVerification({
      principal: scholar,
      context: context(),
      history: [revision],
      expectedRevision: 0,
      attestations: {
        sourcesAuthentic: true,
        originalTextMatches: true,
        translationAccurate: true,
        attributionCorrect: true,
      },
      notes: null,
      reason: 'TEST verification',
      verificationId: uuid(),
      load,
    });
    if (!recorded.ok) throw new Error(recorded.error.code);
    return recorded.value;
  });
  const compiled = compileVerifiedBuilderPack({
    marjaId,
    version: '1.0.0',
    histories: [...toVerify, ...unverified].map((r) => [r]),
    verifications: pending,
    sources: { [source.entityId]: { title: 'TEST scenario source', url: null, locator: null } },
    load,
  });
  if (!compiled.ok) throw new Error(compiled.error.code);
  const last = pending.at(-1);
  if (last === undefined) throw new Error('fixture: at least one verified rule');
  const record = completeVerification(last, {
    packId: compiled.value.pack.metadata.packId,
    version: '1.0.0',
    contentDigest: compiled.value.pack.metadata.integrity?.digest ?? '',
  });
  if (!record.ok) throw new Error('fixture: verification record');
  const governed = runAutomaticBuilderGovernance({
    principal: scholar,
    nextContext: context,
    pack: compiled.value.pack,
    verification: record.value,
    previous: [],
  });
  if (!governed.ok) throw new Error(governed.error.command);
  const checked = checkPublicVerifiedPack(governed.value.publishedPack, governed.value.ledger);
  if (!checked.ok) throw new Error(JSON.stringify(checked.error));
  return {
    bundle: publicBundleOf(checked.value),
    pack: governed.value.publishedPack,
    packRuleIds: [...toVerify, ...unverified].map((r) => builderPackRuleId(r.ruleId)),
    sourceId: source.entityId,
  };
}

// ── Neutral entries (what a person types; no religious classification) ──────────────────────

const PERIOD = { start: '2025-03-21', end: '2026-03-20' };
const known = (amount: string): AmountValue => ({ status: 'KNOWN', amount });
let factSeq = 0;
function fact(
  entry: Entry,
  value: AmountValue,
  options: { currency?: string; id?: string; date?: string } = {},
) {
  factSeq += 1;
  const date = { status: 'KNOWN', date: options.date ?? '2025-09-01' };
  const notProvided = { status: 'NOT_PROVIDED' };
  const dates: Record<FinancialFactKind, Record<string, unknown>> = {
    ASSET: { valuedOn: date, acquiredOn: notProvided },
    BALANCE: { valuedOn: date },
    INCOME: { receivedOn: date },
    EXPENSE: { paidOn: date },
    LIABILITY: { valuedOn: date, incurredOn: notProvided, dueOn: notProvided },
  };
  return {
    id: options.id ?? `fact-${String(factSeq)}`,
    kind: entry.kind,
    subtype: entry.subtype,
    label: null,
    note: null,
    currency: options.currency ?? 'USD',
    value,
    periodId: null,
    ...dates[entry.kind],
  };
}
const sheet = (facts: readonly ReturnType<typeof fact>[], currency = 'USD') => ({
  schemaVersion: 1,
  currency,
  context: { workflow: 'annual', period: PERIOD },
  facts,
});

// ── Assertions ───────────────────────────────────────────────────────────────────────────────

const D = (value: string) => Decimal.of(value);
const sum = (...values: string[]) => values.reduce((total, v) => total.add(D(v)), Decimal.ZERO);
/** `max(gross − deductions, 0)`, as the TEST packs' net step states it. */
const floored = (gross: Decimal, deductions: Decimal) =>
  gross.subtract(deductions).isNegative() ? Decimal.ZERO : gross.subtract(deductions);

type Calculated = Extract<VerifiedAssessmentRun, { kind: 'CALCULATED' }>;
function calculated(run: VerifiedAssessmentRun): Calculated & {
  report: Exclude<Calculated['report'], { workflow: 'missed-year' }>;
} {
  if (run.kind !== 'CALCULATED' || run.report.workflow !== 'annual') {
    throw new Error(`expected a calculated annual result, got ${run.kind}`);
  }
  return run as Calculated & { report: Exclude<Calculated['report'], { workflow: 'missed-year' }> };
}
/** The exact decimal string of one TEST rule's output, or null when not calculated. */
function output(run: Calculated, packRuleId: string): string | null {
  if (run.report.workflow === 'missed-year') throw new Error('annual only');
  const found = run.report.result.outputs.find((o) => o.id === `${packRuleId}:result`);
  if (found === undefined) throw new Error(`no output ${packRuleId}`);
  return found.value?.amount ?? null;
}
function stepValue(run: Calculated, stepId: string): string | null {
  if (run.report.workflow === 'missed-year') throw new Error('annual only');
  return run.report.result.breakdown.find((s) => s.stepId === stepId)?.value ?? null;
}
/** Exact decimal equality (Decimal comparison, never floats), with a readable message. */
function expectExact(actual: string | null, expected: Decimal) {
  expect(actual, `expected ${expected.toString()}`).not.toBeNull();
  expect(D(actual ?? '0').equals(expected), `${String(actual)} ≠ ${expected.toString()}`).toBe(
    true,
  );
}
/** Every calculated public result carries the full trace of the pack it used. */
function expectTrace(run: Calculated, publication: Publication, marjaId: MarjaId) {
  const { meta } = run.report;
  expect(meta.guidance).toBe('APPROVED_RULE_PACK');
  expect(meta.mode).toBe('production');
  expect(meta.rulePack).toMatchObject({
    packId: `${marjaId}-builder`,
    marjaId,
    version: '1.0.0',
    isMock: false,
    releaseChannel: 'PRODUCTION',
  });
  expect(meta.rulePack.contentDigest).toBe(publication.bundle.summary.contentDigest);
  expect(meta.rulePack.contentDigest).toMatch(/^[0-9a-f]{64}$/);
  if (run.report.workflow === 'missed-year') throw new Error('annual only');
  for (const s of run.report.result.breakdown) {
    expect(s.ruleIds.length).toBeGreaterThan(0);
    expect(s.sourceRefs).toEqual([publication.sourceId]);
  }
}

// ── TEST rules (arbitrary engineering values; not a ruling) ─────────────────────────────────

/** TEST annual-surplus rule: counts work and business income; three deduction types; one exception. */
const SURPLUS: TestRule = {
  category: 'ANNUAL_SURPLUS',
  rate: '12.5',
  includedEntries: [
    e('INCOME', 'EMPLOYMENT'),
    e('INCOME', 'BONUS'),
    e('INCOME', 'BUSINESS'),
    e('INCOME', 'SALE'),
  ],
  deductions: [
    { type: 'LIVING_EXPENSES', entries: [e('EXPENSE', 'HOUSEHOLD'), e('EXPENSE', 'HOUSING')] },
    { type: 'COSTS_OF_EARNING', entries: [e('EXPENSE', 'BUSINESS')] },
    { type: 'DEDUCTIBLE_DEBTS', entries: [e('LIABILITY', 'BUSINESS_DEBT')] },
  ],
  exceptions: [e('INCOME', 'INHERITANCE')],
};
const MINED: TestRule = {
  category: 'MINED_PRODUCT',
  rate: '15',
  includedEntries: [e('INCOME', 'MINED_PRODUCT')],
  deductions: [{ type: 'COSTS_OF_EARNING', entries: [e('EXPENSE', 'SOLD_ITEM_COST')] }],
};
const TREASURE: TestRule = {
  category: 'TREASURE',
  rate: '17.5',
  includedEntries: [e('INCOME', 'TREASURE')],
};

describe.each(MARJAS)('public calculation scenarios with a TEST verified pack (%s)', (marjaId) => {
  const main = publishTestPack(marjaId, [SURPLUS, MINED, TREASURE]);
  const [surplus = '', mined = '', treasure = ''] = main.packRuleIds;
  const run = (facts: readonly ReturnType<typeof fact>[], currency = 'USD') =>
    runVerifiedAssessment(sheet(facts, currency), main.bundle);

  it('the TEST pack is a verified PRODUCTION pack of this Marja with only APPROVED rules', () => {
    expect(main.pack.metadata).toMatchObject({
      marjaId,
      releaseChannel: 'PRODUCTION',
      isMock: false,
    });
    expect(main.pack.rules.map((r) => r.status)).toEqual(['APPROVED', 'APPROVED', 'APPROVED']);
    expect(main.bundle.summary.workflows).toEqual(['annual']);
  });

  it('salaried person with living expenses', () => {
    const r = calculated(
      run([
        fact(e('INCOME', 'EMPLOYMENT'), known('85000.00')),
        fact(e('INCOME', 'BONUS'), known('5000.50')),
        fact(e('EXPENSE', 'HOUSEHOLD'), known('30000.25')),
        fact(e('EXPENSE', 'HOUSING'), known('12000.00')),
      ]),
    );
    const gross = sum('85000.00', '5000.50');
    const deductions = sum('30000.25', '12000.00');
    const net = floored(gross, deductions);
    expectExact(stepValue(r, `${surplus}:gross`), gross);
    expectExact(stepValue(r, `${surplus}:deductions`), deductions);
    expectExact(stepValue(r, `${surplus}:net`), net);
    // 48000.25 × 12.5 % = 6000.03125: exact, never rounded (the TEST pack has no rounding step).
    expectExact(output(r, surplus), net.percentage(D('12.5')));
    expect(output(r, surplus)).toBe('6000.03125');
    // By hand: 85000.00 + 5000.50 = 90000.50; 30000.25 + 12000.00 = 42000.25; difference 48000.25.
    expectExact(stepValue(r, `${surplus}:gross`), D('90000.50'));
    expectExact(stepValue(r, `${surplus}:deductions`), D('42000.25'));
    expectExact(stepValue(r, `${surplus}:net`), D('48000.25'));
    expect(r.report.result.breakdown.every((s) => s.rounding === null)).toBe(true);
    // The other TEST categories have no entries: their own figures are zero, never mixed in.
    expectExact(output(r, mined), Decimal.ZERO);
    expectExact(output(r, treasure), Decimal.ZERO);
    expect(r.report.result.status).toBe('COMPLETED');
    expectTrace(r, main, marjaId);
  });

  it('business owner with costs of earning, deductible debts and living expenses', () => {
    const r = calculated(
      run([
        fact(e('INCOME', 'BUSINESS'), known('250000.00')),
        fact(e('INCOME', 'SALE'), known('1500.75')),
        fact(e('EXPENSE', 'BUSINESS'), known('98000.40')),
        fact(e('LIABILITY', 'BUSINESS_DEBT'), known('20000.00')),
        fact(e('EXPENSE', 'HOUSEHOLD'), known('36000.00')),
        // A TEST exception: left out (excluded), never counted.
        fact(e('INCOME', 'INHERITANCE'), known('40000.00'), { id: 'left-out' }),
      ]),
    );
    const gross = sum('250000.00', '1500.75');
    const deductions = sum('98000.40', '20000.00', '36000.00');
    expectExact(stepValue(r, `${surplus}:deductions`), deductions);
    expectExact(output(r, surplus), floored(gross, deductions).percentage(D('12.5')));
    // By hand: 250000.00 + 1500.75 = 251500.75; 98000.40 + 20000.00 + 36000.00 = 154000.40;
    // 251500.75 − 154000.40 = 97500.35; 97500.35 × 12.5 / 100 = 12187.54375 (the 40000.00
    // left out is in neither sum).
    expectExact(stepValue(r, `${surplus}:gross`), D('251500.75'));
    expectExact(stepValue(r, `${surplus}:deductions`), D('154000.40'));
    expectExact(stepValue(r, `${surplus}:net`), D('97500.35'));
    expectExact(output(r, surplus), D('12187.54375'));
    expect(r.mapping.trace.find((t) => t.factId === 'left-out')?.outcome).toBe('EXCLUDED');
    expectTrace(r, main, marjaId);
  });

  it('mined product and treasure: separate figures per category, never added together', () => {
    const r = calculated(
      run([
        fact(e('INCOME', 'MINED_PRODUCT'), known('12000.00')),
        fact(e('EXPENSE', 'SOLD_ITEM_COST'), known('2500.30')),
        fact(e('INCOME', 'TREASURE'), known('800.00')),
        fact(e('INCOME', 'EMPLOYMENT'), known('1000.00')),
      ]),
    );
    const minedDue = floored(D('12000.00'), D('2500.30')).percentage(D('15'));
    const treasureDue = D('800.00').percentage(D('17.5'));
    const surplusDue = D('1000.00').percentage(D('12.5'));
    expectExact(output(r, mined), minedDue);
    expectExact(output(r, treasure), treasureDue);
    expectExact(output(r, surplus), surplusDue);
    // By hand: (12000.00 − 2500.30) × 15 / 100 = 9499.70 × 0.15 = 1424.955;
    // 800.00 × 17.5 / 100 = 140; 1000.00 × 12.5 / 100 = 125.
    expectExact(stepValue(r, `${mined}:net`), D('9499.70'));
    expectExact(output(r, mined), D('1424.955'));
    expectExact(output(r, treasure), D('140'));
    expectExact(output(r, surplus), D('125'));
    // One output per TEST rule and no combined total anywhere in the result.
    expect(r.report.result.outputs).toHaveLength(3);
    const total = minedDue.add(treasureDue).add(surplusDue);
    expect(
      r.report.result.breakdown.some((s) => s.value !== null && D(s.value).equals(total)),
    ).toBe(false);
    expectTrace(r, main, marjaId);
  });

  it('an uncovered entry type stops the WHOLE calculation for review, with a clear consult', () => {
    const outcome = run([
      fact(e('INCOME', 'EMPLOYMENT'), known('5000.00')),
      fact(e('BALANCE', 'CASH'), known('900.00'), { id: 'uncovered' }),
      fact(e('ASSET', 'VEHICLE'), known('15000.00'), { id: 'car' }),
    ]);
    expect(outcome.kind).toBe('NEEDS_INPUT');
    if (outcome.kind !== 'NEEDS_INPUT') return;
    expect(outcome.mapping.input).toBeNull();
    expect(outcome.mapping.consultations).toEqual([
      { factId: 'uncovered', consultationId: 'builder:unmatched' },
      { factId: 'car', consultationId: 'builder:unmatched' },
    ]);
    expect(main.pack.consultations.find((c) => c.id === 'builder:unmatched')?.label).toMatch(
      /no builder rule covers/,
    );
    // The covered entry is still traced as mapped (so the person sees what would be counted).
    expect(outcome.mapping.trace.map((t) => t.outcome)).toEqual([
      'ENTRY',
      'CONSULTATION',
      'CONSULTATION',
    ]);
  });

  it('zero and negative surplus are floored at zero (never negative)', () => {
    const zero = calculated(
      run([
        fact(e('INCOME', 'EMPLOYMENT'), known('4000.00')),
        fact(e('EXPENSE', 'HOUSEHOLD'), known('4000.00')),
      ]),
    );
    expectExact(stepValue(zero, `${surplus}:net`), Decimal.ZERO);
    expectExact(output(zero, surplus), Decimal.ZERO);
    const negative = calculated(
      run([
        fact(e('INCOME', 'EMPLOYMENT'), known('4000.00')),
        fact(e('EXPENSE', 'HOUSEHOLD'), known('9000.99')),
        fact(e('LIABILITY', 'BUSINESS_DEBT'), known('100.00')),
      ]),
    );
    expectExact(stepValue(negative, `${surplus}:deductions`), sum('9000.99', '100.00'));
    // By hand: 9000.99 + 100.00 = 9100.99, more than the 4000.00 counted: floored at 0.
    expectExact(stepValue(negative, `${surplus}:deductions`), D('9100.99'));
    expectExact(stepValue(negative, `${surplus}:net`), Decimal.ZERO);
    const due = output(negative, surplus);
    expectExact(due, Decimal.ZERO);
    expect(D(due ?? '0').isNegative()).toBe(false);
  });

  it('an empty year gives zero for every category (nothing invented)', () => {
    const r = calculated(run([]));
    for (const id of [surplus, mined, treasure]) expectExact(output(r, id), Decimal.ZERO);
    expect(r.report.result.status).toBe('COMPLETED');
    expect(r.mapping.trace).toEqual([]);
    expectTrace(r, main, marjaId);
  });

  it('estimated, range and unknown amounts ask for an exact amount (never assumed)', () => {
    const outcome = run([
      fact(e('INCOME', 'EMPLOYMENT'), { status: 'ESTIMATED', amount: '1000.00' }, { id: 'est' }),
      fact(e('INCOME', 'BONUS'), { status: 'RANGE', min: '100.00', max: '200.00' }, { id: 'rng' }),
      fact(e('EXPENSE', 'HOUSEHOLD'), { status: 'UNKNOWN' }, { id: 'unk' }),
      fact(e('INCOME', 'SALE'), known('50.00')),
    ]);
    expect(outcome.kind).toBe('NEEDS_INPUT');
    if (outcome.kind !== 'NEEDS_INPUT') return;
    expect(outcome.mapping.clarifications.map((c) => [c.factId, c.reason])).toEqual([
      ['est', 'AMOUNT_ESTIMATED'],
      ['rng', 'AMOUNT_RANGE'],
      ['unk', 'AMOUNT_UNKNOWN'],
    ]);
  });

  it('several currencies: each sheet in its own currency; a foreign-currency entry is unsupported', () => {
    // The last column is worked out by hand: (income − expense) × 12.5 / 100.
    for (const [currency, income, expense, byHand] of [
      ['PKR', '2500000.50', '1200000.25', '162500.03125'], // 1300000.25 / 8
      ['JPY', '9000000', '1234567', '970679.125'], // 7765433 / 8
      ['KWD', '15000.125', '4000.375', '1374.96875'], // 10999.750 / 8
      ['EUR', '70000.10', '20000.05', '6250.00625'], // 50000.05 / 8
    ] as const) {
      const r = calculated(
        run(
          [
            fact(e('INCOME', 'EMPLOYMENT'), known(income), { currency }),
            fact(e('EXPENSE', 'HOUSING'), known(expense), { currency }),
          ],
          currency,
        ),
      );
      const value = r.report.result.outputs.find((o) => o.id === `${surplus}:result`)?.value;
      expect(value?.currency).toBe(currency);
      expectExact(value?.amount ?? null, floored(D(income), D(expense)).percentage(D('12.5')));
      expectExact(value?.amount ?? null, D(byHand));
      expect(r.report.meta.currency).toBe(currency);
    }
    const mixed = run([
      fact(e('INCOME', 'EMPLOYMENT'), known('1000.00')),
      fact(e('EXPENSE', 'HOUSING'), known('100.00'), { currency: 'GBP', id: 'gbp' }),
    ]);
    expect(mixed.kind).toBe('NEEDS_INPUT');
    if (mixed.kind !== 'NEEDS_INPUT') return;
    expect(mixed.mapping.unsupported).toEqual([
      { factId: 'gbp', code: 'CURRENCY_CONVERSION_UNSUPPORTED' },
    ]);
  });

  it('large decimals and many entries: exact Decimal results, no rounding', () => {
    const incomes = Array.from(
      { length: 120 },
      (_, i) => `${String(987654321 + i * 7919)}.${String((i * 37) % 100).padStart(2, '0')}`,
    );
    const expenses = Array.from(
      { length: 80 },
      (_, i) => `${String(12345678 + i * 104729)}.${String((i * 53) % 100).padStart(2, '0')}`,
    );
    const r = calculated(
      run([
        ...incomes.map((a, i) =>
          fact(e('INCOME', i % 2 === 0 ? 'EMPLOYMENT' : 'BUSINESS'), known(a)),
        ),
        ...expenses.map((a, i) =>
          fact(e('EXPENSE', i % 2 === 0 ? 'HOUSEHOLD' : 'BUSINESS'), known(a)),
        ),
        fact(e('INCOME', 'TREASURE'), known('99999999999999.99')),
      ]),
    );
    const gross = sum(...incomes);
    const deductions = sum(...expenses);
    expectExact(stepValue(r, `${surplus}:gross`), gross);
    expectExact(stepValue(r, `${surplus}:deductions`), deductions);
    expectExact(output(r, surplus), floored(gross, deductions).percentage(D('12.5')));
    // 99 999 999 999 999.99 × 17.5 % = 17 499 999 999 999.998250 (more places than the currency).
    expectExact(output(r, treasure), D('17499999999999.99825'));
    expect(r.mapping.trace).toHaveLength(201);
    expectTrace(r, main, marjaId);
  });
});

// ── Confirmations (conditions), unanswered questions and unverified rules ───────────────────

const CONDITION_LABEL = 'TEST confirmation (engineering value, not a ruling)';
const condition = (
  scope: BuilderCondition['scope'],
  effect: BuilderCondition['effect'],
): BuilderCondition => ({ scope, effect, label: CONDITION_LABEL, entries: [] });

describe.each(MARJAS)('confirmations and review stops with TEST verified packs (%s)', (marjaId) => {
  const withCondition = (scope: BuilderCondition['scope'], effect: BuilderCondition['effect']) => {
    const publication = publishTestPack(marjaId, [
      {
        category: 'ANNUAL_SURPLUS',
        rate: '10',
        includedEntries: [e('INCOME', 'EMPLOYMENT')],
        conditions: [condition(scope, effect)],
      },
    ]);
    const [ruleId = ''] = publication.packRuleIds;
    const questionId = `${ruleId}:${scope === 'ENTRY' ? 'entry-confirm' : 'confirm'}:0`;
    const facts = [fact(e('INCOME', 'EMPLOYMENT'), known('3000.00'), { id: 'salary' })];
    const entryAnswers = (value: boolean): FactAnswers => ({
      salary: {
        workflow: 'annual',
        kind: 'INCOME',
        subtype: 'EMPLOYMENT',
        answers: { [questionId]: value },
      },
    });
    const answer = (value: boolean | null) => {
      const answers: Answers =
        scope === 'CALCULATION' && value !== null ? { [questionId]: value } : {};
      const factAnswers = scope === 'ENTRY' && value !== null ? entryAnswers(value) : {};
      return runVerifiedAssessment(sheet(facts), publication.bundle, answers, factAnswers);
    };
    return { publication, ruleId, questionId, answer };
  };
  const counted = D('3000.00').percentage(D('10'));
  // By hand: 3000.00 × 10 / 100 = 300.
  it('the counted figure matches the hand-computed value', () => {
    expect(counted.equals(D('300'))).toBe(true);
    const c = withCondition('CALCULATION', 'EXCLUDE');
    expectExact(output(calculated(c.answer(false)), c.ruleId), D('300'));
  });

  it('calculation scope EXCLUDE: yes gives zero, no counts', () => {
    const c = withCondition('CALCULATION', 'EXCLUDE');
    expectExact(output(calculated(c.answer(true)), c.ruleId), Decimal.ZERO);
    expectExact(output(calculated(c.answer(false)), c.ruleId), counted);
  });

  it('calculation scope INCLUDE: yes counts, no gives zero', () => {
    const c = withCondition('CALCULATION', 'INCLUDE');
    expectExact(output(calculated(c.answer(true)), c.ruleId), counted);
    expectExact(output(calculated(c.answer(false)), c.ruleId), Decimal.ZERO);
  });

  it('calculation scope STOP_FOR_REVIEW: yes stops that figure for review, no counts', () => {
    const c = withCondition('CALCULATION', 'STOP_FOR_REVIEW');
    const stopped = calculated(c.answer(true));
    expect(output(stopped, c.ruleId)).toBeNull();
    expect(stopped.report.result.status).toBe('UNRESOLVED');
    expect(stopped.report.result.unresolved).toEqual([
      expect.objectContaining({ kind: 'CONSULTATION_REQUIRED', label: CONDITION_LABEL }),
    ]);
    expectExact(output(calculated(c.answer(false)), c.ruleId), counted);
  });

  it('calculation scope, unanswered: the required confirmation is never assumed', () => {
    for (const effect of ['EXCLUDE', 'INCLUDE', 'STOP_FOR_REVIEW'] as const) {
      const c = withCondition('CALCULATION', effect);
      const outcome = c.answer(null);
      // The engine refuses to calculate without the required answer: no figure at all.
      expect(outcome.kind).toBe('REFUSED');
      if (outcome.kind !== 'REFUSED') continue;
      expect(outcome.refusal.issues.map((i) => i.code)).toContain('INPUT_MISSING_REQUIRED_ANSWER');
    }
  });

  it('entry scope EXCLUDE / INCLUDE / STOP_FOR_REVIEW act on that entry only', () => {
    const exclude = withCondition('ENTRY', 'EXCLUDE');
    const excluded = calculated(exclude.answer(true));
    expect(excluded.mapping.trace[0]?.outcome).toBe('EXCLUDED');
    expectExact(output(excluded, exclude.ruleId), Decimal.ZERO);
    expectExact(output(calculated(exclude.answer(false)), exclude.ruleId), counted);

    const include = withCondition('ENTRY', 'INCLUDE');
    expectExact(output(calculated(include.answer(true)), include.ruleId), counted);
    const notIncluded = calculated(include.answer(false));
    expect(notIncluded.mapping.trace[0]?.outcome).toBe('EXCLUDED');
    expectExact(output(notIncluded, include.ruleId), Decimal.ZERO);

    const stop = withCondition('ENTRY', 'STOP_FOR_REVIEW');
    const stopped = stop.answer(true);
    expect(stopped.kind).toBe('NEEDS_INPUT');
    if (stopped.kind === 'NEEDS_INPUT') {
      expect(stopped.mapping.consultations).toEqual([
        { factId: 'salary', consultationId: `${stop.ruleId}:stop:0` },
      ]);
    }
    expectExact(output(calculated(stop.answer(false)), stop.ruleId), counted);
  });

  it('entry scope, unanswered: the person is asked (missing answer), nothing is assumed', () => {
    for (const effect of ['EXCLUDE', 'INCLUDE', 'STOP_FOR_REVIEW'] as const) {
      const c = withCondition('ENTRY', effect);
      const outcome = c.answer(null);
      expect(outcome.kind).toBe('NEEDS_INPUT');
      if (outcome.kind !== 'NEEDS_INPUT') continue;
      expect(outcome.mapping.clarifications).toEqual([
        {
          factId: 'salary',
          reason: 'QUESTION_UNANSWERED',
          dateField: null,
          questionId: c.questionId,
        },
      ]);
    }
  });

  it('an unverified rule in the pack is a review stop: its entries never produce a figure', () => {
    const publication = publishTestPack(
      marjaId,
      [{ category: 'ANNUAL_SURPLUS', rate: '12.5', includedEntries: [e('INCOME', 'EMPLOYMENT')] }],
      [{ category: 'TREASURE', rate: '17.5', includedEntries: [e('INCOME', 'TREASURE')] }],
    );
    // Only the verified rule is in the PRODUCTION pack (APPROVED); the other is withheld.
    expect(publication.pack.rules.map((r) => [r.id, r.status])).toEqual([
      [publication.packRuleIds[0], 'APPROVED'],
    ]);
    const outcome = runVerifiedAssessment(
      sheet([
        fact(e('INCOME', 'EMPLOYMENT'), known('1000.00')),
        fact(e('INCOME', 'TREASURE'), known('500.00'), { id: 'withheld' }),
      ]),
      publication.bundle,
    );
    expect(outcome.kind).toBe('NEEDS_INPUT');
    if (outcome.kind !== 'NEEDS_INPUT') return;
    expect(outcome.mapping.consultations).toEqual([
      { factId: 'withheld', consultationId: 'builder:not-verified' },
    ]);
    // Without that entry the verified rule calculates normally.
    const alone = calculated(
      runVerifiedAssessment(
        sheet([fact(e('INCOME', 'EMPLOYMENT'), known('1000.00'))]),
        publication.bundle,
      ),
    );
    expectExact(output(alone, publication.packRuleIds[0] ?? ''), D('125'));
    expectTrace(alone, publication, marjaId);
  });
});
