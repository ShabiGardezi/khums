import { describe, expect, it } from 'vitest';

import type { FinancialFact, FinancialFactSheet } from '@khums/shared-types';

import {
  AMOUNT_INPUT_POLICY,
  amountValueSchema,
  dateValueSchema,
  FINANCIAL_FACT_SUBTYPES,
  financialFactSchema,
  financialFactSheetSchema,
} from './index';

// Structural test data only. Values are arbitrary and carry no religious meaning.
const balance: FinancialFact = {
  id: 'f1',
  kind: 'BALANCE',
  subtype: 'BANK_ACCOUNT',
  label: 'Savings',
  note: null,
  currency: 'USD',
  value: { status: 'KNOWN', amount: '1200.50' },
  periodId: null,
  valuedOn: { status: 'KNOWN', date: '2026-06-30' },
};

/** Balance fields without its kind-specific date, for building other kinds. */
const { valuedOn: _valuedOn, ...common } = balance;

const sheet = (facts: FinancialFact[], context?: FinancialFactSheet['context']) => ({
  schemaVersion: 1,
  currency: 'USD',
  context: context ?? { workflow: 'annual', period: { start: '2025-07-01', end: '2026-06-30' } },
  facts,
});

/** Issue codes (params.code) produced by a failed parse. */
function codes(result: { success: boolean; error?: { issues: readonly unknown[] } }): string[] {
  return (result.error?.issues ?? []).map((issue) => {
    const params = (issue as { params?: { code?: string } }).params;
    return params?.code ?? (issue as { code: string }).code;
  });
}

const amount = (value: string) => amountValueSchema.safeParse({ status: 'KNOWN', amount: value });

describe('amounts', () => {
  it.each(['0', '0.00', '1', '1200.50', '999999999999999', '999999999999999.99'])(
    'accepts %j',
    (value) => {
      expect(amount(value).success).toBe(true);
    },
  );

  it.each([
    '',
    ' 1',
    '1 ',
    '1,000',
    '1e3',
    '0x10',
    '01',
    '.5',
    '5.',
    '+5',
    'NaN',
    'Infinity',
    '١٢',
  ])('rejects the malformed string %j', (value) => {
    expect(amount(value).success).toBe(false);
  });

  it('rejects JS numbers and other non-strings', () => {
    for (const value of [12, 12.5, null, true, {}]) {
      expect(amountValueSchema.safeParse({ status: 'KNOWN', amount: value }).success).toBe(false);
    }
  });

  it('rejects negative amounts: direction comes from the fact kind', () => {
    expect(codes(amount('-1'))).toContain('AMOUNT_NEGATIVE');
    expect(AMOUNT_INPUT_POLICY.allowNegative).toBe(false);
  });

  it('enforces the integer-digit boundary', () => {
    expect(codes(amount('1000000000000000'))).toContain('AMOUNT_TOO_LARGE');
    expect(amount('999999999999999').success).toBe(true);
  });

  it('distinguishes missing, unknown, estimated and ranged values', () => {
    expect(amountValueSchema.parse({ status: 'NOT_PROVIDED' })).toEqual({ status: 'NOT_PROVIDED' });
    expect(amountValueSchema.parse({ status: 'UNKNOWN' })).toEqual({ status: 'UNKNOWN' });
    expect(amountValueSchema.safeParse({ status: 'ESTIMATED', amount: '10' }).success).toBe(true);
    expect(amountValueSchema.safeParse({ status: 'RANGE', min: '10', max: '20' }).success).toBe(
      true,
    );
    // An unknown value cannot smuggle in an amount; a known one must have one.
    expect(amountValueSchema.safeParse({ status: 'UNKNOWN', amount: '10' }).success).toBe(false);
    expect(amountValueSchema.safeParse({ status: 'KNOWN' }).success).toBe(false);
  });

  it('rejects a range whose lower bound exceeds the upper bound', () => {
    const result = amountValueSchema.safeParse({ status: 'RANGE', min: '20', max: '10' });
    expect(codes(result)).toContain('RANGE_MIN_GREATER_THAN_MAX');
    expect(amountValueSchema.safeParse({ status: 'RANGE', min: '10', max: '10' }).success).toBe(
      true,
    );
  });
});

