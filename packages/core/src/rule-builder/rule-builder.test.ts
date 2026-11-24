import { describe, expect, it } from 'vitest';

import { calculate, validateRulePackStructure } from '@khums/calculation-engine';
import type { RulePack } from '@khums/shared-types';
import {
  BUILDER_REQUIREMENT_FLAGS,
  builderRuleContentSchema,
  rulePackSchema,
  type BuilderRuleContent,
  type ScholarRuleRevision,
  type TestScholarRulesRequest,
} from '@khums/validation';

import { context, marjaScope, principal } from '../authorization/test-support';
import { prepareAssessmentInput } from '../financial/prepare-input';
import {
  BUILDER_CAPABILITIES,
  BUILDER_TEST_PACK_VERSION,
  builderPackRuleId,
  builderTestSheet,
  checkDeveloperRequirements,
  checkVerificationPreconditions,
  classifyBuilderRules,
  compileBuilderPack,
  nextRuleRevision,
  replayRuleRevisions,
  runBuilderTest,
  validateBuilderRule,
} from './index';

/**
 * TEST VALUES ONLY: categories are exercised with deliberately arbitrary, non-religious numbers
 * (rate 12.5, entries 1000.00 …). Nothing here states how any Marja treats anything.
 */

const MARJA = 'test-marja';
const RULING = '01890000-0000-7000-8000-0000000000a1';
const SOURCE = '01890000-0000-7000-8000-0000000000b1';
const RULE_A = '01890000-0000-7000-8000-000000000001';
const RULE_B = '01890000-0000-7000-8000-000000000002';
const SOURCES = { [SOURCE]: { title: 'TEST source', url: null, locator: 'TEST page 1' } };

const content = (overrides: Partial<BuilderRuleContent> = {}): BuilderRuleContent => ({
  category: 'ANNUAL_SURPLUS',
  rulingId: RULING,
  rate: '12.5',
  includedEntries: [{ kind: 'INCOME', subtype: 'EMPLOYMENT' }],
  deductions: [],
  conditions: [],
  exceptions: [],
  threshold: null,
  sourceRefs: [SOURCE],
  requirementFlags: [],
  otherRequirement: null,
  notes: null,
  ...overrides,
});

const revision = (
  ruleId: string,
  c: BuilderRuleContent,
  overrides: Partial<ScholarRuleRevision> = {},
): ScholarRuleRevision => ({
  ruleId,
  revision: 0,
  marjaId: MARJA,
  content: c,
  rulingVersion: c.rulingId === null ? null : 1,
  actor: 'test-scholar',
  at: '2026-11-20T10:00:00.000Z',
  reason: 'TEST save',
  ...overrides,
});

const compile = (
  revisions: ScholarRuleRevision[],
  channel: 'SCHOLAR_REVIEW' | 'PRODUCTION' = 'SCHOLAR_REVIEW',
) =>
  compileBuilderPack({
    marjaId: MARJA,
    version: '1.0.0',
    releaseChannel: channel,
    effectiveFrom: '2000-01-01',
    revisions,
    sources: SOURCES,
  });

const compiledPack = (revisions: ScholarRuleRevision[]): RulePack => {
  const result = compile(revisions);
  if (!result.ok) throw new Error(result.error.code);
  return result.value.pack;
};

const test = (overrides: Partial<TestScholarRulesRequest> = {}): TestScholarRulesRequest => ({
  marjaId: MARJA,
  currency: 'USD',
  period: { start: '2025-01-01', end: '2025-12-31' },
  entries: [],
  answers: {},
  entryAnswers: {},
  ...overrides,
});

/** Runs a compiled pack on test entries in scholar-review mode; returns output values by id. */
function run(pack: RulePack, request: TestScholarRulesRequest) {
  const factAnswers = Object.fromEntries(
    Object.entries(request.entryAnswers).map(([id, answers]) => {
      const entry = request.entries.find((e) => e.id === id);
      if (entry === undefined) throw new Error(id);
      return [
        id,
        { workflow: 'annual' as const, kind: entry.kind, subtype: entry.subtype, answers },
      ];
    }),
  );
  const mapping = prepareAssessmentInput(
    builderTestSheet(request),
    pack,
    request.answers,
    factAnswers,
  );
  if (mapping.status !== 'MAPPED' || mapping.input === null) return { mapping, outputs: null };
  const result = calculate(mapping.input, pack, { mode: 'scholar-review' });
  if (!result.ok) throw new Error(result.error.reason);
  if (result.value.workflow !== 'annual') throw new Error('workflow');
  return {
    mapping,
    outputs: Object.fromEntries(
      result.value.result.outputs.map((o) => [o.id, o.value?.amount ?? null]),
    ),
    report: result.value,
  };
}

const result = (ruleId: string) => `${builderPackRuleId(ruleId)}:result`;

describe('builder rule schema', () => {
  it('accepts predefined fields and rejects anything else', () => {
    expect(builderRuleContentSchema.safeParse(content()).success).toBe(true);
    expect(builderRuleContentSchema.safeParse({ ...content(), expression: 'x' }).success).toBe(
      false,
    );
    expect(builderRuleContentSchema.safeParse({ ...content(), category: 'CODE' }).success).toBe(
      false,
    );
    expect(
      builderRuleContentSchema.safeParse(
        content({ includedEntries: [{ kind: 'INCOME', subtype: 'NOT_A_SUBTYPE' }] }),
      ).success,
    ).toBe(false);
    expect(builderRuleContentSchema.safeParse({ ...content(), rate: 12.5 }).success).toBe(false);
    expect(
      builderRuleContentSchema.safeParse(
        content({
          conditions: [{ scope: 'ENTRY', label: 'x'.repeat(301), effect: 'EXCLUDE', entries: [] }],
        }),
      ).success,
    ).toBe(false);
  });
});

