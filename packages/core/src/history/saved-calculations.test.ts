import { describe, expect, it } from 'vitest';

import type { CalculationReport, FinancialFactSheet } from '@khums/shared-types';

import {
  addSavedCalculation,
  answersForRecalculation,
  emptySavedHistory,
  isEditableSavedCalculation,
  isSameSavedPack,
  parseSavedHistory,
  removeSavedCalculation,
  renameSavedCalculation,
  savedAnswersToReuse,
  savedCalculationFromReport,
  serializeSavedHistory,
} from './saved-calculations';

/** Browser-only history helpers (decisions 65, 71). TEST values only, not rulings. */

const DIGEST = 'b'.repeat(64);
const meta = (overrides: Partial<CalculationReport['meta']> = {}): CalculationReport['meta'] => ({
  engineVersion: '0.2.0',
  mode: 'production',
  guidance: 'APPROVED_RULE_PACK',
  disclaimer: null,
  rulePack: {
    packId: 'test-public-pack',
    marjaId: 'test-marja',
    version: '1.0.0',
    status: 'PUBLISHED',
    isMock: false,
    releaseChannel: 'PRODUCTION',
    contentHash: null,
    contentDigest: DIGEST,
  },
  currency: 'GBP',
  warnings: [],
  ...overrides,
});
const report = (m = meta()): CalculationReport => ({
  workflow: 'annual',
  meta: m,
  result: {
    status: 'COMPLETED',
    outputs: [
      { id: 'test-out', label: 'TEST share', value: { amount: '25', currency: 'GBP' } },
      { id: 'test-open', label: 'TEST open', value: null },
    ],
    breakdown: [],
    unresolved: [],
  },
});
const SHEET: FinancialFactSheet = {
  schemaVersion: 1,
  currency: 'GBP',
  context: { workflow: 'annual', period: { start: '2025-07-01', end: '2026-06-30' } },
  facts: [
    {
      id: 'fact-1',
      kind: 'BALANCE',
      subtype: 'CASH',
      label: null,
      note: null,
      currency: 'GBP',
      value: { status: 'KNOWN', amount: '200' },
      periodId: null,
      valuedOn: { status: 'KNOWN', date: '2026-01-15' },
    },
  ],
};
const IDENTITY = {
  id: '0f0e0d0c-0b0a-4908-8706-050403020100',
  savedAt: '2026-11-23T10:00:00.000Z',
  marjaId: 'test-marja',
};
const ENTRY = {
  ...IDENTITY,
  label: 'TEST year',
  sheet: SHEET,
  answers: { 'test-flag': false },
  yearAnswers: {},
  factAnswers: {},
};
/** What version 1 stored: figures and trace only. */
const LEGACY = {
  ...IDENTITY,
  workflow: 'annual',
  rulePack: { packId: 'test-public-pack', version: '0.9.0', contentDigest: DIGEST },
  engineVersion: '0.1.0',
  currency: 'GBP',
  sections: [{ period: null, status: 'COMPLETED', figures: [] }],
};

