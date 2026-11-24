import { describe, expect, it } from 'vitest';

import { cpiInflation, type CpiSeries } from './cpi';

// TEST values only (not real index data).
const series: CpiSeries = {
  economy: 'TST',
  index: 'CPI',
  start: '2020-01',
  values: '100 101 - 103 110.5 120',
};

describe('cpiInflation (decision 83)', () => {
  it('is the ratio of the two months’ indexes minus one, in percent, rounded half up', () => {
    expect(cpiInflation(series, '2020-01-15', '2020-06-30')).toEqual({
      ok: true,
      value: { percent: '20', fromMonth: '2020-01', toMonth: '2020-06', latestPublished: false },
    });
    // 120 ÷ 101 = 1.188118… → 18.81
    expect(cpiInflation(series, '2020-02-01', '2020-06-01')).toMatchObject({
      ok: true,
      value: { percent: '18.81' },
    });
    // Same month: 0
    expect(cpiInflation(series, '2020-04-01', '2020-04-30')).toMatchObject({
      ok: true,
      value: { percent: '0' },
    });
    // A fall is reported as a negative figure (110.5 → 103: −6.79)
    expect(
      cpiInflation({ ...series, values: '110.5 103' }, '2020-01-01', '2020-02-01'),
    ).toMatchObject({ ok: true, value: { percent: '-6.79' } });
  });

  it('uses the latest published month when the end month is not published yet', () => {
    expect(cpiInflation(series, '2020-01-01', '2021-03-31')).toEqual({
      ok: true,
      value: { percent: '20', fromMonth: '2020-01', toMonth: '2020-06', latestPublished: true },
    });
    // An unpublished end month falls back to the month before it.
    expect(cpiInflation(series, '2020-01-01', '2020-03-31')).toMatchObject({
      ok: true,
      value: { percent: '1', toMonth: '2020-02', latestPublished: true },
    });
  });

  it('never fills in a missing start month or invents data', () => {
    expect(cpiInflation(series, '2019-12-31', '2020-06-01')).toEqual({
      ok: false,
      error: { code: 'NOT_AVAILABLE' },
    });
    expect(cpiInflation(series, '2020-03-01', '2020-06-01')).toEqual({
      ok: false,
      error: { code: 'NOT_AVAILABLE' },
    });
    expect(cpiInflation(series, '2020-06-01', '2020-01-01')).toEqual({
      ok: false,
      error: { code: 'DATES_INVALID' },
    });
    expect(cpiInflation(series, 'soon', '2020-01-01')).toEqual({
      ok: false,
      error: { code: 'DATES_INVALID' },
    });
  });
});