describe('validateBuilderRule', () => {
  it('a complete supported rule is ready for verification', () => {
    expect(validateBuilderRule(content())).toEqual({
      status: 'READY_FOR_VERIFICATION',
      errors: [],
      missing: [],
      requirement: { status: 'SUPPORTED', capabilities: [] },
    });
  });

  it('lists what a draft lacks; the rate is never defaulted', () => {
    const check = validateBuilderRule(
      content({ rulingId: null, rate: null, includedEntries: [], sourceRefs: [] }),
    );
    expect(check.status).toBe('DRAFT');
    expect(check.errors).toEqual([]);
    expect(check.missing.map((m) => m.code).sort()).toEqual([
      'ENTRIES_REQUIRED',
      'RATE_REQUIRED',
      'RULING_REQUIRED',
      'SOURCES_REQUIRED',
    ]);
  });

  it.each([
    ['RATE_INVALID', content({ rate: '0' })],
    ['RATE_INVALID', content({ rate: '100.01' })],
    [
      'THRESHOLD_AMOUNT_INVALID',
      content({
        threshold: {
          amount: '-1',
          currency: 'USD',
          basis: 'BEFORE_DEDUCTIONS',
          effect: 'NOT_COUNTED',
        },
      }),
    ],
    [
      'ENTRY_DUPLICATE',
      content({
        includedEntries: [
          { kind: 'INCOME', subtype: 'GIFT' },
          { kind: 'INCOME', subtype: 'GIFT' },
        ],
      }),
    ],
    [
      'EXCEPTION_ALSO_INCLUDED',
      content({ exceptions: [{ kind: 'INCOME', subtype: 'EMPLOYMENT' }] }),
    ],
    [
      'EXCEPTION_DUPLICATE',
      content({
        exceptions: [
          { kind: 'INCOME', subtype: 'GIFT' },
          { kind: 'INCOME', subtype: 'GIFT' },
        ],
      }),
    ],
    [
      'DEDUCTION_TYPE_DUPLICATE',
      content({
        deductions: [
          { type: 'LIVING_EXPENSES', entries: [{ kind: 'EXPENSE', subtype: 'HOUSEHOLD' }] },
          { type: 'LIVING_EXPENSES', entries: [{ kind: 'EXPENSE', subtype: 'HEALTH' }] },
        ],
      }),
    ],
    [
      'DEDUCTION_ENTRY_KIND',
      content({
        deductions: [
          { type: 'DEDUCTIBLE_DEBTS', entries: [{ kind: 'EXPENSE', subtype: 'HOUSEHOLD' }] },
        ],
      }),
    ],
    [
      'DEDUCTION_ENTRY_DUPLICATE',
      content({
        deductions: [
          { type: 'LIVING_EXPENSES', entries: [{ kind: 'EXPENSE', subtype: 'HOUSEHOLD' }] },
          { type: 'COSTS_OF_EARNING', entries: [{ kind: 'EXPENSE', subtype: 'HOUSEHOLD' }] },
        ],
      }),
    ],
    [
      'DEDUCTION_ENTRY_ALSO_COUNTED',
      content({
        includedEntries: [{ kind: 'EXPENSE', subtype: 'HOUSEHOLD' }],
        deductions: [
          { type: 'LIVING_EXPENSES', entries: [{ kind: 'EXPENSE', subtype: 'HOUSEHOLD' }] },
        ],
      }),
    ],
    [
      'CONDITION_ENTRY_NOT_INCLUDED',
      content({
        conditions: [
          {
            scope: 'ENTRY',
            label: 'TEST question',
            effect: 'EXCLUDE',
            entries: [{ kind: 'INCOME', subtype: 'GIFT' }],
          },
        ],
      }),
    ],
    [
      'CONDITION_ENTRIES_NOT_ALLOWED',
      content({
        conditions: [
          {
            scope: 'CALCULATION',
            label: 'TEST question',
            effect: 'EXCLUDE',
            entries: [{ kind: 'INCOME', subtype: 'EMPLOYMENT' }],
          },
        ],
      }),
    ],
    [
      'CONDITION_ENTRY_DUPLICATE',
      content({
        conditions: [
          {
            scope: 'ENTRY',
            label: 'TEST question',
            effect: 'EXCLUDE',
            entries: [
              { kind: 'INCOME', subtype: 'EMPLOYMENT' },
              { kind: 'INCOME', subtype: 'EMPLOYMENT' },
            ],
          },
        ],
      }),
    ],
    ['SOURCE_DUPLICATE', content({ sourceRefs: [SOURCE, SOURCE] })],
    ['FLAG_DUPLICATE', content({ requirementFlags: ['CARRY_OVER', 'CARRY_OVER'] })],
    ['OTHER_REQUIREMENT_REQUIRED', content({ requirementFlags: ['OTHER'] })],
    ['OTHER_REQUIREMENT_WITHOUT_FLAG', content({ otherRequirement: 'TEST need' })],
  ] as const)('reports %s and is never ready', (code, c) => {
    const check = validateBuilderRule(c);
    expect(check.errors.map((e) => e.code)).toContain(code);
    expect(check.status).toBe('DRAFT');
  });
});

describe('developer-requirement check (capability table)', () => {
  it.each(BUILDER_REQUIREMENT_FLAGS)('flag %s requires a developer implementation', (flag) => {
    const c = content({
      requirementFlags: [flag],
      otherRequirement: flag === 'OTHER' ? 'TEST need described by the scholar' : null,
    });
    expect(checkDeveloperRequirements(c)).toEqual({
      status: 'DEVELOPER_IMPLEMENTATION_REQUIRED',
      capabilities: [{ code: `FLAG_${flag}`, field: 'requirementFlags' }],
    });
    expect(validateBuilderRule(c).status).toBe('DEVELOPER_IMPLEMENTATION_REQUIRED');
  });

  it('shows a developer need even on an incomplete draft', () => {
    expect(
      validateBuilderRule(content({ rulingId: null, requirementFlags: ['CARRY_OVER'] })).status,
    ).toBe('DEVELOPER_IMPLEMENTATION_REQUIRED');
  });

  it('a threshold is not supported yet (no money constant in the engine)', () => {
    const c = content({
      threshold: {
        amount: '10.00',
        currency: 'USD',
        basis: 'AFTER_DEDUCTIONS',
        effect: 'STOP_FOR_REVIEW',
      },
    });
    expect(checkDeveloperRequirements(c).capabilities).toEqual([
      { code: 'THRESHOLD_COMPARISON', field: 'threshold' },
    ]);
  });

  it('every category supports its template deductions and refuses the others', () => {
    for (const [category, template] of Object.entries(BUILDER_CAPABILITIES.categories)) {
      for (const type of ['LIVING_EXPENSES', 'COSTS_OF_EARNING', 'DEDUCTIBLE_DEBTS'] as const) {
        const kind = type === 'DEDUCTIBLE_DEBTS' ? 'LIABILITY' : 'EXPENSE';
        const subtype = type === 'DEDUCTIBLE_DEBTS' ? 'LOAN' : 'BUSINESS';
        const check = checkDeveloperRequirements(
          content({
            category: category as BuilderRuleContent['category'],
            deductions: [{ type, entries: [{ kind, subtype }] }],
          }),
        );
        const supported = (template.deductions as readonly string[]).includes(type);
        expect(check.status, `${category}/${type}`).toBe(
          supported ? 'SUPPORTED' : 'DEVELOPER_IMPLEMENTATION_REQUIRED',
        );
        if (!supported) {
          expect(check.capabilities).toEqual([
            { code: 'DEDUCTION_NOT_IN_TEMPLATE', field: 'deductions.0' },
          ]);
        }
      }
    }
  });

  it('supports every condition scope and effect of the template', () => {
    for (const scope of ['ENTRY', 'CALCULATION'] as const) {
      for (const effect of ['INCLUDE', 'EXCLUDE', 'STOP_FOR_REVIEW'] as const) {
        expect(
          checkDeveloperRequirements(
            content({ conditions: [{ scope, label: 'TEST question', effect, entries: [] }] }),
          ).status,
        ).toBe('SUPPORTED');
      }
    }
  });

  it('lists several gaps at once, in field order', () => {
    const check = checkDeveloperRequirements(
      content({
        category: 'MIXED_FUNDS',
        requirementFlags: ['DATES_OR_TIMING', 'CURRENCY_CONVERSION'],
        deductions: [
          { type: 'LIVING_EXPENSES', entries: [{ kind: 'EXPENSE', subtype: 'HOUSEHOLD' }] },
        ],
        threshold: {
          amount: '1',
          currency: 'USD',
          basis: 'BEFORE_DEDUCTIONS',
          effect: 'NOT_COUNTED',
        },
      }),
    );
    expect(check.capabilities.map((g) => g.code)).toEqual([
      'FLAG_DATES_OR_TIMING',
      'FLAG_CURRENCY_CONVERSION',
      'DEDUCTION_NOT_IN_TEMPLATE',
      'THRESHOLD_COMPARISON',
    ]);
  });
});

