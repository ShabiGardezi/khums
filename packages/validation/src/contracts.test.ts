import { describe, expect, it } from 'vitest';

import { decimalStringSchema, healthResponseSchema, problemDetailsSchema } from './index';

describe('decimalStringSchema', () => {
  it('accepts decimal strings and rejects numbers or malformed strings', () => {
    expect(decimalStringSchema.safeParse('1234.56').success).toBe(true);
    expect(decimalStringSchema.safeParse(1234.56).success).toBe(false);
    expect(decimalStringSchema.safeParse('1e3').success).toBe(false);
    expect(decimalStringSchema.safeParse('1,000').success).toBe(false);
  });
});

describe('healthResponseSchema', () => {
  it('accepts a valid health payload', () => {
    const payload = {
      status: 'ok',
      service: 'khums-api',
      uptimeSeconds: 12,
      timestamp: '2026-11-19T10:00:00.000Z',
    };
    expect(healthResponseSchema.parse(payload)).toEqual(payload);
  });

  it('rejects unexpected status values', () => {
    expect(
      healthResponseSchema.safeParse({
        status: 'degraded',
        service: 'khums-api',
        uptimeSeconds: 1,
        timestamp: '2026-11-19T10:00:00.000Z',
      }).success,
    ).toBe(false);
  });
});

describe('problemDetailsSchema', () => {
  it('requires a stable upper-snake-case code', () => {
    const base = { type: 'about:blank', title: 'Not Found', status: 404 };
    expect(problemDetailsSchema.safeParse({ ...base, code: 'NOT_FOUND' }).success).toBe(true);
    expect(problemDetailsSchema.safeParse({ ...base, code: 'not found' }).success).toBe(false);
    expect(
      problemDetailsSchema.safeParse({ ...base, code: 'NOT_FOUND', status: 200 }).success,
    ).toBe(false);
  });
});
