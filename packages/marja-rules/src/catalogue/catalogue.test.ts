import { describe, expect, it } from 'vitest';

import type { MarjaCatalogueEntry } from '@khums/shared-types';

import {
  checkCatalogueConsistency,
  findMarja,
  isCalculationAvailable,
  isCountable,
  isListableInProductionDirectory,
  PROVISIONAL_MARJA_CATALOGUE,
} from '../index';

/** The ten entries of docs/research/SOURCE_INVENTORY.md rev 4 §2 — no more, no fewer. */
const INVENTORY_IDS = [
  'sistani',
  'makarem-shirazi',
  'sadiq-shirazi',
  'najafi',
  'sobhani',
  'khamenei',
  'fayyadh',
  'wahid-khorasani',
  'hakim',
  'fadlallah',
];

describe('provisional Marja catalogue', () => {
  it('contains exactly the candidates in the research inventory', () => {
    expect(PROVISIONAL_MARJA_CATALOGUE.map((e) => e.id).sort()).toEqual([...INVENTORY_IDS].sort());
  });

  it('states no lifecycle as fact while human verification is pending', () => {
    const status = (id: string) => findMarja(id)?.lifecycle.status;
    for (const entry of PROVISIONAL_MARJA_CATALOGUE) {
      expect(['LIVING', 'DECEASED']).not.toContain(entry.lifecycle.status);
    }
    for (const id of [
      'sistani',
      'makarem-shirazi',
      'sadiq-shirazi',
      'najafi',
      'sobhani',
      'khamenei',
      'fayyadh',
      'wahid-khorasani',
    ]) {
      expect(status(id)).toBe('PENDING_VERIFICATION');
    }
    // Proposed status with no recorded or counted evidence item.
    expect(status('hakim')).toBe('UNKNOWN');
    expect(status('fadlallah')).toBe('UNKNOWN');
  });

  it('never counts an inaccessible official item (E-FAY-1)', () => {
    const fayyadh = findMarja('fayyadh');
    const blocked = fayyadh?.evidence.find((i) => i.id === 'E-FAY-1');
    expect(blocked).toMatchObject({
      sourceClass: 'STATE_OFFICIAL',
      accessStatus: 'ACCESS_BLOCKED',
    });
    expect(blocked && isCountable(blocked)).toBe(false);
    expect(fayyadh?.lifecycle.countedEvidence).toEqual(['E-FAY-2']);
    expect(fayyadh?.lifecycle.evidenceConfidence).toBe('SINGLE_REPORT');
  });

  it('marks nothing as human-verified, researched, packaged or calculation-ready', () => {
    for (const entry of PROVISIONAL_MARJA_CATALOGUE) {
      expect(entry.lifecycle.humanVerification).toBe('PENDING');
      expect(entry.research.status).toBe('NOT_STARTED');
      expect(entry.rulePack).toEqual({ status: 'NONE', packId: null });
      expect(entry.calculation.availability).toBe('UNAVAILABLE');
      expect(isCalculationAvailable(entry)).toBe(false);
      expect(isListableInProductionDirectory(entry)).toBe(false);
      expect(entry.source).toContain('SOURCE_INVENTORY.md rev 4');
    }
  });

  it('is internally consistent and fully localized', () => {
    expect(checkCatalogueConsistency(PROVISIONAL_MARJA_CATALOGUE)).toEqual([]);
  });

  it('finds entries by exact id only', () => {
    expect(findMarja('sistani')?.id).toBe('sistani');
    expect(findMarja('SISTANI')).toBeUndefined();
    expect(findMarja('unknown')).toBeUndefined();
  });
});