describe('compileBuilderPack', () => {
  it('produces a sealed schemaVersion 3 pack that passes structure validation and the strict schema', () => {
    const outcome = compile([revision(RULE_A, content())]);
    if (!outcome.ok) throw new Error(outcome.error.code);
    const { pack } = outcome.value;
    expect(validateRulePackStructure(pack).issues).toEqual([]);
    expect(rulePackSchema.safeParse(pack).success).toBe(true);
    expect(pack.metadata).toMatchObject({
      packId: 'test-marja-builder',
      version: '1.0.0',
      schemaVersion: 3,
      releaseChannel: 'SCHOLAR_REVIEW',
      status: 'IN_REVIEW',
      isMock: false,
    });
    expect(pack.metadata.title).toContain('PROVISIONAL — FOR SCHOLAR REVIEW ONLY');
    expect(pack.metadata.integrity?.digest).toMatch(/^[0-9a-f]{64}$/);
    expect(pack.rules).toEqual([
      expect.objectContaining({
        id: builderPackRuleId(RULE_A),
        status: 'UNVERIFIED',
        sourceRefs: [SOURCE],
        rulingRefs: [`${RULING}@1`],
      }),
    ]);
    expect(pack.sources).toEqual([
      { id: SOURCE, title: 'TEST source', url: null, locator: 'TEST page 1' },
    ]);
    expect(pack.parameters).toEqual([expect.objectContaining({ value: '12.5' })]);
    expect(pack.workflows.firstTime).toBeNull();
    expect(pack.workflows.missedYear).toBeNull();
    expect(outcome.value.compiled).toEqual([
      {
        ruleId: RULE_A,
        revision: 0,
        packRuleId: builderPackRuleId(RULE_A),
        category: 'ANNUAL_SURPLUS',
        developerRequired: false,
      },
    ]);
  });

  it('uses the caller channel and version (PRODUCTION for step 5), rules stay UNVERIFIED', () => {
    const outcome = compile([revision(RULE_A, content())], 'PRODUCTION');
    if (!outcome.ok) throw new Error(outcome.error.code);
    expect(outcome.value.pack.metadata.releaseChannel).toBe('PRODUCTION');
    expect(outcome.value.pack.metadata.status).toBe('DRAFT');
    expect(outcome.value.pack.metadata.title).not.toContain('PROVISIONAL');
    expect(outcome.value.pack.rules.every((r) => r.status === 'UNVERIFIED')).toBe(true);
  });

  it('is deterministic (same revisions → same digest, whatever the order)', () => {
    const a = compiledPack([
      revision(RULE_A, content()),
      revision(
        RULE_B,
        content({
          category: 'TREASURE',
          includedEntries: [{ kind: 'INCOME', subtype: 'TREASURE' }],
        }),
      ),
    ]);
    const b = compiledPack([
      revision(
        RULE_B,
        content({
          category: 'TREASURE',
          includedEntries: [{ kind: 'INCOME', subtype: 'TREASURE' }],
        }),
      ),
      revision(RULE_A, content()),
    ]);
    expect(a.metadata.integrity).toEqual(b.metadata.integrity);
  });

  it('skips drafts and invalid content, and refuses when nothing is complete', () => {
    const draft = revision(RULE_A, content({ rulingId: null }));
    const outcome = compile([
      draft,
      revision(
        RULE_B,
        content({
          category: 'TREASURE',
          includedEntries: [{ kind: 'INCOME', subtype: 'TREASURE' }],
        }),
      ),
    ]);
    if (!outcome.ok) throw new Error(outcome.error.code);
    expect(outcome.value.skipped).toEqual([{ ruleId: RULE_A, revision: 0, reason: 'INCOMPLETE' }]);
    const invalid = revision(RULE_B, content({ rate: '0' }));
    const none = compile([draft, invalid]);
    expect(none.ok ? null : none.error.code).toBe('NO_COMPILABLE_RULES');
  });

  it('refuses an entry type claimed by two rules, other Marjas and duplicate rules', () => {
    const clash = compile([
      revision(RULE_A, content()),
      revision(RULE_B, content({ category: 'MIXED_FUNDS' })),
    ]);
    expect(clash.ok ? null : clash.error).toEqual({
      code: 'ENTRY_CLAIMED_BY_SEVERAL_RULES',
      ruleIds: [RULE_A, RULE_B],
      entry: 'INCOME:EMPLOYMENT',
      issues: [],
    });
    const other = compile([revision(RULE_A, content(), { marjaId: 'other-marja' })]);
    expect(other.ok ? null : other.error.code).toBe('REVISIONS_INVALID');
    const twice = compile([revision(RULE_A, content()), revision(RULE_A, content())]);
    expect(twice.ok ? null : twice.error.code).toBe('REVISIONS_INVALID');
  });

  it('refuses unresolved sources', () => {
    const outcome = compileBuilderPack({
      marjaId: MARJA,
      version: '1.0.0',
      releaseChannel: 'SCHOLAR_REVIEW',
      effectiveFrom: '2000-01-01',
      revisions: [revision(RULE_A, content())],
      sources: {},
    });
    expect(outcome.ok ? null : outcome.error.code).toBe('SOURCE_UNRESOLVED');
  });
});

describe('compiled template in the engine (exact decimals, TEST values)', () => {
  const income = (id: string, amount: string, subtype = 'EMPLOYMENT') =>
    ({ id, kind: 'INCOME', subtype, amount, date: '2025-06-01' }) as const;
  const expense = (id: string, amount: string, subtype = 'HOUSEHOLD') =>
    ({ id, kind: 'EXPENSE', subtype, amount, date: '2025-06-01' }) as const;

  it('rate on the included entries', () => {
    const pack = compiledPack([revision(RULE_A, content())]);
    const out = run(pack, test({ entries: [income('e1', '1000.00'), income('e2', '0.10')] }));
    // (1000.00 + 0.10) × 12.5 ÷ 100 = 125.0125 (no rounding: none was entered)
    expect(out.outputs).toEqual({ [result(RULE_A)]: '125.0125' });
  });

  it('deductions are subtracted and the counted amount never goes below zero', () => {
    const pack = compiledPack([
      revision(
        RULE_A,
        content({
          deductions: [
            { type: 'LIVING_EXPENSES', entries: [{ kind: 'EXPENSE', subtype: 'HOUSEHOLD' }] },
            { type: 'DEDUCTIBLE_DEBTS', entries: [{ kind: 'LIABILITY', subtype: 'LOAN' }] },
          ],
        }),
      ),
    ]);
    const loan = {
      id: 'l1',
      kind: 'LIABILITY',
      subtype: 'LOAN',
      amount: '100.00',
      date: '2025-06-01',
    } as const;
    const out = run(
      pack,
      test({ entries: [income('e1', '1000.00'), expense('x1', '300.00'), loan] }),
    );
    // (1000.00 − 300.00 − 100.00) × 12.5 ÷ 100 = 75
    expect(out.outputs).toEqual({ [result(RULE_A)]: '75' });
    const negative = run(pack, test({ entries: [income('e1', '10.00'), expense('x1', '300.00')] }));
    expect(negative.outputs).toEqual({ [result(RULE_A)]: '0' });
  });

  it('exceptions are excluded; an uncovered entry type stops for review', () => {
    const pack = compiledPack([
      revision(RULE_A, content({ exceptions: [{ kind: 'INCOME', subtype: 'GIFT' }] })),
    ]);
    const out = run(
      pack,
      test({ entries: [income('e1', '200.00'), income('g1', '999.00', 'GIFT')] }),
    );
    expect(out.outputs).toEqual({ [result(RULE_A)]: '25' });
    const stop = run(pack, test({ entries: [income('r1', '5.00', 'RENTAL')] }));
    expect(stop.outputs).toBeNull();
    expect(stop.mapping.status).toBe('CONSULTATION_REQUIRED');
    expect(stop.mapping.consultations).toEqual([
      { factId: 'r1', consultationId: 'builder:unmatched' },
    ]);
  });

  it('per-entry confirmations: EXCLUDE, INCLUDE and STOP_FOR_REVIEW', () => {
    const pack = compiledPack([
      revision(
        RULE_A,
        content({
          includedEntries: [
            { kind: 'INCOME', subtype: 'EMPLOYMENT' },
            { kind: 'INCOME', subtype: 'GIFT' },
          ],
          conditions: [
            { scope: 'ENTRY', label: 'TEST exclude?', effect: 'EXCLUDE', entries: [] },
            {
              scope: 'ENTRY',
              label: 'TEST include?',
              effect: 'INCLUDE',
              entries: [{ kind: 'INCOME', subtype: 'GIFT' }],
            },
            {
              scope: 'ENTRY',
              label: 'TEST stop?',
              effect: 'STOP_FOR_REVIEW',
              entries: [{ kind: 'INCOME', subtype: 'EMPLOYMENT' }],
            },
          ],
        }),
      ),
    ]);
    const q = (i: number, entry = true) =>
      `${builderPackRuleId(RULE_A)}:${entry ? 'entry-confirm' : 'confirm'}:${String(i)}`;
    const entries = [income('e1', '100.00'), income('g1', '40.00', 'GIFT')];
    // Unanswered → the user is asked, nothing assumed.
    expect(run(pack, test({ entries })).mapping.status).toBe('NEEDS_CLARIFICATION');
    const counted = run(
      pack,
      test({
        entries,
        entryAnswers: { e1: { [q(0)]: false, [q(2)]: false }, g1: { [q(0)]: false, [q(1)]: true } },
      }),
    );
    expect(counted.outputs).toEqual({ [result(RULE_A)]: '17.5' }); // 140 × 12.5%
    const excluded = run(
      pack,
      test({
        entries,
        entryAnswers: { e1: { [q(0)]: true }, g1: { [q(0)]: false, [q(1)]: false } },
      }),
    );
    expect(excluded.outputs).toEqual({ [result(RULE_A)]: '0' });
    const stopped = run(
      pack,
      test({
        entries,
        entryAnswers: { e1: { [q(0)]: false, [q(2)]: true }, g1: { [q(0)]: true } },
      }),
    );
    expect(stopped.mapping.status).toBe('CONSULTATION_REQUIRED');
    expect(stopped.mapping.consultations).toEqual([
      { factId: 'e1', consultationId: `${builderPackRuleId(RULE_A)}:stop:2` },
    ]);
  });

  it('once-per-calculation confirmations: EXCLUDE, INCLUDE and STOP_FOR_REVIEW', () => {
    const pack = compiledPack([
      revision(
        RULE_A,
        content({
          conditions: [
            { scope: 'CALCULATION', label: 'TEST exclude all?', effect: 'EXCLUDE', entries: [] },
            { scope: 'CALCULATION', label: 'TEST include all?', effect: 'INCLUDE', entries: [] },
            {
              scope: 'CALCULATION',
              label: 'TEST stop all?',
              effect: 'STOP_FOR_REVIEW',
              entries: [],
            },
          ],
        }),
      ),
    ]);
    const q = (i: number) => `${builderPackRuleId(RULE_A)}:confirm:${String(i)}`;
    const entries = [income('e1', '80.00')];
    const answers = (a: boolean, b: boolean, c: boolean) => ({ [q(0)]: a, [q(1)]: b, [q(2)]: c });
    expect(run(pack, test({ entries, answers: answers(false, true, false) })).outputs).toEqual({
      [result(RULE_A)]: '10',
    });
    expect(run(pack, test({ entries, answers: answers(true, true, false) })).outputs).toEqual({
      [result(RULE_A)]: '0',
    });
    expect(run(pack, test({ entries, answers: answers(false, false, false) })).outputs).toEqual({
      [result(RULE_A)]: '0',
    });
    const stopped = run(pack, test({ entries, answers: answers(false, true, true) }));
    expect(stopped.outputs).toEqual({ [result(RULE_A)]: null });
    expect(stopped.report?.result.unresolved.map((u) => u.id)).toEqual([
      `${builderPackRuleId(RULE_A)}:stop:2`,
    ]);
  });

  it('a developer-required rule compiles to a review stop, never an approximation', () => {
    const pack = compiledPack([
      revision(RULE_A, content({ requirementFlags: ['CARRY_OVER'] })),
      revision(
        RULE_B,
        content({
          category: 'TREASURE',
          includedEntries: [{ kind: 'INCOME', subtype: 'TREASURE' }],
        }),
      ),
    ]);
    const out = run(
      pack,
      test({ entries: [income('e1', '100.00'), income('t1', '8.00', 'TREASURE')] }),
    );
    expect(out.outputs).toEqual({ [result(RULE_A)]: null, [result(RULE_B)]: '1' });
    expect(out.report?.result.unresolved.map((u) => u.id)).toEqual([
      `${builderPackRuleId(RULE_A)}:developer`,
    ]);
    const due = pack.workflows.annual?.steps.find(
      (s) => s.id === `${builderPackRuleId(RULE_A)}:due`,
    );
    expect(due?.expression).toEqual({
      op: 'consult',
      consultationId: `${builderPackRuleId(RULE_A)}:developer`,
    });
    expect(pack.parameters.some((p) => p.id.startsWith(builderPackRuleId(RULE_A)))).toBe(false);
  });

  it('estimated amounts ask the user (never assumed)', () => {
    const pack = compiledPack([revision(RULE_A, content())]);
    const sheet = builderTestSheet(test({ entries: [income('e1', '1.00')] })) as {
      facts: { value: unknown }[];
    };
    const estimated = {
      ...sheet,
      facts: sheet.facts.map((f) => ({ ...f, value: { status: 'ESTIMATED', amount: '1.00' } })),
    };
    expect(prepareAssessmentInput(estimated, pack).status).toBe('NEEDS_CLARIFICATION');
  });
});