describe('savedCalculationFromReport', () => {
  it('keeps the label, the entries, the answers, the trace and the figures of a verified result', () => {
    expect(savedCalculationFromReport(report(), ENTRY)).toEqual({
      ...ENTRY,
      workflow: 'annual',
      rulePack: { packId: 'test-public-pack', version: '1.0.0', contentDigest: DIGEST },
      engineVersion: '0.2.0',
      currency: 'GBP',
      sections: [
        {
          period: null,
          status: 'COMPLETED',
          figures: [
            { id: 'test-out', label: 'TEST share', amount: '25' },
            { id: 'test-open', label: 'TEST open', amount: null },
          ],
        },
      ],
    });
  });

  it('never saves mock, provisional or mismatched results', () => {
    const base = meta();
    for (const m of [
      meta({ guidance: 'NOT_RELIGIOUS_GUIDANCE', mode: 'development' }),
      meta({ guidance: 'PROVISIONAL_SCHOLAR_REVIEW', mode: 'scholar-review' }),
      meta({ rulePack: { ...base.rulePack, isMock: true } }),
      meta({ rulePack: { ...base.rulePack, contentDigest: null } }),
    ]) {
      expect(savedCalculationFromReport(report(m), ENTRY)).toBeNull();
    }
    expect(savedCalculationFromReport(report(), { ...ENTRY, marjaId: 'other' })).toBeNull();
    expect(savedCalculationFromReport(report(), { ...ENTRY, id: 'not-a-uuid' })).toBeNull();
    // The label is required; the sheet must be the one calculated (workflow and currency).
    expect(savedCalculationFromReport(report(), { ...ENTRY, label: '   ' })).toBeNull();
    expect(savedCalculationFromReport(report(), { ...ENTRY, label: 'x'.repeat(101) })).toBeNull();
    expect(
      savedCalculationFromReport(report(), { ...ENTRY, sheet: { ...SHEET, currency: 'USD' } }),
    ).toBeNull();
    expect(
      savedCalculationFromReport(report(), {
        ...ENTRY,
        sheet: { ...SHEET, context: { workflow: 'first-time', assessmentDate: '2026-06-30' } },
      }),
    ).toBeNull();
  });

  it('keeps answers only in the scope the workflow uses', () => {
    const saved = savedCalculationFromReport(report(), {
      ...ENTRY,
      yearAnswers: { 'period-1': { 'test-flag': true } },
    });
    expect(saved?.answers).toEqual({ 'test-flag': false });
    expect(saved?.yearAnswers).toEqual({});
  });

  it('keeps the total and every year of a missed-year result', () => {
    const missed: CalculationReport = {
      workflow: 'missed-year',
      meta: meta(),
      aggregate: {
        status: 'UNRESOLVED',
        completeness: 'PARTIAL',
        outputs: [{ id: 'test-out', label: 'TEST total', value: { amount: '3', currency: 'GBP' } }],
        ruleIds: [],
        openYearIndexes: [1],
      },
      years: [
        {
          period: { start: '2024-01-01', end: '2024-12-31' },
          result: { status: 'COMPLETED', outputs: [], breakdown: [], unresolved: [] },
        },
      ],
    };
    const missedSheet: FinancialFactSheet = {
      schemaVersion: 1,
      currency: 'GBP',
      context: {
        workflow: 'missed-year',
        assessmentDate: '2026-06-30',
        periods: [{ id: 'period-1', start: '2024-01-01', end: '2024-12-31' }],
      },
      facts: [],
    };
    const saved = savedCalculationFromReport(missed, {
      ...ENTRY,
      sheet: missedSheet,
      yearAnswers: { 'period-1': { 'test-flag': true } },
    });
    expect(saved?.answers).toEqual({});
    expect(saved?.yearAnswers).toEqual({ 'period-1': { 'test-flag': true } });
    expect(saved?.sections).toEqual([
      {
        period: null,
        status: 'UNRESOLVED',
        figures: [{ id: 'test-out', label: 'TEST total', amount: '3' }],
      },
      { period: { start: '2024-01-01', end: '2024-12-31' }, status: 'COMPLETED', figures: [] },
    ]);
  });
});

