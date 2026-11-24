import { describe, expect, it } from 'vitest';

import { PROVISIONAL_MARJA_CATALOGUE } from '@khums/marja-rules';

import {
  findMarjaCatalogueEntry,
  isMarjaCalculationAvailable,
  listMarjaCatalogue,
  NOT_LISTED_SELECTION,
  resolveMarjaSelection,
} from '../index';

describe('read-only Marja catalogue', () => {
  it('exposes the single catalogue from @khums/marja-rules without copying it', () => {
    expect(listMarjaCatalogue()).toBe(PROVISIONAL_MARJA_CATALOGUE);
    expect(findMarjaCatalogueEntry('sistani')).toBe(
      PROVISIONAL_MARJA_CATALOGUE.find((e) => e.id === 'sistani'),
    );
    expect(findMarjaCatalogueEntry('unknown')).toBeUndefined();
  });

  it('reports no entry as calculation-ready', () => {
    for (const entry of listMarjaCatalogue())
      expect(isMarjaCalculationAvailable(entry)).toBe(false);
  });

  it('does not collide "not listed" with a catalogue id', () => {
    expect(findMarjaCatalogueEntry(NOT_LISTED_SELECTION)).toBeUndefined();
  });
});

describe('resolveMarjaSelection', () => {
  it('resolves exact catalogue ids and "not listed"', () => {
    const resolved = resolveMarjaSelection('sistani');
    expect(resolved.kind).toBe('marja');
    if (resolved.kind === 'marja') expect(resolved.entry.id).toBe('sistani');
    expect(resolveMarjaSelection(' sistani ').kind).toBe('marja');
    expect(resolveMarjaSelection(NOT_LISTED_SELECTION)).toEqual({ kind: 'not-listed' });
  });

  it('reports missing selections', () => {
    for (const raw of [undefined, null, '', '   ']) {
      expect(resolveMarjaSelection(raw)).toEqual({ kind: 'missing' });
    }
  });

  it('rejects anything that is not an exact catalogue id', () => {
    for (const raw of [
      'unknown',
      'SISTANI',
      'sistani;drop',
      'a'.repeat(101),
      42,
      ['sistani'],
      {},
    ]) {
      expect(resolveMarjaSelection(raw)).toEqual({ kind: 'invalid' });
    }
  });
});