describe('rule revisions (append-only)', () => {
  const base = {
    ruleId: RULE_A,
    marjaId: MARJA,
    rulingVersion: 1,
    actor: 'test-scholar',
    at: '2026-11-20T10:00:00.000Z',
    reason: 'TEST save',
  };

  it('creates revision 0, then the next revision only on the read state', () => {
    const first = nextRuleRevision({
      ...base,
      history: [],
      expectedRevision: 0,
      content: content(),
    });
    if (!first.ok) throw new Error(first.error.code);
    expect(first.value.revision).toBe(0);
    const second = nextRuleRevision({
      ...base,
      history: [first.value],
      expectedRevision: 1,
      content: content({ rate: '13' }),
    });
    expect(second.ok && second.value.revision).toBe(1);
    const stale = nextRuleRevision({
      ...base,
      history: [first.value],
      expectedRevision: 0,
      content: content(),
    });
    expect(stale.ok ? null : stale.error.code).toBe('REVISION_CONFLICT');
  });

  it('saves drafts but never inconsistent content', () => {
    const draft = nextRuleRevision({
      ...base,
      history: [],
      expectedRevision: 0,
      content: content({ rulingId: null }),
    });
    expect(draft.ok && draft.value.rulingVersion).toBeNull();
    const invalid = nextRuleRevision({
      ...base,
      history: [],
      expectedRevision: 0,
      content: content({ rate: '0' }),
    });
    expect(invalid.ok ? null : invalid.error).toEqual({
      code: 'CONTENT_INVALID',
      errors: [{ code: 'RATE_INVALID', field: 'rate' }],
    });
    const malformed = nextRuleRevision({
      ...base,
      history: [],
      expectedRevision: 0,
      content: { code: 'x' },
    });
    expect(malformed.ok ? null : malformed.error.code).toBe('RECORD_INVALID');
    const noReason = nextRuleRevision({
      ...base,
      reason: '',
      history: [],
      expectedRevision: 0,
      content: content(),
    });
    expect(noReason.ok ? null : noReason.error.code).toBe('RECORD_INVALID');
  });

  it('replays stored revisions in order and fails closed on gaps or mixed rules', () => {
    const r0 = revision(RULE_A, content());
    const r1 = revision(RULE_A, content(), { revision: 1 });
    expect(replayRuleRevisions([r1, r0])?.map((r) => r.revision)).toEqual([0, 1]);
    expect(replayRuleRevisions([r1])).toBeNull();
    expect(replayRuleRevisions([r0, revision(RULE_B, content(), { revision: 1 })])).toBeNull();
    expect(replayRuleRevisions([])).toBeNull();
    expect(replayRuleRevisions([{ ...r0, extra: true }])).toBeNull();
    const forked = nextRuleRevision({
      ruleId: RULE_A,
      marjaId: MARJA,
      history: [r1],
      expectedRevision: 1,
      content: content(),
      rulingVersion: 1,
      actor: 'a',
      at: '2026-11-20T10:00:00.000Z',
      reason: 'TEST save',
    });
    expect(forked.ok ? null : forked.error.code).toBe('HISTORY_INVALID');
  });
});