describe('dates', () => {
  it('distinguishes known, approximate, unknown and not provided', () => {
    for (const value of [
      { status: 'KNOWN', date: '2026-01-31' },
      { status: 'APPROXIMATE', date: '2020-01-01' },
      { status: 'UNKNOWN' },
      { status: 'NOT_PROVIDED' },
    ]) {
      expect(dateValueSchema.safeParse(value).success).toBe(true);
    }
  });

  it.each(['2026-02-30', '2026-13-01', '26-01-01', '2026/01/01', '2026-01-01T00:00:00Z', ''])(
    'rejects the invalid date %j',
    (date) => {
      expect(dateValueSchema.safeParse({ status: 'KNOWN', date }).success).toBe(false);
    },
  );
});

describe('facts', () => {
  it('accepts every kind with every subtype, and nothing else', () => {
    for (const subtype of FINANCIAL_FACT_SUBTYPES.BALANCE) {
      expect(financialFactSchema.safeParse({ ...balance, subtype }).success).toBe(true);
    }
    expect(financialFactSchema.safeParse({ ...balance, subtype: 'GOLD' }).success).toBe(false);
    expect(financialFactSchema.safeParse({ ...balance, subtype: 'LOAN' }).success).toBe(false);
  });

  it('has no religious classification fields and rejects any added', () => {
    for (const field of ['khumsLiable', 'deductible', 'exempt', 'categoryId', 'rate']) {
      expect(financialFactSchema.safeParse({ ...balance, [field]: true }).success).toBe(false);
    }
  });

  it.each(['usd', 'US', 'XXX', 'BTC', ''])('rejects the currency %j', (currency) => {
    expect(financialFactSchema.safeParse({ ...balance, currency }).success).toBe(false);
  });

  it('limits decimal places to the currency minor units, without rounding', () => {
    const withAmount = (currency: string, value: string) =>
      financialFactSchema.safeParse({
        ...balance,
        currency,
        value: { status: 'KNOWN', amount: value },
      });
    expect(withAmount('USD', '1.25').success).toBe(true);
    expect(codes(withAmount('USD', '1.255'))).toContain('AMOUNT_TOO_PRECISE');
    expect(withAmount('KWD', '1.255').success).toBe(true);
    expect(codes(withAmount('KWD', '1.2555'))).toContain('AMOUNT_TOO_PRECISE');
    expect(withAmount('JPY', '100').success).toBe(true);
    expect(codes(withAmount('JPY', '100.0'))).toContain('AMOUNT_TOO_PRECISE');
    const range = financialFactSchema.safeParse({
      ...balance,
      value: { status: 'RANGE', min: '1.001', max: '2' },
    });
    expect(codes(range)).toContain('AMOUNT_TOO_PRECISE');
  });

  it('accepts zero values (an empty account is a fact)', () => {
    expect(
      financialFactSchema.safeParse({ ...balance, value: { status: 'KNOWN', amount: '0' } })
        .success,
    ).toBe(true);
  });

  it('checks the order of a fact’s own dates', () => {
    const asset = {
      ...balance,
      kind: 'ASSET',
      subtype: 'REAL_ESTATE',
      valuedOn: { status: 'KNOWN', date: '2020-01-01' },
      acquiredOn: { status: 'KNOWN', date: '2021-01-01' },
    };
    expect(codes(financialFactSchema.safeParse(asset))).toContain('VALUED_BEFORE_ACQUIRED');
    // Approximate or unknown dates are not ordered against each other.
    expect(
      financialFactSchema.safeParse({
        ...asset,
        acquiredOn: { status: 'APPROXIMATE', date: '2021-01-01' },
      }).success,
    ).toBe(true);

    const liability = {
      ...balance,
      kind: 'LIABILITY',
      subtype: 'LOAN',
      valuedOn: { status: 'KNOWN', date: '2026-01-01' },
      incurredOn: { status: 'KNOWN', date: '2025-01-01' },
      dueOn: { status: 'KNOWN', date: '2024-01-01' },
    };
    expect(codes(financialFactSchema.safeParse(liability))).toContain('DUE_BEFORE_INCURRED');
  });

  it('limits label and note length and rejects empty text (use null)', () => {
    expect(financialFactSchema.safeParse({ ...balance, label: 'x'.repeat(101) }).success).toBe(
      false,
    );
    expect(financialFactSchema.safeParse({ ...balance, note: 'x'.repeat(501) }).success).toBe(
      false,
    );
    expect(financialFactSchema.safeParse({ ...balance, note: '   ' }).success).toBe(false);
  });
});