describe('stored history', () => {
  const entry = () => {
    const saved = savedCalculationFromReport(report(), ENTRY);
    if (saved === null) throw new Error('fixture');
    return saved;
  };

  it('round-trips, adds newest first, replaces the same id and deletes one', () => {
    const second = { ...entry(), id: '1f0e0d0c-0b0a-4908-8706-050403020100' };
    let history = addSavedCalculation(emptySavedHistory(), entry());
    history = addSavedCalculation(history, second);
    history = addSavedCalculation(history, entry());
    expect(history.entries.map((e) => e.id)).toEqual([ENTRY.id, second.id]);
    expect(parseSavedHistory(serializeSavedHistory(history))).toEqual({
      status: 'OK',
      history,
      unreadable: 0,
    });
    expect(removeSavedCalculation(history, ENTRY.id).entries.map((e) => e.id)).toEqual([second.id]);
  });

  it('keeps at most 50 entries', () => {
    let history = emptySavedHistory();
    for (let i = 0; i < 55; i += 1) {
      const id = `${i.toString(16).padStart(8, '0')}-0b0a-4908-8706-050403020100`;
      history = addSavedCalculation(history, { ...entry(), id });
    }
    expect(history.entries).toHaveLength(50);
    expect(history.entries[0]?.id.startsWith('00000036')).toBe(true);
  });

  it('reads nothing as empty and discards an unreadable or other-version envelope', () => {
    expect(parseSavedHistory(null).status).toBe('EMPTY');
    expect(parseSavedHistory('').status).toBe('EMPTY');
    expect(parseSavedHistory('{not json').status).toBe('DISCARDED');
    expect(parseSavedHistory('[]').status).toBe('DISCARDED');
    expect(parseSavedHistory('"text"').status).toBe('DISCARDED');
    expect(parseSavedHistory(JSON.stringify({ schemaVersion: 3, entries: [] })).status).toBe(
      'DISCARDED',
    );
    expect(parseSavedHistory(JSON.stringify({ schemaVersion: 2 })).status).toBe('DISCARDED');
    expect(parseSavedHistory(JSON.stringify({ schemaVersion: 2, entries: {} })).status).toBe(
      'DISCARDED',
    );
    expect(parseSavedHistory(JSON.stringify({ schemaVersion: 2, entries: [], extra: 1 }))).toEqual({
      status: 'DISCARDED',
      history: emptySavedHistory(),
    });
  });

  // Audit M-3: one unreadable entry must not hide (and, on the next save, erase) the others.
  it('keeps every readable entry and counts the unreadable ones, never repairing them', () => {
    const second = { ...entry(), id: '1f0e0d0c-0b0a-4908-8706-050403020100' };
    // An invalid entry sheet (a fact dated outside the year) is not repaired.
    const badFact = { ...SHEET.facts[0], valuedOn: { status: 'KNOWN', date: '2027-01-01' } };
    const badSheet = {
      ...entry(),
      id: '2f0e0d0c-0b0a-4908-8706-050403020100',
      sheet: { ...SHEET, facts: [badFact] },
    };
    const tampered = { ...entry(), id: '3f0e0d0c-0b0a-4908-8706-050403020100', extra: 'x' };
    const read = parseSavedHistory(
      JSON.stringify({ schemaVersion: 2, entries: [entry(), badSheet, 'junk', second, tampered] }),
    );
    expect(read).toEqual({
      status: 'OK',
      history: { schemaVersion: 2, entries: [entry(), second] },
      unreadable: 3,
    });
    // Only unreadable entries: an empty readable history, with the count.
    expect(parseSavedHistory(JSON.stringify({ schemaVersion: 2, entries: [badSheet] }))).toEqual({
      status: 'OK',
      history: emptySavedHistory(),
      unreadable: 1,
    });
    // A version 1 history never held version 2 entries.
    expect(
      parseSavedHistory(JSON.stringify({ schemaVersion: 1, entries: [entry(), LEGACY] })),
    ).toEqual({ status: 'OK', history: { schemaVersion: 2, entries: [LEGACY] }, unreadable: 1 });
  });

  it('keeps the newest 50 when more are stored, counting the rest as unreadable', () => {
    const many = Array.from({ length: 52 }, (_, i) => ({
      ...entry(),
      id: `${i.toString(16).padStart(8, '0')}-0b0a-4908-8706-050403020100`,
    }));
    const read = parseSavedHistory(JSON.stringify({ schemaVersion: 2, entries: many }));
    expect(read.status === 'OK' && read.history.entries).toHaveLength(50);
    expect(read.status === 'OK' && read.unreadable).toBe(2);
    expect(read.history.entries[0]?.id).toBe(many[0]?.id);
  });
});