describe('AI preparation and rejection (Phase 4, decision 76)', () => {
  const base = {
    ruleId: RULE_A,
    marjaId: MARJA,
    rulingVersion: 1,
    actor: 'test-staff',
    at: '2026-11-24T10:00:00.000Z',
    reason: 'TEST save',
  };
  const approved = { stage: 'APPROVED_FOR_SCHOLAR_TESTING', tool: 'TEST tool', tests: 'TEST-1' };

  it('records an AI approval for scholar testing only on complete, supported content', () => {
    const ok = nextRuleRevision({
      ...base,
      history: [],
      expectedRevision: 0,
      content: content(),
      aiPreparation: approved,
    });
    if (!ok.ok) throw new Error(ok.error.code);
    expect(ok.value.aiPreparation).toEqual(approved);
    expect(ok.value.rejected).toBeUndefined();
    const draft = nextRuleRevision({
      ...base,
      history: [],
      expectedRevision: 0,
      content: content({ rulingId: null }),
      aiPreparation: approved,
    });
    expect(draft.ok ? null : draft.error.code).toBe('AI_APPROVAL_INVALID');
    const developer = nextRuleRevision({
      ...base,
      history: [],
      expectedRevision: 0,
      content: content({ requirementFlags: ['CARRY_OVER'] }),
      aiPreparation: approved,
    });
    expect(developer.ok ? null : developer.error.code).toBe('AI_APPROVAL_INVALID');
    // An AI draft of an incomplete rule is fine: it is not offered as approved for testing.
    const aiDraft = nextRuleRevision({
      ...base,
      history: [],
      expectedRevision: 0,
      content: content({ rulingId: null }),
      aiPreparation: { ...approved, stage: 'DRAFT' },
    });
    expect(aiDraft.ok).toBe(true);
    const malformed = nextRuleRevision({
      ...base,
      history: [],
      expectedRevision: 0,
      content: content(),
      aiPreparation: { stage: 'VERIFIED', tool: 'x', tests: null },
    });
    expect(malformed.ok ? null : malformed.error.code).toBe('RECORD_INVALID');
  });

  it('a rejection is a new revision that cannot also be AI-approved', () => {
    const r0 = revision(RULE_A, content(), { aiPreparation: approved as never });
    const rejected = nextRuleRevision({
      ...base,
      history: [r0],
      expectedRevision: 1,
      content: content(),
      rejected: true,
    });
    if (!rejected.ok) throw new Error(rejected.error.code);
    expect(rejected.value).toMatchObject({ revision: 1, rejected: true });
    expect(rejected.value.aiPreparation).toBeUndefined();
    const both = nextRuleRevision({
      ...base,
      history: [r0],
      expectedRevision: 1,
      content: content(),
      rejected: true,
      aiPreparation: approved,
    });
    expect(both.ok ? null : both.error.code).toBe('AI_APPROVAL_INVALID');
  });

  it('an AI-approved rule compiles into the test pack; a rejected one never counts', () => {
    const ai = revision(RULE_A, content(), { aiPreparation: approved as never });
    const outcome = compile([
      ai,
      revision(
        RULE_B,
        content({
          category: 'TREASURE',
          includedEntries: [{ kind: 'INCOME', subtype: 'TREASURE' }],
        }),
        { revision: 3, rejected: true },
      ),
    ]);
    if (!outcome.ok) throw new Error(outcome.error.code);
    expect(outcome.value.compiled.map((c) => c.ruleId)).toEqual([RULE_A]);
    expect(outcome.value.skipped).toEqual([{ ruleId: RULE_B, revision: 3, reason: 'REJECTED' }]);
    expect(outcome.value.pack.rules.map((r) => r.status)).toEqual(['UNVERIFIED']);
    // Its entries are not claimed: a treasure entry never counts.
    const { mapping, outputs } = run(
      outcome.value.pack,
      test({
        entries: [
          { id: 'e1', kind: 'INCOME', subtype: 'TREASURE', amount: '100', date: '2025-05-01' },
        ],
      }),
    );
    expect(mapping.status).not.toBe('MAPPED');
    expect(outputs).toBeNull();
  });

  it('a rejected revision cannot be verified and is withheld from public versions', () => {
    const rejected = revision(RULE_A, content(), { revision: 1, rejected: true });
    expect(checkVerificationPreconditions(rejected, () => null).map((b) => b.code)).toContain(
      'RULE_REJECTED',
    );
    const { included, withheld } = classifyBuilderRules(
      [[revision(RULE_A, content()), rejected]],
      [],
      () => null,
    );
    expect(included).toEqual([]);
    expect(withheld.map((w) => w.reason)).toEqual(['NOT_READY']);
  });
});

describe('Phase 4: restricted deductions and confirmations on deductions', () => {
  const surplus = content({
    includedEntries: [
      { kind: 'INCOME', subtype: 'EMPLOYMENT' },
      { kind: 'INCOME', subtype: 'BUSINESS' },
    ],
    deductions: [
      {
        type: 'COSTS_OF_EARNING',
        entries: [
          { kind: 'EXPENSE', subtype: 'BUSINESS' },
          { kind: 'LIABILITY', subtype: 'BUSINESS_DEBT' },
        ],
        against: [{ kind: 'INCOME', subtype: 'BUSINESS' }],
      },
      { type: 'LIVING_EXPENSES', entries: [{ kind: 'EXPENSE', subtype: 'HOUSEHOLD' }] },
    ],
    conditions: [
      {
        scope: 'ENTRY',
        label: 'TEST: was this spending paid from income whose khums year had passed?',
        effect: 'EXCLUDE',
        entries: [{ kind: 'EXPENSE', subtype: 'HOUSEHOLD' }],
      },
    ],
  });
  const entry = (
    id: string,
    kind: 'INCOME' | 'EXPENSE' | 'LIABILITY',
    subtype: string,
    amount: string,
  ) => ({ id, kind, subtype, amount, date: '2025-06-01' }) as const;

  it('validates against-entries and condition entries on deductions', () => {
    expect(validateBuilderRule(surplus).status).toBe('READY_FOR_VERIFICATION');
    const notIncluded = validateBuilderRule(
      content({
        deductions: [
          {
            type: 'COSTS_OF_EARNING',
            entries: [{ kind: 'EXPENSE', subtype: 'BUSINESS' }],
            against: [{ kind: 'INCOME', subtype: 'RENTAL' }],
          },
        ],
      }),
    );
    expect(notIncluded.errors).toEqual([
      { code: 'DEDUCTION_AGAINST_NOT_INCLUDED', field: 'deductions.0.against.0' },
    ]);
    const strayCondition = validateBuilderRule(
      content({
        conditions: [
          {
            scope: 'ENTRY',
            label: 'TEST label',
            effect: 'EXCLUDE',
            entries: [{ kind: 'EXPENSE', subtype: 'TRAVEL' }],
          },
        ],
      }),
    );
    expect(strayCondition.errors.map((e) => e.code)).toEqual(['CONDITION_ENTRY_NOT_INCLUDED']);
  });

  it('a business loss never offsets salary; living expenses reduce the whole surplus', () => {
    const pack = compiledPack([revision(RULE_A, surplus)]);
    expect(validateBuilderRule(surplus).errors).toEqual([]);
    // Salary 1000, business 300 with costs 500 (loss): business counts 0; living 200.
    // (1000 + max(300 − 500, 0) − 200) × 12.5 ÷ 100 = 100 (TEST values)
    const loss = run(
      pack,
      test({
        entries: [
          entry('s', 'INCOME', 'EMPLOYMENT', '1000.00'),
          entry('b', 'INCOME', 'BUSINESS', '300.00'),
          entry('c', 'EXPENSE', 'BUSINESS', '500.00'),
          entry('h', 'EXPENSE', 'HOUSEHOLD', '200.00'),
        ],
        entryAnswers: { h: { [`${builderPackRuleId(RULE_A)}:entry-confirm:0`]: false } },
      }),
    );
    expect(loss.outputs?.[result(RULE_A)]).toBe('100');
    // Business 900 with costs 300 + business debt 100: (1000 + 500 − 200) × 12.5% = 162.5
    const profit = run(
      pack,
      test({
        entries: [
          entry('s', 'INCOME', 'EMPLOYMENT', '1000.00'),
          entry('b', 'INCOME', 'BUSINESS', '900.00'),
          entry('c', 'EXPENSE', 'BUSINESS', '300.00'),
          entry('d', 'LIABILITY', 'BUSINESS_DEBT', '100.00'),
          entry('h', 'EXPENSE', 'HOUSEHOLD', '200.00'),
        ],
        entryAnswers: { h: { [`${builderPackRuleId(RULE_A)}:entry-confirm:0`]: false } },
      }),
    );
    expect(profit.outputs?.[result(RULE_A)]).toBe('162.5');
  });

  it('a confirmation on a deduction entry excludes it, and an unanswered one asks', () => {
    const pack = compiledPack([revision(RULE_A, surplus)]);
    const q = `${builderPackRuleId(RULE_A)}:entry-confirm:0`;
    const excluded = run(
      pack,
      test({
        entries: [
          entry('s', 'INCOME', 'EMPLOYMENT', '1000.00'),
          entry('h', 'EXPENSE', 'HOUSEHOLD', '200.00'),
        ],
        entryAnswers: { h: { [q]: true } },
      }),
    );
    // Spending from untaxed past income is not deducted: 1000 × 12.5% = 125
    expect(excluded.outputs?.[result(RULE_A)]).toBe('125');
    const unanswered = run(
      pack,
      test({
        entries: [
          entry('s', 'INCOME', 'EMPLOYMENT', '1000.00'),
          entry('h', 'EXPENSE', 'HOUSEHOLD', '200.00'),
        ],
      }),
    );
    expect(unanswered.outputs).toBeNull();
    expect(unanswered.mapping.status).not.toBe('MAPPED');
  });

  it('rules without the new fields compile exactly as before', () => {
    const plain = compile([revision(RULE_A, content())]);
    if (!plain.ok) throw new Error(plain.error.code);
    expect(plain.value.pack.workflows.annual?.steps.map((st) => st.id)).toEqual([
      `${builderPackRuleId(RULE_A)}:gross`,
      `${builderPackRuleId(RULE_A)}:due`,
    ]);
  });
});

