import { describe, expect, it } from 'vitest';

import type { FactSheetFrame } from '@khums/core';
import type { FinancialFact } from '@khums/shared-types';

import {
  draftFromFact,
  emptyDraft,
  emptyFrameDraft,
  factFromDraft,
  sameDraft,
  frameFromDraft,
  withKind,
  type FactDraft,
} from './drafts';

// Structural test data only; values are arbitrary and carry no religious meaning.
const frame: FactSheetFrame = {
  currency: 'USD',
  context: { workflow: 'annual', period: { start: '2025-07-01', end: '2026-06-30' } },
};

const draftFor = (kind: FactDraft['kind'] & string, patch: Partial<FactDraft> = {}): FactDraft => ({
  ...withKind(emptyDraft('USD'), kind),
  subtype: 'OTHER',
  value: { status: 'KNOWN', amount: '10', min: '', max: '' },
  ...patch,
});

describe('factFromDraft', () => {
  it.each(['ASSET', 'BALANCE', 'INCOME', 'EXPENSE', 'LIABILITY'] as const)(
    'builds a valid %s fact with only its own date fields',
    (kind) => {
      const result = factFromDraft(draftFor(kind), 'f1', frame);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.fact.kind).toBe(kind);
        expect(result.fact).not.toHaveProperty('khumsLiable');
        expect(result.fact).not.toHaveProperty('deductible');
      }
    },
  );

  it('requires a kind, a subtype and the amount for known/estimated values', () => {
    expect(factFromDraft(emptyDraft('USD'), 'f1', frame)).toEqual({
      ok: false,
      errors: { kind: 'REQUIRED' },
    });
    const result = factFromDraft(
      draftFor('BALANCE', {
        subtype: '',
        value: { status: 'ESTIMATED', amount: '', min: '', max: '' },
      }),
      'f1',
      frame,
    );
    expect(result).toEqual({ ok: false, errors: { subtype: 'REQUIRED', amount: 'REQUIRED' } });
  });

  it('keeps every amount state distinct', () => {
    const states = [
      [
        { status: 'KNOWN', amount: '5', min: '', max: '' },
        { status: 'KNOWN', amount: '5' },
      ],
      [
        { status: 'ESTIMATED', amount: '5', min: '', max: '' },
        { status: 'ESTIMATED', amount: '5' },
      ],
      [
        { status: 'RANGE', amount: '', min: '1', max: '9' },
        { status: 'RANGE', min: '1', max: '9' },
      ],
      [{ status: 'UNKNOWN', amount: '7', min: '', max: '' }, { status: 'UNKNOWN' }],
      [{ status: 'NOT_PROVIDED', amount: '7', min: '', max: '' }, { status: 'NOT_PROVIDED' }],
    ] as const;
    for (const [value, expected] of states) {
      const result = factFromDraft(draftFor('ASSET', { value }), 'f1', frame);
      expect(result.ok && result.fact.value).toEqual(expected);
    }
  });

  it('reports range errors and invalid, negative, over-large or over-precise amounts', () => {
    const errorsFor = (value: FactDraft['value'], currency = 'USD') => {
      const result = factFromDraft(draftFor('INCOME', { value, currency }), 'f1', frame);
      return result.ok ? {} : result.errors;
    };
    expect(errorsFor({ status: 'RANGE', amount: '', min: '9', max: '1' })).toEqual({
      min: 'RANGE_MIN_GREATER_THAN_MAX',
    });
    expect(errorsFor({ status: 'RANGE', amount: '', min: '', max: '1' })).toEqual({
      min: 'REQUIRED',
    });
    for (const amount of ['1,000', '1e3', '12 ', '١٢', 'abc', '01']) {
      expect(errorsFor({ status: 'KNOWN', amount, min: '', max: '' })).toEqual({
        amount: 'INVALID_AMOUNT',
      });
    }
    expect(errorsFor({ status: 'KNOWN', amount: '-1', min: '', max: '' })).toEqual({
      amount: 'AMOUNT_NEGATIVE',
    });
    expect(errorsFor({ status: 'KNOWN', amount: '1000000000000000', min: '', max: '' })).toEqual({
      amount: 'AMOUNT_TOO_LARGE',
    });
    expect(errorsFor({ status: 'KNOWN', amount: '1.005', min: '', max: '' })).toEqual({
      amount: 'AMOUNT_TOO_PRECISE',
    });
    expect(errorsFor({ status: 'KNOWN', amount: '1.005', min: '', max: '' }, 'KWD')).toEqual({});
    expect(errorsFor({ status: 'KNOWN', amount: '1.5', min: '', max: '' }, 'JPY')).toEqual({
      amount: 'AMOUNT_TOO_PRECISE',
    });
  });

  it('keeps the amount exactly as typed (no rounding or reformatting)', () => {
    const result = factFromDraft(
      draftFor('BALANCE', { value: { status: 'KNOWN', amount: '1200.50', min: '', max: '' } }),
      'f1',
      frame,
    );
    expect(result.ok && result.fact.value).toEqual({ status: 'KNOWN', amount: '1200.50' });
  });

  it('keeps approximate dates approximate and does not check them against the period', () => {
    const draft = draftFor('INCOME', {
      dates: { receivedOn: { status: 'APPROXIMATE', date: '2020-01-01' } },
    });
    const result = factFromDraft(draft, 'f1', frame);
    expect(result.ok && result.fact).toMatchObject({
      receivedOn: { status: 'APPROXIMATE', date: '2020-01-01' },
    });
    const known = factFromDraft(
      { ...draft, dates: { receivedOn: { status: 'KNOWN', date: '2020-01-01' } } },
      'f1',
      frame,
    );
    expect(known).toEqual({ ok: false, errors: { receivedOn: 'DATE_OUTSIDE_PERIOD' } });
  });

  it('requires a date when the user says it is known or approximate', () => {
    const result = factFromDraft(
      draftFor('LIABILITY', {
        dates: {
          valuedOn: { status: 'KNOWN', date: '' },
          incurredOn: { status: 'UNKNOWN', date: '' },
          dueOn: { status: 'APPROXIMATE', date: '' },
        },
      }),
      'f1',
      frame,
    );
    expect(result).toEqual({ ok: false, errors: { valuedOn: 'REQUIRED', dueOn: 'REQUIRED' } });
  });

  it('stores empty labels and notes as null and limits their length', () => {
    const ok = factFromDraft(draftFor('EXPENSE', { label: '  ', note: '' }), 'f1', frame);
    expect(ok.ok && [ok.fact.label, ok.fact.note]).toEqual([null, null]);
    const long = factFromDraft(draftFor('EXPENSE', { note: 'x'.repeat(501) }), 'f1', frame);
    expect(long).toEqual({ ok: false, errors: { note: 'TOO_LONG' } });
  });

  it('requires a period in the missed-year workflow', () => {
    const missed: FactSheetFrame = {
      currency: 'USD',
      context: {
        workflow: 'missed-year',
        assessmentDate: '2026-06-30',
        periods: [{ id: 'period-1', start: '2024-01-01', end: '2024-12-31' }],
      },
    };
    expect(factFromDraft(draftFor('BALANCE'), 'f1', missed)).toEqual({
      ok: false,
      errors: { periodId: 'REQUIRED' },
    });
    const result = factFromDraft(draftFor('BALANCE', { periodId: 'period-1' }), 'f1', missed);
    expect(result.ok && result.fact.periodId).toBe('period-1');
  });

  it('error results never contain the submitted values', () => {
    const result = factFromDraft(
      draftFor('ASSET', {
        value: { status: 'KNOWN', amount: '98765.4321', min: '', max: '' },
        note: 'secret note',
      }),
      'f1',
      frame,
    );
    expect(result.ok).toBe(false);
    expect(JSON.stringify(result)).not.toMatch(/98765|secret/);
  });
});

