import { describe, expect, it } from 'vitest';

import { addDaysToIsoDate, compareIsoDates, daysBetweenIsoDates, isIsoDate } from './index';

describe('isIsoDate', () => {
  it.each(['2026-01-01', '2024-02-29', '2000-02-29', '1999-12-31'])('accepts %s', (value) => {
    expect(isIsoDate(value)).toBe(true);
  });

  it.each([
    '2026-02-29',
    '1900-02-29',
    '2026-13-01',
    '2026-00-10',
    '2026-04-31',
    '2026-1-01',
    '2026-01-01T00:00:00Z',
    '',
    20260101,
    null,
  ])('rejects %j', (value) => {
    expect(isIsoDate(value)).toBe(false);
  });
});

describe('compareIsoDates', () => {
  it('orders chronologically', () => {
    expect(compareIsoDates('2025-12-31', '2026-01-01')).toBe(-1);
    expect(compareIsoDates('2026-01-01', '2026-01-01')).toBe(0);
    expect(compareIsoDates('2026-02-01', '2026-01-31')).toBe(1);
  });
});

describe('daysBetweenIsoDates and addDaysToIsoDate', () => {
  it.each([
    ['2025-01-01', '2025-12-31', 364],
    ['2024-01-01', '2024-12-31', 365],
    ['2024-02-28', '2024-03-01', 2],
    ['2023-02-28', '2023-03-01', 1],
    ['1999-12-31', '2000-01-01', 1],
    ['2000-03-01', '1900-03-01', -36525],
  ])('%s → %s is %i days', (from, to, days) => {
    expect(daysBetweenIsoDates(from, to)).toBe(days);
    expect(addDaysToIsoDate(from, days)).toBe(to);
  });

  it('round-trips every day across four centuries of month ends', () => {
    let date = '1899-12-25';
    const failures: string[] = [];
    for (let i = 0; i < 146_097; i += 1) {
      const next = addDaysToIsoDate(date, 1);
      if (!isIsoDate(next) || compareIsoDates(date, next) !== -1) failures.push(date);
      date = next;
    }
    expect(failures).toEqual([]);
    expect(date).toBe('2299-12-25');
  });

  it('refuses invalid dates and fractional days', () => {
    expect(() => daysBetweenIsoDates('2025-02-30', '2025-03-01')).toThrow(RangeError);
    expect(() => addDaysToIsoDate('2025-01-01', 1.5)).toThrow(RangeError);
  });
});