describe('runBuilderTest (staff-only, provisional)', () => {
  const scholar = principal('test-scholar', { roles: [['SCHOLAR', marjaScope(MARJA)]] });
  const otherScholar = principal('test-other', { roles: [['SCHOLAR', marjaScope('other-marja')]] });
  const researcher = principal('test-researcher', {
    roles: [['RELIGIOUS_RESEARCHER', marjaScope(MARJA)]],
  });
  const input = (who: unknown, overrides: Partial<Parameters<typeof runBuilderTest>[0]> = {}) => ({
    principal: who,
    operationalState: 'SCHOLAR_REVIEW' as const,
    marjaId: MARJA,
    revisions: [revision(RULE_A, content())],
    sources: SOURCES,
    test: test({
      entries: [
        { id: 'e1', kind: 'INCOME', subtype: 'EMPLOYMENT', amount: '40.00', date: '2025-06-01' },
      ],
    }),
    context: { ...context(scholar), requestId: 'test-request' },
    ...overrides,
  });

  it('runs in scholar-review mode with the provisional label', () => {
    const outcome = runBuilderTest(input(scholar));
    if (outcome.status !== 'RAN') throw new Error(outcome.status);
    expect(outcome.outcome).toBe('CALCULATED');
    expect(outcome.report?.meta.guidance).toBe('PROVISIONAL_SCHOLAR_REVIEW');
    expect(outcome.report?.meta.disclaimer).toContain('PROVISIONAL — FOR SCHOLAR REVIEW ONLY');
    expect(outcome.compiled.pack.metadata.version).toBe(BUILDER_TEST_PACK_VERSION);
    expect(outcome.compiled.pack.metadata.releaseChannel).toBe('SCHOLAR_REVIEW');
  });

  it('a scholar of another Marja may test read-only; other roles and anonymous are denied', () => {
    expect(
      runBuilderTest(input(otherScholar, { context: { ...context(otherScholar), requestId: 'r' } }))
        .status,
    ).toBe('RAN');
    expect(
      runBuilderTest(input(researcher, { context: { ...context(researcher), requestId: 'r' } }))
        .status,
    ).toBe('DENIED');
    expect(runBuilderTest(input(null)).status).toBe('DENIED');
    expect(runBuilderTest(input({ ...scholar })).status).toBe('DENIED');
  });

  it('never runs in DEVELOPMENT; reports compile failures and review stops', () => {
    expect(runBuilderTest(input(scholar, { operationalState: 'DEVELOPMENT' }))).toEqual({
      status: 'REFUSED',
      issue: 'OPERATIONAL_STATE_FORBIDS',
    });
    expect(runBuilderTest(input(scholar, { revisions: [] })).status).toBe('COMPILE_FAILED');
    const stop = runBuilderTest(
      input(scholar, {
        test: test({
          entries: [
            { id: 'r1', kind: 'INCOME', subtype: 'RENTAL', amount: '1.00', date: '2025-06-01' },
          ],
        }),
      }),
    );
    expect(stop.status === 'RAN' && stop.outcome).toBe('NEEDS_REVIEW');
    const invalid = runBuilderTest(
      input(scholar, {
        test: test({ period: { start: '2025-12-31', end: '2025-01-01' } }),
      }),
    );
    expect(invalid.status === 'RAN' && invalid.outcome).toBe('REFUSED');
  });
});

describe('Phase 4: khums already paid during the year (subtracted after the rate)', () => {
  const paidRule = content({
    includedEntries: [{ kind: 'INCOME', subtype: 'EMPLOYMENT' }],
    deductions: [
      { type: 'LIVING_EXPENSES', entries: [{ kind: 'EXPENSE', subtype: 'HOUSEHOLD' }] },
      { type: 'KHUMS_ALREADY_PAID', entries: [{ kind: 'EXPENSE', subtype: 'KHUMS_PAID' }] },
    ],
    conditions: [
      {
        scope: 'ENTRY',
        label: 'TEST: was this paid for an earlier year?',
        effect: 'EXCLUDE',
        entries: [{ kind: 'EXPENSE', subtype: 'KHUMS_PAID' }],
      },
    ],
  });
  const entry = (id: string, kind: 'INCOME' | 'EXPENSE', subtype: string, amount: string) =>
    ({ id, kind, subtype, amount, date: '2025-06-01' }) as const;
  const q = `${builderPackRuleId(RULE_A)}:entry-confirm:0`;
  const entries = [
    entry('s', 'INCOME', 'EMPLOYMENT', '1000.00'),
    entry('h', 'EXPENSE', 'HOUSEHOLD', '200.00'),
    entry('k', 'EXPENSE', 'KHUMS_PAID', '40.00'),
  ];

  it('is complete, and cannot be limited to entries', () => {
    expect(validateBuilderRule(paidRule).errors).toEqual([]);
    const limited = validateBuilderRule(
      content({
        deductions: [
          {
            type: 'KHUMS_ALREADY_PAID',
            entries: [{ kind: 'EXPENSE', subtype: 'KHUMS_PAID' }],
            against: [{ kind: 'INCOME', subtype: 'EMPLOYMENT' }],
          },
        ],
      }),
    );
    expect(limited.errors.map((e) => e.code)).toContain('DEDUCTION_AGAINST_NOT_ALLOWED');
  });

  it('subtracts a payment for this year from the amount due, never below zero', () => {
    const pack = compiledPack([revision(RULE_A, paidRule)]);
    // (1000 − 200) × 12.5% = 100; minus 40 paid = 60 (TEST values)
    const paid = run(pack, test({ entries, entryAnswers: { k: { [q]: false } } }));
    expect(paid.outputs?.[result(RULE_A)]).toBe('60');
    const over = run(
      pack,
      test({
        entries: [...entries.slice(0, 2), entry('k', 'EXPENSE', 'KHUMS_PAID', '150.00')],
        entryAnswers: { k: { [q]: false } },
      }),
    );
    expect(over.outputs?.[result(RULE_A)]).toBe('0');
  });

  it('a payment for an earlier year is not subtracted and not deducted', () => {
    const pack = compiledPack([revision(RULE_A, paidRule)]);
    const earlier = run(pack, test({ entries, entryAnswers: { k: { [q]: true } } }));
    expect(earlier.outputs?.[result(RULE_A)]).toBe('100');
  });
});