describe('policy guards', () => {
  const base = findMarja('sistani')!;
  const verifiedItem = { ...base.evidence[0]!, humanVerification: 'VERIFIED' } as const;
  const verified: MarjaCatalogueEntry = {
    ...base,
    lifecycle: { ...base.lifecycle, status: 'LIVING', humanVerification: 'VERIFIED' },
    evidence: [verifiedItem],
  };

  it('accepts a verified status backed by a verified official item', () => {
    expect(checkCatalogueConsistency([verified])).toEqual([]);
  });

  const codesFor = (entry: MarjaCatalogueEntry) =>
    checkCatalogueConsistency([entry]).map((i) => i.code);

  it('rejects unsupported lifecycle claims', () => {
    // Official source class and evidence confidence, but not human-verified.
    expect(codesFor({ ...base, lifecycle: { ...base.lifecycle, status: 'LIVING' } })).toContain(
      'UNVERIFIED_LIFECYCLE_CLAIM',
    );
    // Verified, but only news evidence.
    const fayyadh = findMarja('fayyadh')!;
    expect(
      codesFor({
        ...fayyadh,
        lifecycle: { ...fayyadh.lifecycle, status: 'DECEASED', humanVerification: 'VERIFIED' },
      }),
    ).toContain('VERIFIED_WITHOUT_OFFICIAL_EVIDENCE');
    // Status that contradicts the research proposal.
    expect(
      codesFor({ ...verified, lifecycle: { ...verified.lifecycle, status: 'DECEASED' } }),
    ).toContain('LIFECYCLE_CONTRADICTS_PROPOSAL');
    // A proposed status with no evidence must be UNKNOWN, not pending or verified.
    const hakim = findMarja('hakim')!;
    expect(
      codesFor({ ...hakim, lifecycle: { ...hakim.lifecycle, status: 'PENDING_VERIFICATION' } }),
    ).toContain('PENDING_WITHOUT_EVIDENCE_OR_REGISTER_ENTRY');
    expect(codesFor({ ...hakim, lifecycle: { ...hakim.lifecycle, status: 'DECEASED' } })).toEqual(
      expect.arrayContaining(['UNVERIFIED_LIFECYCLE_CLAIM', 'VERIFIED_WITHOUT_OFFICIAL_EVIDENCE']),
    );
    expect(codesFor({ ...base, lifecycle: { ...base.lifecycle, status: 'UNKNOWN' } })).toContain(
      'UNKNOWN_WITH_COUNTED_EVIDENCE',
    );
  });

  it('rejects inaccessible or unread items used as evidence', () => {
    const fayyadh = findMarja('fayyadh')!;
    // Counting the blocked official item (the H6 mistake corrected in H11).
    expect(
      codesFor({
        ...fayyadh,
        lifecycle: {
          ...fayyadh.lifecycle,
          evidenceConfidence: 'OFFICIAL_EVIDENCE',
          countedEvidence: ['E-FAY-1', 'E-FAY-2'],
        },
      }),
    ).toEqual(expect.arrayContaining(['COUNTED_ITEM_NOT_COUNTABLE', 'CONFIDENCE_NOT_SUPPORTED']));
    // An unread item marked as supporting or verified.
    const blocked = fayyadh.evidence[0]!;
    expect(
      codesFor({
        ...fayyadh,
        evidence: [
          { ...blocked, assessment: 'SUPPORTING', humanVerification: 'VERIFIED' },
          ...fayyadh.evidence.slice(1),
        ],
      }),
    ).toEqual(expect.arrayContaining(['UNREAD_ITEM_ASSESSED', 'UNREAD_ITEM_VERIFIED']));
    // Counted reference missing from the evidence list; countable item left uncounted.
    expect(
      codesFor({ ...base, lifecycle: { ...base.lifecycle, countedEvidence: ['E-SIS-9'] } }),
    ).toEqual(expect.arrayContaining(['COUNTED_ITEM_NOT_RECORDED', 'COUNTABLE_ITEM_NOT_COUNTED']));
    // Confidence stronger than the counted items allow.
    expect(
      codesFor({
        ...fayyadh,
        lifecycle: { ...fayyadh.lifecycle, evidenceConfidence: 'MULTIPLE_INDEPENDENT_REPORTS' },
      }),
    ).toContain('CONFIDENCE_NOT_SUPPORTED');
  });

  it('lists in the production directory only with verified official evidence', () => {
    expect(isListableInProductionDirectory(verified)).toBe(true);
    expect(
      isListableInProductionDirectory({
        ...verified,
        lifecycle: { ...verified.lifecycle, evidenceConfidence: 'SINGLE_REPORT' },
      }),
    ).toBe(false);
  });

  it('never treats a verified status alone as calculation availability', () => {
    expect(isCalculationAvailable(verified)).toBe(false);
    const available: MarjaCatalogueEntry = {
      ...verified,
      rulePack: { status: 'PUBLISHED', packId: 'pack@1.0.0' },
      calculation: { availability: 'AVAILABLE' },
    };
    expect(isCalculationAvailable(available)).toBe(true);
  });

  it('detects inconsistent entries', () => {
    const bad: MarjaCatalogueEntry[] = [
      { ...base, calculation: { availability: 'AVAILABLE' } },
      { ...base, rulePack: { status: 'NONE', packId: 'x' } },
      { ...base, name: { en: '', ur: 'x' } },
    ];
    expect(checkCatalogueConsistency(bad).map((i) => i.code)).toEqual(
      expect.arrayContaining([
        'AVAILABILITY_WITHOUT_PUBLISHED_PACK',
        'AVAILABILITY_WITHOUT_VERIFIED_LIFECYCLE',
        'PACK_ID_WITHOUT_PACK',
        'DUPLICATE_ID',
        'EMPTY_NAME',
      ]),
    );
  });
});
