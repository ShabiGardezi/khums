import { describe, expect, it } from 'vitest';

import { financialFactExportSchema } from './index';

// Structural test data only.
const valid = {
  format: 'khums-platform.financial-facts',
  exportVersion: 1,
  exportedAt: '2026-07-01T09:30:00.000Z',
  contents: 'FINANCIAL_FACTS_ONLY',
  sheet: {
    schemaVersion: 1,
    currency: 'USD',
    context: { workflow: 'annual', period: { start: '2025-07-01', end: '2026-06-30' } },
    facts: [
      {
        kind: 'BALANCE',
        subtype: 'CASH',
        label: null,
        note: null,
        currency: 'USD',
        value: { status: 'KNOWN', amount: '10.50' },
        periodId: null,
        valuedOn: { status: 'APPROXIMATE', date: '2026-06-01' },
      },
    ],
  },
};

const clone = (): typeof valid => JSON.parse(JSON.stringify(valid)) as typeof valid;

describe('financialFactExportSchema', () => {
  it('accepts a valid export and keeps values exactly', () => {
    const parsed = financialFactExportSchema.parse(valid);
    expect(parsed).toEqual(valid);
  });

  it('applies the same fact rules as the app', () => {
    const tooPrecise = clone();
    tooPrecise.sheet.facts[0]!.value.amount = '10.505';
    const result = financialFactExportSchema.safeParse(tooPrecise);
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error?.issues)).toContain('AMOUNT_TOO_PRECISE');
    expect(JSON.stringify(result.error?.issues)).not.toContain('10.505');
  });

  it('rejects other versions, extra fields, ids and a non-UTC-ISO timestamp', () => {
    expect(financialFactExportSchema.safeParse({ ...valid, exportVersion: 2 }).success).toBe(false);
    expect(financialFactExportSchema.safeParse({ ...valid, marja: 'x' }).success).toBe(false);
    expect(
      financialFactExportSchema.safeParse({ ...valid, exportedAt: '2026-07-01' }).success,
    ).toBe(false);
    const withId = clone();
    (withId.sheet.facts[0] as Record<string, unknown>).id = 'fact-1';
    expect(financialFactExportSchema.safeParse(withId).success).toBe(false);
  });
});
