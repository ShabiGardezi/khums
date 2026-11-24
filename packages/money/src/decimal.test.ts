import { describe, expect, it } from 'vitest';

import { InvariantError } from '@khums/utils';

import {
  Decimal,
  MAX_DECIMAL_INPUT_LENGTH,
  PrecisionExceededError,
  type RoundingMode,
} from './index';

const d = (value: string) => Decimal.of(value);

describe('Decimal.parse — input validation', () => {
  it.each(['0', '-0', '1', '-1', '123.456', '0.1', '-0.000001', '1000000000000000000000.01'])(
    'accepts %s',
    (input) => {
      expect(Decimal.parse(input).ok).toBe(true);
    },
  );

  it.each([
    '',
    ' 1',
    '1 ',
    '+1',
    '1.',
    '.5',
    '01',
    '-01.5',
    '1e5',
    '1E-2',
    '1,000',
    '1_000',
    '0x10',
    'NaN',
    'Infinity',
    '-',
    '1.2.3',
    '١٢٣', // Arabic-Indic digits must be normalized by the UI before parsing
  ])('rejects %j as INVALID_DECIMAL_FORMAT', (input) => {
    expect(Decimal.parse(input)).toEqual({ ok: false, error: { code: 'INVALID_DECIMAL_FORMAT' } });
  });

  it.each([1.5, 0, NaN, null, undefined, 10n, {}, ['1']])(
    'rejects non-string input #%#',
    (input) => {
      expect(Decimal.parse(input)).toEqual({ ok: false, error: { code: 'NOT_A_STRING' } });
    },
  );

  it('rejects overly long input', () => {
    const input = '1'.repeat(MAX_DECIMAL_INPUT_LENGTH + 1);
    expect(Decimal.parse(input)).toEqual({
      ok: false,
      error: { code: 'INPUT_TOO_LONG', maxLength: MAX_DECIMAL_INPUT_LENGTH },
    });
  });

  it('Decimal.of throws InvariantError for invalid literals', () => {
    expect(() => Decimal.of('1e3')).toThrow(InvariantError);
  });
});

describe('Decimal — exact arithmetic (no floating point)', () => {
  it('0.1 + 0.2 is exactly 0.3', () => {
    expect(d('0.1').add(d('0.2')).toString()).toBe('0.3');
  });

  it('1.1 × 1.1 is exactly 1.21', () => {
    expect(d('1.1').multiply(d('1.1')).toString()).toBe('1.21');
  });

  it('preserves precision beyond Number.MAX_SAFE_INTEGER', () => {
    expect(d('9007199254740993').add(d('1')).toString()).toBe('9007199254740994');
    expect(d('123456789012345678901234567890.123456789').add(d('0.000000001')).toString()).toBe(
      '123456789012345678901234567890.12345679',
    );
  });

  it('keeps many fractional digits without rounding', () => {
    expect(d('0.333333333333333333333333333333').multiply(d('3')).toString()).toBe(
      '0.999999999999999999999999999999',
    );
  });

  it('subtracts exactly', () => {
    expect(d('100.10').subtract(d('0.15')).toString()).toBe('99.95');
  });

  it('normalizes trailing zeros and -0 in canonical output', () => {
    expect(d('1.500').toString()).toBe('1.5');
    expect(d('-0.00').toString()).toBe('0');
    expect(d('5').subtract(d('5')).toString()).toBe('0');
  });

  it('serializes to JSON as a string', () => {
    expect(JSON.stringify({ amount: d('12.30') })).toBe('{"amount":"12.3"}');
  });

  it('throws instead of silently rounding when precision would be exceeded', () => {
    const big = d('9'.repeat(100));
    let value = big;
    expect(() => {
      for (let i = 0; i < 20; i++) value = value.multiply(big);
    }).toThrow(PrecisionExceededError);

    const tiny = d(`0.${'0'.repeat(97)}1`);
    let wide = d('9'.repeat(99));
    expect(() => {
      for (let i = 0; i < 20; i++) wide = wide.multiply(d('1' + '0'.repeat(99)));
      wide.add(tiny);
    }).toThrow(PrecisionExceededError);
  });
});

describe('Decimal — negative values', () => {
  it('adds and subtracts across zero', () => {
    expect(d('-5.25').add(d('2.25')).toString()).toBe('-3');
    expect(d('2').subtract(d('3.5')).toString()).toBe('-1.5');
  });

  it('multiplies signs correctly', () => {
    expect(d('-2.5').multiply(d('4')).toString()).toBe('-10');
    expect(d('-2.5').multiply(d('-4')).toString()).toBe('10');
  });

  it('negates, takes absolute values and reports sign', () => {
    expect(d('3').negate().toString()).toBe('-3');
    expect(d('-3').abs().toString()).toBe('3');
    expect(d('-0.01').isNegative()).toBe(true);
    expect(d('-0').isNegative()).toBe(false);
    expect(d('-0').isZero()).toBe(true);
    expect(d('0.01').isPositive()).toBe(true);
  });

  it('compares values', () => {
    expect(d('-1').lessThan(d('0'))).toBe(true);
    expect(d('2.50').equals(d('2.5'))).toBe(true);
    expect(d('10').greaterThan(d('9.999'))).toBe(true);
    expect(d('1').compare(d('1.0'))).toBe(0);
  });
});

