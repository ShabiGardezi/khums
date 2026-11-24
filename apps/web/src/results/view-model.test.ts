import { describe, expect, it } from 'vitest';

import { runDevelopmentAssessment } from '@khums/core';
import type {
  CalculationReport,
  Expression,
  FinancialFact,
  FinancialFactSheet,
  RulePack,
} from '@khums/shared-types';

import { createDevelopmentMockPack } from '../server/development/mock-rule-pack';
import {
  assessmentQuestions,
  citedRules,
  citedRuling,
  citedSources,
  deductedCategoryIds,
  factQuestionIds,
  labelOf,
  resultLabel,
  summarizeResult,
} from './view-model';

const pack = createDevelopmentMockPack();

describe('results view model', () => {
  it('separates per-entry questions from assessment questions', () => {
    expect([...factQuestionIds(pack)]).toEqual(['mock-count-item']);
    expect(assessmentQuestions(pack).map((q) => q.id)).toEqual(['mock-flag', 'mock-choice']);
  });

  it('looks up cited rules and sources in order, skipping unknown ids', () => {
    expect(citedRules(pack, ['mock-rule-rate', 'missing']).map((r) => r.id)).toEqual([
      'mock-rule-rate',
    ]);
    expect(citedSources(pack, ['mock-source-2', 'mock-source-1']).map((s) => s.locator)).toEqual([
      'sample §2',
      'sample §1',
    ]);
    expect(labelOf(pack.inputCategories, 'mock-bucket-b')).toContain('sample bucket B');
    expect(labelOf(pack.inputCategories, null)).toBeNull();
  });

  it('labels anything that is not an approved, non-mock production result as MOCK', () => {
    const meta = (
      guidance: 'APPROVED_RULE_PACK' | 'PROVISIONAL_SCHOLAR_REVIEW' | 'NOT_RELIGIOUS_GUIDANCE',
      isMock: boolean,
    ) =>
      ({ meta: { guidance, rulePack: { isMock } } }) as unknown as Pick<CalculationReport, 'meta'>;
    expect(resultLabel(meta('NOT_RELIGIOUS_GUIDANCE', true))).toBe('MOCK');
    expect(resultLabel(meta('NOT_RELIGIOUS_GUIDANCE', false))).toBe('MOCK');
    expect(resultLabel(meta('APPROVED_RULE_PACK', true))).toBe('MOCK');
    expect(resultLabel(meta('APPROVED_RULE_PACK', false))).toBe('APPROVED');
    // M4.5a: provisional results carry their own label, never MOCK and never APPROVED.
    expect(resultLabel(meta('PROVISIONAL_SCHOLAR_REVIEW', false))).toBe('PROVISIONAL');
    expect(resultLabel(meta('PROVISIONAL_SCHOLAR_REVIEW', true))).toBe('MOCK');
  });
});