describe('fact sheets', () => {
  it('accepts a consistent annual sheet', () => {
    expect(financialFactSheetSchema.safeParse(sheet([balance])).success).toBe(true);
  });

  it('accepts facts in another supported currency (kept as entered, no conversion)', () => {
    expect(
      financialFactSheetSchema.safeParse(sheet([{ ...balance, currency: 'PKR' }])).success,
    ).toBe(true);
  });

  it('rejects duplicate fact ids and an unsupported sheet currency', () => {
    expect(codes(financialFactSheetSchema.safeParse(sheet([balance, balance])))).toContain(
      'DUPLICATE_ID',
    );
    expect(
      financialFactSheetSchema.safeParse({ ...sheet([balance]), currency: 'ABC' }).success,
    ).toBe(false);
  });

  it('rejects a period that ends before it starts', () => {
    const result = financialFactSheetSchema.safeParse(
      sheet([], { workflow: 'annual', period: { start: '2026-01-01', end: '2025-01-01' } }),
    );
    expect(codes(result)).toContain('PERIOD_END_BEFORE_START');
  });

  it('rejects known dates after the reference date, but allows a future due date', () => {
    const late = { ...balance, valuedOn: { status: 'KNOWN' as const, date: '2026-07-01' } };
    const firstTime: FinancialFactSheet['context'] = {
      workflow: 'first-time',
      assessmentDate: '2026-06-30',
    };
    expect(codes(financialFactSheetSchema.safeParse(sheet([late], firstTime)))).toContain(
      'DATE_AFTER_REFERENCE_DATE',
    );
    // Phase 4 (decision 78): an annual sheet accepts up to 31 days after the year end (the pack's
    // mapping decides), never later.
    expect(financialFactSheetSchema.safeParse(sheet([late])).success).toBe(true);
    const tooLate = { ...balance, valuedOn: { status: 'KNOWN' as const, date: '2026-08-01' } };
    expect(codes(financialFactSheetSchema.safeParse(sheet([tooLate])))).toContain(
      'DATE_AFTER_REFERENCE_DATE',
    );
    const liability: FinancialFact = {
      ...balance,
      kind: 'LIABILITY',
      subtype: 'MORTGAGE',
      valuedOn: { status: 'KNOWN', date: '2026-06-30' },
      incurredOn: { status: 'KNOWN', date: '2020-01-01' },
      dueOn: { status: 'KNOWN', date: '2040-01-01' },
    };
    expect(financialFactSheetSchema.safeParse(sheet([liability])).success).toBe(true);
  });

  it('keeps receipts and payments inside their period', () => {
    const income: FinancialFact = {
      ...common,
      kind: 'INCOME',
      subtype: 'EMPLOYMENT',
      receivedOn: { status: 'KNOWN', date: '2025-06-30' },
    };
    const missedYear: FinancialFactSheet['context'] = {
      workflow: 'missed-year',
      assessmentDate: '2026-06-30',
      periods: [{ id: 'y2024', start: '2024-01-01', end: '2024-12-31' }],
    };
    expect(
      codes(
        financialFactSheetSchema.safeParse(sheet([{ ...income, periodId: 'y2024' }], missedYear)),
      ),
    ).toContain('DATE_OUTSIDE_PERIOD');
    // A receipt before the annual period stays invalid input.
    expect(codes(financialFactSheetSchema.safeParse(sheet([income])))).toContain(
      'DATE_OUTSIDE_PERIOD',
    );
  });

  describe('missed-year periods', () => {
    const context: FinancialFactSheet['context'] = {
      workflow: 'missed-year',
      assessmentDate: '2026-06-30',
      periods: [
        { id: 'y2023', start: '2023-01-01', end: '2023-12-31' },
        { id: 'y2024', start: '2024-01-01', end: '2024-12-31' },
      ],
    };
    const expense: FinancialFact = {
      ...common,
      kind: 'EXPENSE',
      subtype: 'HOUSEHOLD',
      periodId: 'y2024',
      paidOn: { status: 'KNOWN', date: '2024-03-01' },
    };

    it('requires every fact to reference an existing period', () => {
      expect(financialFactSheetSchema.safeParse(sheet([expense], context)).success).toBe(true);
      expect(
        codes(financialFactSheetSchema.safeParse(sheet([{ ...expense, periodId: null }], context))),
      ).toContain('PERIOD_REQUIRED');
      expect(
        codes(
          financialFactSheetSchema.safeParse(sheet([{ ...expense, periodId: 'y1999' }], context)),
        ),
      ).toContain('UNKNOWN_PERIOD');
      expect(
        codes(
          financialFactSheetSchema.safeParse(
            sheet([{ ...expense, paidOn: { status: 'KNOWN', date: '2023-03-01' } }], context),
          ),
        ),
      ).toContain('DATE_OUTSIDE_PERIOD');
    });

    it('rejects a period reference outside the missed-year workflow', () => {
      expect(
        codes(financialFactSheetSchema.safeParse(sheet([{ ...balance, periodId: 'y2024' }]))),
      ).toContain('PERIOD_NOT_ALLOWED');
    });

    it('requires ordered, non-overlapping periods ending by the assessment date', () => {
      const bad = (periods: { id: string; start: string; end: string }[]) =>
        codes(financialFactSheetSchema.safeParse(sheet([], { ...context, periods })));
      expect(
        bad([
          { id: 'a', start: '2024-01-01', end: '2024-12-31' },
          { id: 'b', start: '2024-06-01', end: '2025-05-31' },
        ]),
      ).toContain('PERIODS_NOT_ORDERED');
      expect(bad([{ id: 'a', start: '2026-01-01', end: '2026-12-31' }])).toContain(
        'PERIOD_AFTER_ASSESSMENT_DATE',
      );
      expect(
        bad([
          { id: 'a', start: '2023-01-01', end: '2023-12-31' },
          { id: 'a', start: '2024-01-01', end: '2024-12-31' },
        ]),
      ).toContain('DUPLICATE_ID');
      expect(bad([])).not.toHaveLength(0);
    });
  });

  it('reports malformed input as errors and never throws', () => {
    const malformed = [
      { status: 'RANGE', min: 'abc', max: '1' },
      { status: 'RANGE', min: '1', max: 12 },
    ];
    for (const value of malformed) {
      expect(() => amountValueSchema.safeParse(value)).not.toThrow();
      expect(amountValueSchema.safeParse(value).success).toBe(false);
    }
    for (const input of [
      { ...sheet([balance]), facts: 'nope' },
      {
        ...sheet([balance]),
        context: { workflow: 'missed-year', assessmentDate: 'x', periods: 3 },
      },
      { ...sheet([{ ...balance, value: { status: 'RANGE', min: 'x', max: 'y' } }]) },
      null,
    ]) {
      expect(() => financialFactSheetSchema.safeParse(input)).not.toThrow();
      expect(financialFactSheetSchema.safeParse(input).success).toBe(false);
    }
  });

  it('never echoes submitted values in error messages', () => {
    const secretAmount = '987654321.123';
    const secretNote = 'private-note-text';
    const result = financialFactSheetSchema.safeParse(
      sheet([
        {
          ...balance,
          note: secretNote,
          value: { status: 'KNOWN', amount: secretAmount },
          valuedOn: { status: 'KNOWN', date: '2099-01-01' },
        },
      ]),
    );
    const negative = financialFactSheetSchema.safeParse(
      sheet([{ ...balance, value: { status: 'KNOWN', amount: '-5' } }]),
    );
    expect(result.success).toBe(false);
    expect(negative.success).toBe(false);
    const serialized = JSON.stringify([result.error?.issues, negative.error?.issues]);
    for (const secret of [secretAmount, secretNote, '2099-01-01', '-5']) {
      expect(serialized).not.toContain(secret);
    }
  });
});

