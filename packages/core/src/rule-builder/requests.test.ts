import { describe, expect, it } from 'vitest';

import { newRuleRequest, resolveRuleRequest, ruleRequestViews } from './requests';

/** Scholar requests (Phase 4). TEST values only. */

const MARJA = 'sistani';
const R1 = '01890000-0000-7000-8000-0000000000c1';
const R2 = '01890000-0000-7000-8000-0000000000c2';
const RULE = '01890000-0000-7000-8000-000000000001';

const request = (requestId: string, at: string) => {
  const made = newRuleRequest({
    requestId,
    marjaId: MARJA,
    kind: 'MISSING_RULE',
    ruleId: null,
    message: 'TEST request text',
    actor: 'test-scholar',
    at,
  });
  if (made === 'RECORD_INVALID') throw new Error(made);
  return made;
};

describe('scholar requests', () => {
  it('lists requests newest first with their resolution', () => {
    const a = request(R1, '2026-11-24T10:00:00.000Z');
    const b = request(R2, '2026-11-24T11:00:00.000Z');
    const views = ruleRequestViews(MARJA, [a, b]);
    expect(views?.map((v) => v.request.requestId)).toEqual([R2, R1]);
    const resolution = resolveRuleRequest(views ?? [], {
      requestId: R1,
      note: 'TEST done',
      actor: 'test-scholar',
      at: '2026-11-24T12:00:00.000Z',
    });
    if (typeof resolution === 'string') throw new Error(resolution);
    const after = ruleRequestViews(MARJA, [a, b, resolution]);
    expect(after?.find((v) => v.request.requestId === R1)?.resolution?.note).toBe('TEST done');
    expect(
      resolveRuleRequest(after ?? [], {
        requestId: R1,
        note: 'TEST again',
        actor: 'x',
        at: '2026-11-24T13:00:00.000Z',
      }),
    ).toBe('ALREADY_RESOLVED');
    expect(
      resolveRuleRequest(after ?? [], {
        requestId: RULE,
        note: 'TEST',
        actor: 'x',
        at: '2026-11-24T13:00:00.000Z',
      }),
    ).toBe('REQUEST_NOT_FOUND');
  });

  it('refuses malformed requests and fails closed on inconsistent records', () => {
    expect(
      newRuleRequest({
        requestId: R1,
        marjaId: MARJA,
        kind: 'OTHER',
        ruleId: null,
        message: 'TEST',
        actor: 'a',
        at: '2026-11-24T10:00:00.000Z',
      }),
    ).toBe('RECORD_INVALID');
    expect(
      newRuleRequest({
        requestId: R1,
        marjaId: MARJA,
        kind: 'CALCULATION_CHANGE',
        ruleId: RULE,
        message: 'x',
        actor: 'a',
        at: '2026-11-24T10:00:00.000Z',
      }),
    ).toBe('RECORD_INVALID');
    const a = request(R1, '2026-11-24T10:00:00.000Z');
    expect(ruleRequestViews('khamenei', [a])).toBeNull();
    expect(ruleRequestViews(MARJA, [a, a])).toBeNull();
    expect(
      ruleRequestViews(MARJA, [
        { type: 'RESOLUTION', requestId: R2, marjaId: MARJA, note: 'TEST', actor: 'a', at: a.at },
      ]),
    ).toBeNull();
    expect(ruleRequestViews(MARJA, [{ ...a, extra: true }])).toBeNull();
  });
});