describe('ruling provenance in the breakdown (M5.4)', () => {
  const ref = '01936b2e-7c4a-7d3e-9f10-1a2b3c4d5e6f@1';
  const withSnapshot = {
    ...pack,
    rules: pack.rules.map((r, i) => (i === 0 ? { ...r, rulingRefs: [ref] } : r)),
    rulingSnapshots: [
      {
        ref,
        marjaId: pack.metadata.marjaId,
        displayRef: 'R-test-AAAAAAAA',
        rulingSeriesId: '01936b2e-7c4a-7d3e-9f10-1a2b3c4d5e6f',
        rulingVersion: 1,
        state: 'DRAFT' as const,
        contentRevision: 0,
        payloadDigest: 'a'.repeat(64),
        contentRecordDigest: 'b'.repeat(64),
        payload: {},
        findings: [
          {
            entityId: 'f',
            displayRef: 'F-test-INC-01-AAAAAAAA',
            revision: 2,
            recordDigest: 'c'.repeat(64),
            contentRevision: 0,
            payloadDigest: 'd'.repeat(64),
            questionId: 'INC-01',
            passageRefs: [],
          },
        ],
        passages: [
          {
            entityId: 'p',
            displayRef: 'P-test-AAAAAAAA',
            revision: 1,
            recordDigest: 'e'.repeat(64),
            contentRevision: 0,
            payloadDigest: 'f'.repeat(64),
            locator: { page: '12', masalah: null },
            originalLanguage: 'fa',
            text: null,
            source: {
              entityId: 's',
              displayRef: 'S-test-AAAAAAAA',
              revision: 1,
              recordDigest: '0'.repeat(64),
              title: 'TEST synthetic source',
              copyright: 'UNKNOWN',
            },
          },
        ],
      },
    ],
  };

  it('shows the cited ruling version with its findings and passages from this pack version', () => {
    const firstRule = withSnapshot.rules[0];
    if (firstRule === undefined) throw new Error('fixture');
    expect(citedRules(withSnapshot, [firstRule.id])[0]?.rulings).toEqual([
      {
        ref,
        snapshot: {
          displayRef: 'R-test-AAAAAAAA',
          version: 1,
          state: 'DRAFT',
          findings: ['F-test-INC-01-AAAAAAAA (INC-01)'],
          passages: ['P-test-AAAAAAAA: page 12 — TEST synthetic source'],
        },
      },
    ]);
  });

  it('says so when the pack version carries no snapshot for a reference', () => {
    expect(citedRuling(pack, ref)).toEqual({ ref, snapshot: null });
  });
});