describe('Phase 4 (decision 78): dates, opening values, inflation and savings', () => {
  const e = (
    id: string,
    kind: 'INCOME' | 'EXPENSE' | 'LIABILITY' | 'ASSET' | 'BALANCE',
    subtype: string,
    amount: string,
    date = '2025-06-01',
  ) => ({ id, kind, subtype, amount, date }) as const;
  const q = (index: number) => `${builderPackRuleId(RULE_A)}:entry-confirm:${String(index)}`;
  const inflation = (type: string) => `${builderPackRuleId(RULE_A)}:inflation:${type}`;

  const rule = content({
    includedEntries: [
      { kind: 'INCOME', subtype: 'EMPLOYMENT' },
      { kind: 'ASSET', subtype: 'BUSINESS_STOCK' },
      { kind: 'INCOME', subtype: 'INVESTMENT_RETURN' },
    ],
    deductions: [
      {
        type: 'LIVING_EXPENSES',
        entries: [{ kind: 'EXPENSE', subtype: 'HOUSEHOLD' }],
        afterYearEndDays: 5,
      },
      {
        type: 'PREVIOUSLY_TAXED_VALUE',
        entries: [{ kind: 'ASSET', subtype: 'BUSINESS_STOCK' }],
        against: [{ kind: 'ASSET', subtype: 'BUSINESS_STOCK' }],
        inflation: 'ADDED',
      },
      {
        type: 'TAXED_PRINCIPAL',
        entries: [{ kind: 'BALANCE', subtype: 'BANK_ACCOUNT' }],
        against: [{ kind: 'INCOME', subtype: 'INVESTMENT_RETURN' }],
        inflation: 'ONLY',
      },
      { type: 'EXEMPT_SAVINGS', entries: [{ kind: 'BALANCE', subtype: 'CASH' }] },
    ],
    conditions: [
      {
        scope: 'ENTRY',
        label: 'TEST: is this saved money exempt?',
        effect: 'INCLUDE',
        entries: [{ kind: 'BALANCE', subtype: 'CASH' }],
      },
      {
        scope: 'ENTRY',
        label: 'TEST: was khums paid on this opening value?',
        effect: 'INCLUDE',
        entries: [{ kind: 'ASSET', subtype: 'BUSINESS_STOCK' }],
        openingValues: true,
      },
    ],
    periodLongerThanAYear: 'STOP_FOR_REVIEW',
  });

  it('is complete and valid', () => {
    expect(validateBuilderRule(rule).errors).toEqual([]);
    expect(validateBuilderRule(rule).status).toBe('READY_FOR_VERIFICATION');
  });

  it('validates the new options', () => {
    const codes = (c: BuilderRuleContent) => validateBuilderRule(c).errors.map((x) => x.code);
    expect(
      codes(
        content({
          deductions: [
            { type: 'PREVIOUSLY_TAXED_VALUE', entries: [{ kind: 'ASSET', subtype: 'INVESTMENT' }] },
          ],
        }),
      ),
    ).toContain('DEDUCTION_AGAINST_REQUIRED');
    expect(
      codes(
        content({
          deductions: [
            {
              type: 'TAXED_PRINCIPAL',
              entries: [{ kind: 'BALANCE', subtype: 'BANK_ACCOUNT' }],
              against: [{ kind: 'INCOME', subtype: 'EMPLOYMENT' }],
            },
          ],
        }),
      ),
    ).toContain('DEDUCTION_OPTION_NOT_ALLOWED');
    expect(
      codes(
        content({
          deductions: [
            {
              type: 'KHUMS_ALREADY_PAID',
              entries: [{ kind: 'EXPENSE', subtype: 'KHUMS_PAID' }],
              afterYearEndDays: 5,
            },
          ],
        }),
      ),
    ).toContain('DEDUCTION_OPTION_NOT_ALLOWED');
    expect(
      codes(
        content({
          conditions: [
            {
              scope: 'ENTRY',
              label: 'TEST label',
              effect: 'EXCLUDE',
              entries: [{ kind: 'INCOME', subtype: 'EMPLOYMENT' }],
              openingValues: true,
            },
          ],
        }),
      ),
    ).toContain('CONDITION_OPENING_VALUES_INVALID');
  });

  it('counts entries in the khums year and stops one dated outside it', () => {
    const pack = compiledPack([revision(RULE_A, rule)]);
    const inside = run(pack, test({ entries: [e('s', 'INCOME', 'EMPLOYMENT', '1000')] }));
    expect(inside.outputs?.[result(RULE_A)]).toBe('125');
    const outside = run(
      pack,
      test({ entries: [e('s', 'INCOME', 'EMPLOYMENT', '1000', '2026-01-01')] }),
    );
    expect(outside.outputs).toBeNull();
    expect(outside.mapping.consultations).toEqual([
      { factId: 's', consultationId: 'builder:out-of-period' },
    ]);
  });

  it('counts spending within the allowed days after the year end, not after them', () => {
    const pack = compiledPack([revision(RULE_A, rule)]);
    // (1000 − 200) × 12.5% = 100 with spending on 2026-01-05 (five days after the end)
    const within = run(
      pack,
      test({
        entries: [
          e('s', 'INCOME', 'EMPLOYMENT', '1000'),
          e('h', 'EXPENSE', 'HOUSEHOLD', '200', '2026-01-05'),
        ],
      }),
    );
    expect(within.outputs?.[result(RULE_A)]).toBe('100');
    const late = run(
      pack,
      test({
        entries: [
          e('s', 'INCOME', 'EMPLOYMENT', '1000'),
          e('h', 'EXPENSE', 'HOUSEHOLD', '200', '2026-01-06'),
        ],
      }),
    );
    expect(late.mapping.consultations[0]?.consultationId).toBe('builder:out-of-period');
  });

  it('measures a rise above the value taxed at the start, plus the person’s inflation', () => {
    const pack = compiledPack([revision(RULE_A, rule)]);
    // Stock 1500 at the year end; taxed value 1000 at the start + 10% inflation = 1100:
    // (1000 + max(1500 − 1100, 0)) × 12.5% = 175
    const rise = run(
      pack,
      test({
        entries: [
          e('s', 'INCOME', 'EMPLOYMENT', '1000'),
          e('end', 'ASSET', 'BUSINESS_STOCK', '1500', '2025-12-31'),
          e('start', 'ASSET', 'BUSINESS_STOCK', '1000', '2024-12-31'),
        ],
        entryAnswers: {
          start: { [q(1)]: true, [inflation('PREVIOUSLY_TAXED_VALUE')]: '10' },
        },
      }),
    );
    expect(rise.outputs?.[result(RULE_A)]).toBe('175');
    // A fall below the inflation-adjusted value counts nothing (never below zero): 1000 × 12.5%
    const fall = run(
      pack,
      test({
        entries: [
          e('s', 'INCOME', 'EMPLOYMENT', '1000'),
          e('end', 'ASSET', 'BUSINESS_STOCK', '1050', '2025-12-31'),
          e('start', 'ASSET', 'BUSINESS_STOCK', '1000', '2024-12-31'),
        ],
        entryAnswers: {
          start: { [q(1)]: true, [inflation('PREVIOUSLY_TAXED_VALUE')]: '10' },
        },
      }),
    );
    expect(fall.outputs?.[result(RULE_A)]).toBe('125');
    // The inflation figure is asked, never assumed.
    const unanswered = run(
      pack,
      test({
        entries: [e('start', 'ASSET', 'BUSINESS_STOCK', '1000', '2024-12-31')],
        entryAnswers: { start: { [q(1)]: true } },
      }),
    );
    expect(unanswered.mapping.clarifications[0]).toMatchObject({
      reason: 'QUESTION_UNANSWERED',
      questionId: inflation('PREVIOUSLY_TAXED_VALUE'),
    });
  });

  it('reduces a profit by the inflation of its taxed principal only, never below zero', () => {
    const pack = compiledPack([revision(RULE_A, rule)]);
    // Profit 100; principal 1000 with 8% inflation → 80: (1000 + 20) × 12.5% = 127.5
    const profit = run(
      pack,
      test({
        entries: [
          e('s', 'INCOME', 'EMPLOYMENT', '1000'),
          e('p', 'INCOME', 'INVESTMENT_RETURN', '100'),
          e('d', 'BALANCE', 'BANK_ACCOUNT', '1000', '2024-12-31'),
        ],
        entryAnswers: { d: { [inflation('TAXED_PRINCIPAL')]: '8' } },
      }),
    );
    expect(profit.outputs?.[result(RULE_A)]).toBe('127.5');
  });

  it('deducts exempt savings only when confirmed', () => {
    const pack = compiledPack([revision(RULE_A, rule)]);
    const entries = [
      e('s', 'INCOME', 'EMPLOYMENT', '1000'),
      e('c', 'BALANCE', 'CASH', '400', '2025-12-31'),
    ];
    const exempt = run(pack, test({ entries, entryAnswers: { c: { [q(0)]: true } } }));
    expect(exempt.outputs?.[result(RULE_A)]).toBe('75');
    const notExempt = run(pack, test({ entries, entryAnswers: { c: { [q(0)]: false } } }));
    expect(notExempt.outputs?.[result(RULE_A)]).toBe('125');
  });

  it('stops for a period longer than any calendar year', () => {
    const pack = compiledPack([revision(RULE_A, rule)]);
    const long = run(
      pack,
      test({
        period: { start: '2025-01-01', end: '2026-01-02' },
        entries: [e('s', 'INCOME', 'EMPLOYMENT', '1000')],
      }),
    );
    expect(long.outputs?.[result(RULE_A)]).toBeNull();
    const leap = run(
      pack,
      test({
        period: { start: '2024-01-01', end: '2024-12-31' },
        entries: [e('s', 'INCOME', 'EMPLOYMENT', '1000', '2024-06-01')],
      }),
    );
    expect(leap.outputs?.[result(RULE_A)]).toBe('125');
    // A shorter (transitional) period is calculated as entered.
    const short = run(
      pack,
      test({
        period: { start: '2025-01-01', end: '2025-06-30' },
        entries: [e('s', 'INCOME', 'EMPLOYMENT', '1000', '2025-03-01')],
      }),
    );
    expect(short.outputs?.[result(RULE_A)]).toBe('125');
  });
});