describe('version 1 entries (figures only)', () => {
  it('reads a version 1 history as version 2, keeping its entries read-only', () => {
    const read = parseSavedHistory(JSON.stringify({ schemaVersion: 1, entries: [LEGACY] }));
    expect(read).toEqual({
      status: 'OK',
      history: { schemaVersion: 2, entries: [LEGACY] },
      unreadable: 0,
    });
    const [legacy] = read.history.entries;
    expect(legacy !== undefined && isEditableSavedCalculation(legacy)).toBe(false);
  });

  it('keeps version 1 and version 2 entries side by side', () => {
    const saved = savedCalculationFromReport(report(), {
      ...ENTRY,
      id: '1f0e0d0c-0b0a-4908-8706-050403020100',
    });
    if (saved === null) throw new Error('fixture');
    const read = parseSavedHistory(JSON.stringify({ schemaVersion: 1, entries: [LEGACY] }));
    const history = addSavedCalculation(read.history, saved);
    const reread = parseSavedHistory(serializeSavedHistory(history));
    expect(reread.status).toBe('OK');
    expect(reread.history.entries.map((e) => isEditableSavedCalculation(e))).toEqual([true, false]);
  });
});

describe('renameSavedCalculation', () => {
  const saved = () => {
    const value = savedCalculationFromReport(report(), ENTRY);
    if (value === null) throw new Error('fixture');
    return value;
  };

  it('renames in place (trimmed), keeping order, figures and entries', () => {
    const other = { ...saved(), id: '1f0e0d0c-0b0a-4908-8706-050403020100' };
    const history = addSavedCalculation(addSavedCalculation(emptySavedHistory(), saved()), other);
    const renamed = renameSavedCalculation(history, ENTRY.id, '  Khums year 1446  ');
    expect(renamed?.entries.map((e) => e.id)).toEqual([other.id, ENTRY.id]);
    expect(renamed?.entries[1]).toEqual({ ...saved(), label: 'Khums year 1446' });
  });

  it('refuses an empty or too long label, an unknown id and a version 1 entry', () => {
    const history = addSavedCalculation(emptySavedHistory(), saved());
    expect(renameSavedCalculation(history, ENTRY.id, ' ')).toBeNull();
    expect(renameSavedCalculation(history, ENTRY.id, 'x'.repeat(101))).toBeNull();
    expect(renameSavedCalculation(history, 'missing', 'Name')).toBeNull();
    const legacy = parseSavedHistory(JSON.stringify({ schemaVersion: 1, entries: [LEGACY] }));
    expect(renameSavedCalculation(legacy.history, IDENTITY.id, 'Name')).toBeNull();
  });
});

describe('answersForRecalculation', () => {
  const questions = [
    {
      id: 'test-flag',
      label: 'TEST flag',
      kind: 'boolean' as const,
      choices: [],
      required: false,
      ruleIds: [],
    },
    {
      id: 'test-choice',
      label: 'TEST choice',
      kind: 'choice' as const,
      choices: ['a', 'b'],
      required: false,
      ruleIds: [],
    },
  ];

  it('keeps answers the current pack still accepts, for entries and years that still exist', () => {
    const restored = answersForRecalculation(
      {
        answers: { 'test-flag': true, 'test-choice': 'c', 'gone-question': true },
        yearAnswers: {},
        factAnswers: {
          'fact-1': {
            workflow: 'annual',
            kind: 'BALANCE',
            subtype: 'CASH',
            answers: { 'test-choice': 'a', gone: true },
          },
          'fact-2': {
            workflow: 'annual',
            kind: 'BALANCE',
            subtype: 'CASH',
            answers: { 'test-flag': true },
          },
        },
      },
      { questions },
      SHEET,
    );
    expect(restored).toEqual({
      answers: { 'test-flag': true },
      yearAnswers: {},
      factAnswers: {
        'fact-1': {
          workflow: 'annual',
          kind: 'BALANCE',
          subtype: 'CASH',
          answers: { 'test-choice': 'a' },
        },
      },
    });
  });

  it('drops answers for an entry whose type changed, and year answers for removed years', () => {
    const edited: FinancialFactSheet = {
      ...SHEET,
      facts: [
        {
          id: 'fact-1',
          kind: 'BALANCE',
          subtype: 'BANK_ACCOUNT',
          label: null,
          note: null,
          currency: 'GBP',
          value: { status: 'KNOWN', amount: '200' },
          periodId: null,
          valuedOn: { status: 'NOT_PROVIDED' },
        },
      ],
    };
    expect(
      answersForRecalculation(
        {
          answers: {},
          yearAnswers: { 'period-1': { 'test-flag': true } },
          factAnswers: {
            'fact-1': { workflow: 'annual', kind: 'BALANCE', subtype: 'CASH', answers: {} },
          },
        },
        { questions },
        edited,
      ),
    ).toEqual({ answers: {}, yearAnswers: {}, factAnswers: {} });
    const missed: FinancialFactSheet = {
      schemaVersion: 1,
      currency: 'GBP',
      context: {
        workflow: 'missed-year',
        assessmentDate: '2026-06-30',
        periods: [{ id: 'period-1', start: '2024-01-01', end: '2024-12-31' }],
      },
      facts: [],
    };
    expect(
      answersForRecalculation(
        {
          answers: { 'test-flag': true },
          yearAnswers: { 'period-1': { 'test-flag': true }, 'period-9': { 'test-flag': true } },
          factAnswers: {},
        },
        { questions },
        missed,
      ),
    ).toEqual({ answers: {}, yearAnswers: { 'period-1': { 'test-flag': true } }, factAnswers: {} });
  });
});