describe('result summary (Phase 3 step 4)', () => {
  const known = (date: string) => ({ status: 'KNOWN' as const, date });
  const fact = (
    id: string,
    kind: FinancialFact['kind'],
    subtype: string,
    amount: string,
  ): FinancialFact =>
    ({
      id,
      kind,
      subtype,
      label: null,
      note: null,
      currency: 'USD',
      value: { status: 'KNOWN', amount },
      periodId: null,
      ...(kind === 'INCOME'
        ? { receivedOn: known('2025-03-01') }
        : kind === 'EXPENSE'
          ? { paidOn: known('2025-03-01') }
          : kind === 'LIABILITY'
            ? {
                valuedOn: known('2025-03-01'),
                incurredOn: { status: 'NOT_PROVIDED' },
                dueOn: { status: 'NOT_PROVIDED' },
              }
            : kind === 'ASSET'
              ? { valuedOn: known('2025-03-01'), acquiredOn: { status: 'NOT_PROVIDED' } }
              : { valuedOn: known('2025-03-01') }),
    }) as FinancialFact;
  const sheet = (...facts: FinancialFact[]): FinancialFactSheet => ({
    schemaVersion: 1,
    currency: 'USD',
    context: { workflow: 'annual', period: { start: '2025-01-01', end: '2025-12-31' } },
    facts,
  });
  const run = (s: FinancialFactSheet, answers = {}, factAnswers = {}) => {
    const r = runDevelopmentAssessment(s, pack, answers, factAnswers);
    if (r.kind === 'NOT_A_DEVELOPMENT_PACK') throw new Error('fixture');
    return r;
  };

  it('reads deducted categories from the program structure only', () => {
    expect([...deductedCategoryIds(pack, 'annual')]).toEqual(['mock-bucket-c']);
    expect([...deductedCategoryIds(pack, 'first-time')]).toEqual(['mock-bucket-c']);
    expect([...deductedCategoryIds(pack, 'missed-year')]).toEqual(['mock-bucket-c']);
    // A subtraction inside a subtrahend adds back; a category on both sides is not "deducted".
    const nested: RulePack = {
      ...pack,
      workflows: {
        ...pack.workflows,
        annual: {
          steps: [
            {
              id: 's',
              label: 'TEST',
              ruleIds: [],
              rounding: null,
              expression: {
                op: 'subtract',
                minuend: { op: 'sumCategories', categoryIds: ['mock-bucket-a'] },
                subtrahends: [
                  {
                    op: 'subtract',
                    minuend: { op: 'sumCategories', categoryIds: ['mock-bucket-c'] },
                    subtrahends: [
                      { op: 'sumCategories', categoryIds: ['mock-bucket-b', 'mock-bucket-a'] },
                    ],
                  },
                ],
              },
            },
          ],
          outputs: [{ id: 'o', label: 'TEST', stepId: 's' }],
        },
        firstTime: null,
      },
    };
    expect([...deductedCategoryIds(nested, 'annual')]).toEqual(['mock-bucket-c']);
    expect([...deductedCategoryIds(nested, 'first-time')]).toEqual([]);
  });

  // Audit L-3: only a category whose sign is certain is labelled "deducted".
  it('labels nothing as deducted when the sign is not certain', () => {
    const program = (expression: Expression): RulePack => ({
      ...pack,
      parameters: [
        ...pack.parameters,
        { id: 'test-negative', label: 'TEST', value: '-1', ruleIds: [] },
      ],
      workflows: {
        ...pack.workflows,
        annual: {
          steps: [{ id: 's', label: 'TEST', ruleIds: [], rounding: null, expression }],
          outputs: [{ id: 'o', label: 'TEST', stepId: 's' }],
        },
      },
    });
    const a = { op: 'sumCategories', categoryIds: ['mock-bucket-a'] } as const;
    const c = { op: 'sumCategories', categoryIds: ['mock-bucket-c'] } as const;
    const minus = { op: 'subtract', minuend: a, subtrahends: [c] } as const;
    const deducted = (e: Expression) => [...deductedCategoryIds(program(e), 'annual')];
    // A non-negative pack parameter keeps the sign (either operand position).
    expect(
      deducted({
        op: 'percentage',
        of: minus,
        rate: { op: 'parameter', parameterId: 'mock-rate' },
      }),
    ).toEqual(['mock-bucket-c']);
    expect(
      deducted({
        op: 'multiply',
        value: { op: 'parameter', parameterId: 'mock-rate' },
        factor: minus,
      }),
    ).toEqual(['mock-bucket-c']);
    // A negative or unknown factor, or a computed one: the sign is not certain.
    expect(
      deducted({
        op: 'percentage',
        of: minus,
        rate: { op: 'parameter', parameterId: 'test-negative' },
      }),
    ).toEqual([]);
    expect(
      deducted({
        op: 'multiply',
        value: minus,
        factor: { op: 'parameter', parameterId: 'missing' },
      }),
    ).toEqual([]);
    expect(deducted({ op: 'multiply', value: minus, factor: a })).toEqual([]);
    // Used in a condition as well: not certain.
    expect(
      deducted({
        op: 'when',
        condition: { kind: 'compare', left: c, operator: 'gt', right: { op: 'zero' } },
        then: minus,
        otherwise: { op: 'zero' },
      }),
    ).toEqual([]);
    expect(
      deducted({
        op: 'when',
        condition: { kind: 'answer', questionId: 'mock-flag', equals: true },
        then: { op: 'zero' },
        otherwise: minus,
      }),
    ).toEqual(['mock-bucket-c']);
  });

  it('lists counted, deducted and left-out entries and the figures exactly as returned', () => {
    const s = sheet(
      fact('cash', 'BALANCE', 'CASH', '1000'),
      fact('loan', 'LIABILITY', 'LOAN', '300'),
      fact('food', 'EXPENSE', 'HOUSEHOLD', '50'),
    );
    const factAnswers = {
      food: {
        workflow: 'annual' as const,
        kind: 'EXPENSE' as const,
        subtype: 'HOUSEHOLD',
        answers: { 'mock-count-item': false },
      },
    };
    const r = run(s, { 'mock-flag': false }, factAnswers);
    if (r.kind !== 'CALCULATED') throw new Error(r.kind);
    const summary = summarizeResult(pack, r.mapping, r.report);
    expect(summary.calculated).toBe(true);
    expect(summary.completed).toBe(true);
    expect(summary.counted).toEqual([
      { factId: 'cash', categoryId: 'mock-bucket-a', amount: '1000' },
    ]);
    expect(summary.deducted).toEqual([
      { factId: 'loan', categoryId: 'mock-bucket-c', amount: '300' },
    ]);
    expect(summary.excluded.map((e) => e.factId)).toEqual(['food']);
    expect(summary.figures.map((f) => [f.id, f.value?.amount, f.reasons])).toEqual([
      ['mock-net-output', '700', []],
      ['mock-share-output', '87.5', []],
    ]);
    expect(summary.stops).toEqual([]);
    expect(summary.pack.packId).toBe('development-mock-pack');
    expect(summary.pack.contentDigest).toMatch(/^[0-9a-f]{64}$/);
  });

  it('gives the reason a figure was not calculated, and lists the open item', () => {
    const r = run(sheet(fact('cash', 'BALANCE', 'CASH', '10')), { 'mock-flag': true });
    if (r.kind !== 'CALCULATED') throw new Error(r.kind);
    const summary = summarizeResult(pack, r.mapping, r.report);
    expect(summary.completed).toBe(false);
    const share = summary.figures.find((f) => f.id === 'mock-share-output');
    expect(share?.value).toBeNull();
    expect(share?.reasons).toEqual([expect.stringContaining('sample consultation')]);
    expect(summary.stops).toEqual([
      {
        kind: 'UNRESOLVED',
        unresolved: 'CONSULTATION_REQUIRED',
        label: expect.stringContaining('sample consultation'),
      },
    ]);
  });

  it('when nothing is calculated: no entry is listed as counted; every stop has its reason', () => {
    const r = run(
      sheet(
        fact('cash', 'BALANCE', 'CASH', '10'),
        fact('other', 'BALANCE', 'OTHER', '5'),
        fact('food', 'EXPENSE', 'HOUSEHOLD', '50'),
      ),
    );
    expect(r.kind).toBe('NEEDS_INPUT');
    const summary = summarizeResult(pack, r.mapping, null);
    expect(summary.calculated).toBe(false);
    expect(summary.figures).toEqual([]);
    expect(summary.counted).toEqual([]);
    expect(summary.excluded).toEqual([]);
    expect(summary.stops).toEqual([
      { kind: 'CONSULTATION', factId: 'other', label: expect.stringContaining('one item') },
      {
        kind: 'CLARIFICATION',
        factId: 'food',
        reason: 'QUESTION_UNANSWERED',
        questionLabel: expect.stringContaining('count this item'),
      },
    ]);
    expect(summary.pack.packId).toBe('development-mock-pack');
  });
  it('a refusal for a missing required answer names the question; other refusals say "not run"', () => {
    const firstTime: FinancialFactSheet = {
      schemaVersion: 1,
      currency: 'USD',
      context: { workflow: 'first-time', assessmentDate: '2025-12-31' },
      facts: [fact('cash', 'BALANCE', 'CASH', '10')],
    };
    const r = runDevelopmentAssessment(firstTime, pack, {});
    if (r.kind !== 'REFUSED') throw new Error(r.kind);
    const summary = summarizeResult(pack, r.mapping, null, r.refusal);
    expect(summary.calculated).toBe(false);
    expect(summary.stops).toEqual([
      {
        kind: 'UNRESOLVED',
        unresolved: 'MISSING_ANSWER',
        label: expect.stringContaining('sample choice'),
      },
    ]);
    const other = summarizeResult(pack, r.mapping, null, {
      ...r.refusal,
      issues: [{ code: 'INPUT_INVALID_DATE', severity: 'error', message: 'TEST', path: null }],
    });
    expect(other.stops).toEqual([{ kind: 'REFUSED' }]);
  });
});