describe('draftFromFact', () => {
  it('round-trips a fact exactly', () => {
    const fact: FinancialFact = {
      id: 'f9',
      kind: 'LIABILITY',
      subtype: 'MORTGAGE',
      label: 'Home',
      note: null,
      currency: 'GBP',
      value: { status: 'RANGE', min: '100', max: '200.50' },
      periodId: null,
      valuedOn: { status: 'KNOWN', date: '2026-06-30' },
      incurredOn: { status: 'APPROXIMATE', date: '2020-01-01' },
      dueOn: { status: 'UNKNOWN' },
    };
    const result = factFromDraft(draftFromFact(fact), 'f9', frame);
    expect(result).toEqual({ ok: true, fact });
  });
});

describe('frameFromDraft', () => {
  it('requires the dates each workflow needs', () => {
    expect(frameFromDraft(emptyFrameDraft('USD'), 'annual')).toEqual({
      ok: false,
      errors: { periodStart: 'REQUIRED', periodEnd: 'REQUIRED' },
    });
    expect(frameFromDraft(emptyFrameDraft('USD'), 'missed-year')).toEqual({
      ok: false,
      errors: { assessmentDate: 'REQUIRED', periods: 'REQUIRED' },
    });
  });

  it('validates order and overlap with the domain rules', () => {
    const annual = {
      ...emptyFrameDraft('USD'),
      periodStart: '2026-01-01',
      periodEnd: '2025-01-01',
    };
    expect(frameFromDraft(annual, 'annual')).toEqual({
      ok: false,
      errors: { periodEnd: 'PERIOD_END_BEFORE_START' },
    });
    const missed = {
      ...emptyFrameDraft('USD'),
      assessmentDate: '2026-06-30',
      periods: [
        { id: 'period-1', start: '2024-01-01', end: '2024-12-31' },
        { id: 'period-2', start: '2024-06-01', end: '2025-05-31' },
      ],
    };
    expect(frameFromDraft(missed, 'missed-year')).toEqual({
      ok: false,
      errors: { 'periods.1.start': 'PERIODS_NOT_ORDERED' },
    });
    const ok = frameFromDraft(
      { ...emptyFrameDraft('PKR'), assessmentDate: '2026-06-30' },
      'first-time',
    );
    expect(ok).toEqual({
      ok: true,
      frame: { currency: 'PKR', context: { workflow: 'first-time', assessmentDate: '2026-06-30' } },
    });
  });
});

describe('sameDraft', () => {
  it('detects any change and ignores key order', () => {
    const base = draftFor('ASSET');
    expect(sameDraft(base, { ...base })).toBe(true);
    expect(sameDraft(base, { ...base, note: 'x' })).toBe(false);
    expect(sameDraft(base, { ...base, value: { ...base.value, amount: '11' } })).toBe(false);
    const reordered = Object.fromEntries(Object.entries(base).reverse()) as unknown as FactDraft;
    expect(sameDraft(base, reordered)).toBe(true);
    expect(sameDraft(emptyDraft('USD'), withKind(emptyDraft('USD'), 'BALANCE'))).toBe(false);
  });
});