describe('Decimal.percentage', () => {
  it.each([
    ['1000', '20', '200'],
    ['1234.56', '20', '246.912'],
    ['0.01', '20', '0.002'],
    ['100', '0', '0'],
    ['100', '100', '100'],
    ['250', '12.5', '31.25'],
    ['-500', '20', '-100'],
    ['333.33', '33.333', '111.1088889'],
  ])('%s × %s%% = %s (exact)', (amount, rate, expected) => {
    expect(d(amount).percentage(d(rate)).toString()).toBe(expected);
  });
});

describe('Decimal.divide — exact quotient, explicit rounding (decision 82)', () => {
  it.each([
    ['120000', '120', 2, 'HALF_UP', '1000'],
    ['100', '120', 2, 'HALF_UP', '0.83'],
    ['1', '3', 2, 'HALF_UP', '0.33'],
    ['2', '3', 2, 'HALF_UP', '0.67'],
    ['2', '3', 2, 'DOWN', '0.66'],
    ['1', '8', 2, 'HALF_UP', '0.13'],
    ['1', '8', 2, 'HALF_DOWN', '0.12'],
    ['1', '8', 2, 'HALF_EVEN', '0.12'],
    ['3', '8', 2, 'HALF_EVEN', '0.38'],
    ['-1', '8', 2, 'HALF_UP', '-0.13'],
    ['-2', '3', 2, 'CEILING', '-0.66'],
    ['-2', '3', 2, 'FLOOR', '-0.67'],
    ['1', '3', 2, 'UP', '0.34'],
    ['1', '-3', 0, 'UP', '-1'],
    ['50000', '10', 0, 'HALF_UP', '5000'],
    ['7', '2', 0, 'HALF_EVEN', '4'],
    ['5', '2', 0, 'HALF_EVEN', '2'],
  ] as const)('%s ÷ %s at %i places %s = %s', (a, b, scale, mode, expected) => {
    expect(d(a).divide(d(b), scale, mode).toString()).toBe(expected);
  });

  it('refuses division by zero', () => {
    expect(() => d('1').divide(d('0'), 2, 'HALF_UP')).toThrow(InvariantError);
  });
});

describe('Decimal.round — explicit modes only', () => {
  const cases: [string, Record<RoundingMode, string>][] = [
    [
      '2.5',
      {
        UP: '3',
        DOWN: '2',
        CEILING: '3',
        FLOOR: '2',
        HALF_UP: '3',
        HALF_DOWN: '2',
        HALF_EVEN: '2',
      },
    ],
    [
      '3.5',
      {
        UP: '4',
        DOWN: '3',
        CEILING: '4',
        FLOOR: '3',
        HALF_UP: '4',
        HALF_DOWN: '3',
        HALF_EVEN: '4',
      },
    ],
    [
      '-2.5',
      {
        UP: '-3',
        DOWN: '-2',
        CEILING: '-2',
        FLOOR: '-3',
        HALF_UP: '-3',
        HALF_DOWN: '-2',
        HALF_EVEN: '-2',
      },
    ],
    [
      '2.4',
      {
        UP: '3',
        DOWN: '2',
        CEILING: '3',
        FLOOR: '2',
        HALF_UP: '2',
        HALF_DOWN: '2',
        HALF_EVEN: '2',
      },
    ],
    [
      '-2.6',
      {
        UP: '-3',
        DOWN: '-2',
        CEILING: '-2',
        FLOOR: '-3',
        HALF_UP: '-3',
        HALF_DOWN: '-3',
        HALF_EVEN: '-3',
      },
    ],
  ];

  for (const [input, expectations] of cases) {
    for (const [mode, expected] of Object.entries(expectations) as [RoundingMode, string][]) {
      it(`${input} rounded to 0 places with ${mode} → ${expected}`, () => {
        expect(d(input).round(0, mode).toString()).toBe(expected);
      });
    }
  }

  it('rounds to a given scale', () => {
    expect(d('246.912').round(2, 'HALF_UP').toString()).toBe('246.91');
    expect(d('0.125').round(2, 'HALF_EVEN').toString()).toBe('0.12');
    expect(d('0.135').round(2, 'HALF_EVEN').toString()).toBe('0.14');
    expect(d('9.999').round(2, 'HALF_UP').toString()).toBe('10');
  });

  it('rejects invalid scales', () => {
    expect(() => d('1').round(-1, 'HALF_UP')).toThrow(InvariantError);
    expect(() => d('1').round(1.5, 'HALF_UP')).toThrow(InvariantError);
    expect(() => d('1').round(31, 'HALF_UP')).toThrow(InvariantError);
  });
});

describe('Decimal.toFixedScale — never rounds silently', () => {
  it('pads to the requested scale', () => {
    expect(d('12.5').toFixedScale(2)).toEqual({ ok: true, value: '12.50' });
    expect(d('-0').toFixedScale(2)).toEqual({ ok: true, value: '0.00' });
  });

  it('returns ROUNDING_REQUIRED instead of rounding', () => {
    expect(d('12.345').toFixedScale(2)).toEqual({
      ok: false,
      error: { code: 'ROUNDING_REQUIRED', decimalPlaces: 3, scale: 2 },
    });
  });
});