describe('approved amount policy (locked)', () => {
  it('matches the approved decisions exactly', () => {
    expect(AMOUNT_INPUT_POLICY).toEqual({
      status: 'APPROVED',
      maxIntegerDigits: 15,
      allowNegative: false,
      allowZero: true,
      maxFractionDigits: 'CURRENCY_MINOR_UNITS',
      rounding: 'NONE',
    });
  });

  it('never rounds: the validated amount is the exact string the user entered', () => {
    for (const value of ['0', '0.5', '10.10', '999999999999999.99']) {
      const parsed = amountValueSchema.parse({ status: 'KNOWN', amount: value });
      expect(parsed).toEqual({ status: 'KNOWN', amount: value });
    }
    // Over-precise input is rejected rather than rounded to 1.01 or 1.00.
    expect(
      financialFactSchema.safeParse({ ...balance, value: { status: 'KNOWN', amount: '1.005' } })
        .success,
    ).toBe(false);
  });
});

describe('currency semantics', () => {
  it('checks precision against each fact’s own currency, not the sheet currency', () => {
    const jpySheet = { ...sheet([{ ...balance, currency: 'USD' }]), currency: 'JPY' };
    expect(financialFactSheetSchema.safeParse(jpySheet).success).toBe(true);
    const jpyFact = sheet([
      { ...balance, currency: 'JPY', value: { status: 'KNOWN', amount: '1.5' } },
    ]);
    expect(codes(financialFactSheetSchema.safeParse(jpyFact))).toContain('AMOUNT_TOO_PRECISE');
  });

  it('keeps facts in different currencies exactly as entered (no conversion)', () => {
    const facts: FinancialFact[] = [
      { ...balance, id: 'usd', currency: 'USD', value: { status: 'KNOWN', amount: '100.00' } },
      { ...balance, id: 'pkr', currency: 'PKR', value: { status: 'KNOWN', amount: '28000' } },
      { ...balance, id: 'kwd', currency: 'KWD', value: { status: 'KNOWN', amount: '30.125' } },
    ];
    const parsed = financialFactSheetSchema.parse(sheet(facts));
    expect(parsed.currency).toBe('USD');
    expect(parsed.facts.map((f) => [f.currency, f.value])).toEqual(
      facts.map((f) => [f.currency, f.value]),
    );
  });

  it('has nowhere to put an exchange rate or a converted amount', () => {
    for (const field of ['exchangeRate', 'convertedAmount', 'rate', 'baseAmount']) {
      expect(financialFactSchema.safeParse({ ...balance, [field]: '1.2' }).success).toBe(false);
      expect(
        financialFactSheetSchema.safeParse({ ...sheet([balance]), [field]: '1.2' }).success,
      ).toBe(false);
    }
  });
});