describe('decision 82: COUNT_AS treatments (asked amount, inflation, portion, share of khums)', () => {
  const e = (id: string, subtype: string, amount: string) =>
    ({ id, kind: 'ASSET', subtype, amount, date: '2025-06-01' }) as const;
  const base = builderPackRuleId(RULE_A);
  const q = (index: number) => `${base}:entry-confirm:${String(index)}`;
  const amountQ = (index: number) => `${base}:entry-amount:${String(index)}`;
  const inflationQ = (index: number) => `${base}:entry-inflation:${String(index)}`;
  const portionQ = (index: number) => `${base}:entry-portion:${String(index)}`;
  const item = [{ kind: 'ASSET' as const, subtype: 'HOUSEHOLD_ITEM' }];

  const rule = content({
    includedEntries: [{ kind: 'INCOME', subtype: 'EMPLOYMENT' }, ...item],
    rate: '20',
    conditions: [
      {
        scope: 'ENTRY',
        label: 'TEST: share of khums?',
        effect: 'COUNT_AS',
        entries: item,
        treatment: {
          amount: 'ASKED',
          askedLabel: 'TEST: price paid',
          khumsShare: { numerator: 1, denominator: 120 },
        },
      },
      {
        scope: 'ENTRY',
        label: 'TEST: price plus inflation?',
        effect: 'COUNT_AS',
        entries: item,
        treatment: { amount: 'ASKED', askedLabel: 'TEST: price paid', inflation: 'ADDED' },
      },
      {
        scope: 'ENTRY',
        label: 'TEST: half?',
        effect: 'COUNT_AS',
        entries: item,
        treatment: { amount: 'ENTRY', portion: { fixedPercent: '50' } },
      },
      {
        scope: 'ENTRY',
        label: 'TEST: asked portion?',
        effect: 'COUNT_AS',
        entries: item,
        treatment: { amount: 'ENTRY', portion: { askedLabel: 'TEST: business share (%)' } },
      },
    ],
  });

  it('is complete and valid; malformed treatments are refused', () => {
    expect(validateBuilderRule(rule).errors).toEqual([]);
    expect(validateBuilderRule(rule).status).toBe('READY_FOR_VERIFICATION');
    const bad = (
      condition: Partial<BuilderRuleContent['conditions'][number]>,
      withTreatment = true,
    ) =>
      validateBuilderRule(
        content({
          includedEntries: [{ kind: 'INCOME', subtype: 'EMPLOYMENT' }, ...item],
          conditions: [
            {
              scope: 'ENTRY',
              label: 'TEST',
              effect: 'COUNT_AS',
              entries: item,
              ...(withTreatment ? { treatment: { amount: 'ENTRY' as const } } : {}),
              ...condition,
            },
          ],
        }),
      ).errors.map((x) => x.code);
    expect(bad({}, false)).toContain('CONDITION_TREATMENT_INVALID');
    expect(bad({ effect: 'INCLUDE' })).toContain('CONDITION_TREATMENT_INVALID');
    expect(bad({ entries: [] })).toContain('CONDITION_TREATMENT_INVALID');
    expect(bad({ entries: [{ kind: 'INCOME', subtype: 'GIFT' }] })).toContain(
      'CONDITION_TREATMENT_INVALID',
    );
    expect(
      builderRuleContentSchema.safeParse({
        ...rule,
        conditions: [{ ...rule.conditions[0], treatment: { amount: 'ASKED' } }],
      }).success,
    ).toBe(false);
  });

  it('a share of khums is added directly, rounded half up (120000 → 1000; 100 → 0.83)', () => {
    const pack = compiledPack([revision(RULE_A, rule)]);
    const go = (price: string) =>
      run(
        pack,
        test({
          entries: [e('i', 'HOUSEHOLD_ITEM', '999')],
          entryAnswers: { i: { [q(0)]: true, [amountQ(0)]: price } },
        }),
      ).outputs?.[result(RULE_A)];
    expect(go('120000')).toBe('1000');
    expect(go('100')).toBe('0.83');
    // Salary still at the rate, plus the share: 1000 × 20% + 120000 ÷ 120.
    const both = run(
      pack,
      test({
        entries: [
          { id: 's', kind: 'INCOME', subtype: 'EMPLOYMENT', amount: '1000', date: '2025-06-01' },
          e('i', 'HOUSEHOLD_ITEM', '999'),
        ],
        entryAnswers: { i: { [q(0)]: true, [amountQ(0)]: '120000' } },
      }),
    );
    expect(both.outputs?.[result(RULE_A)]).toBe('1200');
  });

  it('counts an asked price plus inflation, a fixed half, or an asked portion', () => {
    const pack = compiledPack([revision(RULE_A, rule)]);
    const go = (answers: Record<string, boolean | string>) =>
      run(
        pack,
        test({ entries: [e('i', 'HOUSEHOLD_ITEM', '1000')], entryAnswers: { i: answers } }),
      );
    // (800 + 10%) × 20% = 176
    expect(
      go({ [q(0)]: false, [q(1)]: true, [amountQ(1)]: '800', [inflationQ(1)]: '10' }).outputs?.[
        result(RULE_A)
      ],
    ).toBe('176');
    // 1000 × 50% × 20% = 100
    expect(go({ [q(0)]: false, [q(1)]: false, [q(2)]: true }).outputs?.[result(RULE_A)]).toBe(
      '100',
    );
    // 1000 × 30% × 20% = 60
    expect(
      go({ [q(0)]: false, [q(1)]: false, [q(2)]: false, [q(3)]: true, [portionQ(3)]: '30' })
        .outputs?.[result(RULE_A)],
    ).toBe('60');
    // No to every treatment: the entered value, 1000 × 20% = 200
    expect(
      go({ [q(0)]: false, [q(1)]: false, [q(2)]: false, [q(3)]: false }).outputs?.[result(RULE_A)],
    ).toBe('200');
    // An asked amount is never assumed.
    expect(go({ [q(0)]: true }).mapping.clarifications[0]).toMatchObject({
      reason: 'QUESTION_UNANSWERED',
      questionId: amountQ(0),
    });
  });

  it('lists the asked numbers with their unit, and marks inflation questions', () => {
    const compiled = compile([revision(RULE_A, rule)]);
    if (!compiled.ok) throw new Error(compiled.error.code);
    const decimals = compiled.value.questions.filter((x) => x.kind === 'decimal');
    expect(decimals.map((x) => [x.questionId, x.unit, x.inflation ?? false])).toEqual([
      [amountQ(0), 'AMOUNT', false],
      [amountQ(1), 'AMOUNT', false],
      [inflationQ(1), 'PERCENT', true],
      [portionQ(3), 'PERCENT', false],
    ]);
  });
});
