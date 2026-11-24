import { describe, expect, it } from 'vitest';

import type { RulePack } from '@khums/shared-types';

import {
  calculationFor,
  hasVerifiedRules,
  offeredWorkflows,
  type CalculationSource,
} from './calculation-source';

const bundle = { pack: { metadata: {} }, summary: { packId: 'test' } };
const verified: CalculationSource = {
  kind: 'VERIFIED',
  status: 'READY',
  packs: { sistani: bundle },
};

describe('calculationFor (decision 65)', () => {
  it('offers the verified pack of the selected Marja only', () => {
    expect(calculationFor(verified, 'sistani')).toEqual({
      kind: 'VERIFIED',
      marjaId: 'sistani',
      bundle,
    });
    expect(calculationFor(verified, 'khamenei')).toEqual({ kind: 'NO_VERIFIED_RULES' });
    // Never an inherited property.
    expect(calculationFor(verified, 'toString')).toEqual({ kind: 'NO_VERIFIED_RULES' });
    expect(hasVerifiedRules(verified, 'sistani')).toBe(true);
    expect(hasVerifiedRules(verified, 'khamenei')).toBe(false);
  });

  it('reports unavailable packs, development and no calculation', () => {
    expect(calculationFor({ ...verified, status: 'UNAVAILABLE' }, 'sistani')).toEqual({
      kind: 'VERIFIED_UNAVAILABLE',
    });
    const pack = { metadata: { isMock: true } } as unknown as RulePack;
    expect(calculationFor({ kind: 'DEVELOPMENT', pack }, 'any')).toEqual({
      kind: 'DEVELOPMENT',
      pack,
    });
    expect(calculationFor(null, 'sistani')).toEqual({ kind: 'NONE' });
  });
});

describe('offeredWorkflows (Phase 3 step 1)', () => {
  it('restricts only a Marja with a verified pack; a bundle failing the check offers none', () => {
    // The fixture bundle is not a real verified pack, so the browser check refuses it.
    expect(offeredWorkflows(verified, 'sistani')).toEqual([]);
  });

  it('leaves the types open where no figures are offered anyway', () => {
    expect(offeredWorkflows(verified, 'khamenei')).toBeNull();
    expect(offeredWorkflows({ ...verified, status: 'UNAVAILABLE' }, 'sistani')).toBeNull();
    expect(offeredWorkflows(null, 'sistani')).toBeNull();
    expect(
      offeredWorkflows({ kind: 'DEVELOPMENT', pack: {} as unknown as RulePack }, 'sistani'),
    ).toBeNull();
  });
});