describe('approximate dates', () => {
  const approximate = { status: 'APPROXIMATE' as const, date: '2025-03-01' };

  it('are preserved as approximate, never converted to exact', () => {
    expect(dateValueSchema.parse(approximate)).toEqual(approximate);
    const income: FinancialFact = {
      ...common,
      kind: 'INCOME',
      subtype: 'GIFT',
      receivedOn: approximate,
    };
    const parsed = financialFactSheetSchema.parse(sheet([income]));
    expect(parsed.facts[0]).toMatchObject({ receivedOn: approximate });
  });

  it('cannot establish period membership or date order', () => {
    // Outside the annual period, or after the reference date: an approximate date is not
    // evidence either way, so it is neither rejected nor treated as inside the period.
    for (const date of ['2020-01-01', '2030-01-01']) {
      const income: FinancialFact = {
        ...common,
        kind: 'INCOME',
        subtype: 'OTHER',
        receivedOn: { status: 'APPROXIMATE', date },
      };
      expect(financialFactSheetSchema.safeParse(sheet([income])).success).toBe(true);
    }
    // The same date stated as KNOWN is rejected where the sheet checks periods (missed years).
    const known: FinancialFact = {
      ...common,
      kind: 'INCOME',
      subtype: 'OTHER',
      periodId: 'y2024',
      receivedOn: { status: 'KNOWN', date: '2020-01-01' },
    };
    const missedYear: FinancialFactSheet['context'] = {
      workflow: 'missed-year',
      assessmentDate: '2026-06-30',
      periods: [{ id: 'y2024', start: '2024-01-01', end: '2024-12-31' }],
    };
    expect(codes(financialFactSheetSchema.safeParse(sheet([known], missedYear)))).toContain(
      'DATE_OUTSIDE_PERIOD',
    );
  });
});