describe('savedAnswersToReuse (audit H-1, M-1)', () => {
  const REF = { packId: 'test-public-pack', version: '1.0.0', contentDigest: DIGEST };
  // v1.0.0 asked "TEST gift?" as confirm:0; in v1.1.0 that condition was removed, so the former
  // confirm:1 ("TEST used for living?") is now confirm:0: same id, another meaning.
  const v11 = {
    ref: { packId: 'test-public-pack', version: '1.1.0', contentDigest: 'c'.repeat(64) },
    pack: {
      questions: [
        {
          id: 'builder:r1:confirm:0',
          label: 'TEST used for living?',
          kind: 'boolean' as const,
          choices: [],
          required: true,
          ruleIds: [],
        },
      ],
    },
  };
  const saved = {
    rulePack: REF,
    answers: { 'builder:r1:confirm:0': true, 'builder:r1:confirm:1': false },
    yearAnswers: {},
    factAnswers: {
      'fact-1': {
        workflow: 'annual' as const,
        kind: 'BALANCE' as const,
        subtype: 'CASH',
        answers: { 'builder:r1:confirm:0': true },
      },
    },
  };

  it('never reuses answers when the pack id, version or digest changed', () => {
    expect(savedAnswersToReuse(saved, 'edit', v11, SHEET)).toEqual({
      answers: {},
      yearAnswers: {},
      factAnswers: {},
    });
    // Same version label, other content (digest): still not reused.
    expect(
      savedAnswersToReuse(
        saved,
        'edit',
        { ...v11, ref: { ...REF, contentDigest: 'c'.repeat(64) } },
        SHEET,
      ),
    ).toEqual({ answers: {}, yearAnswers: {}, factAnswers: {} });
    expect(
      savedAnswersToReuse(saved, 'edit', { ...v11, ref: { ...REF, packId: 'other-pack' } }, SHEET),
    ).toEqual({ answers: {}, yearAnswers: {}, factAnswers: {} });
  });

  it('reuses answers for the exact same pack, with the usual filtering', () => {
    expect(savedAnswersToReuse(saved, 'edit', { ...v11, ref: REF }, SHEET)).toEqual({
      answers: { 'builder:r1:confirm:0': true },
      yearAnswers: {},
      factAnswers: saved.factAnswers,
    });
  });

  it('never carries answers into a copy for a new year, even with the same pack', () => {
    expect(savedAnswersToReuse(saved, 'copy', { ...v11, ref: REF }, SHEET)).toEqual({
      answers: {},
      yearAnswers: {},
      factAnswers: {},
    });
  });

  it('compares pack references exactly', () => {
    expect(isSameSavedPack(REF, { ...REF })).toBe(true);
    expect(isSameSavedPack(REF, { ...REF, version: '1.0.1' })).toBe(false);
  });
});
