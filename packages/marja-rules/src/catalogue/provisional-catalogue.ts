import type { LifecycleEvidenceItem, MarjaCatalogueEntry } from '@khums/shared-types';

/**
 * PROVISIONAL Marja catalogue — development preview only.
 *
 * Source: docs/research/SOURCE_INVENTORY.md, revision 4 (2026-11-20, frozen):
 * - §2 "Marja lifecycle register": candidates, proposed lifecycle, evidence confidence, counted
 *   items and human verification;
 * - §3 "Lifecycle evidence": every recorded evidence item with its source class, access status
 *   and assessment.
 * Nothing here is inferred, and the inventory is not modified to make this list look complete.
 *
 * Lifecycle rule (SOURCE_INVENTORY.md §1.5–§1.6; RULE_PACK_STRUCTURE.md §3.2;
 * REVIEW_PROCESS.md §9):
 * - A proposed status is **not** a verified one. An official source class is not verification,
 *   and an unreadable source is not evidence.
 * - No status is human-verified yet, so no entry is `LIVING` or `DECEASED`. Entries with counted
 *   evidence, or listed as pending in the register, are `PENDING_VERIFICATION`. Entries whose
 *   proposed status has no recorded or counted item are `UNKNOWN`.
 * - The register's proposal is kept in `lifecycle.proposed` as provenance only. It is not shown
 *   to users as a fact.
 *
 * Research has not started and no rule pack exists, so calculation is unavailable for every
 * entry. Listing order carries no meaning; the UI sorts alphabetically per locale. Names are plain
 * names without honorifics, to avoid implying endorsement.
 */
const SOURCE = 'docs/research/SOURCE_INVENTORY.md rev 4 §2–§3';

const NOT_RESEARCHED = {
  research: { status: 'NOT_STARTED' },
  rulePack: { status: 'NONE', packId: null },
  calculation: { availability: 'UNAVAILABLE' },
  source: SOURCE,
} as const;

/** Inventory §3 item; every item is currently human verification `PENDING` (§3 header). */
const item = (
  id: string,
  sourceClass: LifecycleEvidenceItem['sourceClass'],
  accessStatus: LifecycleEvidenceItem['accessStatus'],
  assessment: LifecycleEvidenceItem['assessment'],
): LifecycleEvidenceItem => ({
  id,
  sourceClass,
  accessStatus,
  assessment,
  humanVerification: 'PENDING',
});

/** The four candidates the register lists as `PENDING_VERIFICATION` with `NO_EVIDENCE`. */
const pendingCandidate = {
  lifecycle: {
    status: 'PENDING_VERIFICATION',
    proposed: null,
    evidenceConfidence: 'NO_EVIDENCE',
    humanVerification: 'PENDING',
    countedEvidence: [],
  },
  evidence: [],
  ...NOT_RESEARCHED,
} as const;

export const PROVISIONAL_MARJA_CATALOGUE: readonly MarjaCatalogueEntry[] = [
  {
    id: 'sistani',
    name: { en: 'Sayyid Ali al-Husayni al-Sistani', ur: 'سید علی حسینی سیستانی' },
    sortName: { en: 'Sistani', ur: 'سیستانی' },
    lifecycle: {
      status: 'PENDING_VERIFICATION',
      proposed: 'LIVING',
      evidenceConfidence: 'OFFICIAL_EVIDENCE',
      humanVerification: 'PENDING',
      countedEvidence: ['E-SIS-1'],
    },
    evidence: [item('E-SIS-1', 'OFFICE_OWN', 'READABLE', 'SUPPORTING')],
    ...NOT_RESEARCHED,
  },
  {
    id: 'makarem-shirazi',
    name: { en: 'Naser Makarem Shirazi', ur: 'ناصر مکارم شیرازی' },
    sortName: { en: 'Makarem Shirazi', ur: 'مکارم شیرازی' },
    ...pendingCandidate,
  },
  {
    id: 'sadiq-shirazi',
    name: { en: 'Sayyid Sadiq al-Husayni al-Shirazi', ur: 'سید صادق حسینی شیرازی' },
    sortName: { en: 'Shirazi, Sadiq', ur: 'شیرازی، صادق' },
    ...pendingCandidate,
  },
  {
    id: 'najafi',
    name: { en: 'Bashir Husayn al-Najafi', ur: 'بشیر حسین نجفی' },
    sortName: { en: 'Najafi', ur: 'نجفی' },
    ...pendingCandidate,
  },
  {
    id: 'sobhani',
    name: { en: 'Ja’far Sobhani', ur: 'جعفر سبحانی' },
    sortName: { en: 'Sobhani', ur: 'سبحانی' },
    ...pendingCandidate,
  },
  {
    id: 'khamenei',
    name: { en: 'Sayyid Ali Khamenei', ur: 'سید علی خامنہ‌ای' },
    sortName: { en: 'Khamenei', ur: 'خامنہ‌ای' },
    lifecycle: {
      status: 'PENDING_VERIFICATION',
      proposed: 'DECEASED',
      evidenceConfidence: 'OFFICIAL_EVIDENCE',
      humanVerification: 'PENDING',
      countedEvidence: ['E-KHA-1'],
    },
    evidence: [
      item('E-KHA-1', 'OFFICE_OTHER', 'READABLE', 'SUPPORTING'),
      item('E-KHA-2', 'NEWS', 'NOT_YET_ACCESSED', 'UNASSESSED'),
      item('E-KHA-3', 'NEWS', 'NOT_YET_ACCESSED', 'UNASSESSED'),
      item('E-KHA-4', 'NEWS', 'NOT_YET_ACCESSED', 'UNASSESSED'),
      item('E-KHA-5', 'NEWS', 'NOT_YET_ACCESSED', 'UNASSESSED'),
      item('E-KHA-6', 'NEWS', 'NOT_YET_ACCESSED', 'UNASSESSED'),
      item('E-KHA-7', 'OFFICE_OWN', 'READABLE', 'INCONCLUSIVE'),
    ],
    ...NOT_RESEARCHED,
  },
  {
    id: 'fayyadh',
    name: { en: 'Muhammad Ishaq al-Fayyadh', ur: 'محمد اسحاق فیاض' },
    sortName: { en: 'Fayyadh', ur: 'فیاض' },
    lifecycle: {
      status: 'PENDING_VERIFICATION',
      proposed: 'DECEASED',
      evidenceConfidence: 'SINGLE_REPORT',
      humanVerification: 'PENDING',
      countedEvidence: ['E-FAY-2'],
    },
    evidence: [
      // Official class, but blocked (HTTP 403): never counted until its content is read.
      item('E-FAY-1', 'STATE_OFFICIAL', 'ACCESS_BLOCKED', 'UNASSESSED'),
      item('E-FAY-2', 'NEWS', 'READABLE', 'SUPPORTING'),
      item('E-FAY-3', 'OFFICE_OWN', 'READABLE', 'INCONCLUSIVE'),
    ],
    ...NOT_RESEARCHED,
  },
  {
    id: 'wahid-khorasani',
    name: { en: 'Husayn Wahid Khorasani', ur: 'حسین وحید خراسانی' },
    sortName: { en: 'Wahid Khorasani', ur: 'وحید خراسانی' },
    lifecycle: {
      status: 'PENDING_VERIFICATION',
      proposed: 'DECEASED',
      evidenceConfidence: 'OFFICIAL_EVIDENCE',
      humanVerification: 'PENDING',
      countedEvidence: ['E-WAH-1', 'E-WAH-2'],
    },
    evidence: [
      item('E-WAH-1', 'OFFICE_OTHER', 'READABLE', 'SUPPORTING'),
      item('E-WAH-2', 'NEWS', 'READABLE', 'SUPPORTING'),
      item('E-WAH-3', 'OFFICE_OWN', 'ACCESS_BLOCKED', 'UNASSESSED'),
    ],
    ...NOT_RESEARCHED,
  },
  {
    // Register proposes "Deceased" but no evidence item is recorded (H12): status UNKNOWN.
    id: 'hakim',
    name: { en: 'Sayyid Muhammad Sa’id al-Hakim', ur: 'سید محمد سعید الحکیم' },
    sortName: { en: 'Hakim', ur: 'حکیم' },
    lifecycle: {
      status: 'UNKNOWN',
      proposed: 'DECEASED',
      evidenceConfidence: 'UNASSESSED',
      humanVerification: 'PENDING',
      countedEvidence: [],
    },
    evidence: [],
    ...NOT_RESEARCHED,
  },
  {
    // Register proposes "Deceased" but no evidence item is recorded (H12): status UNKNOWN.
    id: 'fadlallah',
    name: { en: 'Sayyid Muhammad Husayn Fadlallah', ur: 'سید محمد حسین فضل اللہ' },
    sortName: { en: 'Fadlallah', ur: 'فضل اللہ' },
    lifecycle: {
      status: 'UNKNOWN',
      proposed: 'DECEASED',
      evidenceConfidence: 'UNASSESSED',
      humanVerification: 'PENDING',
      countedEvidence: [],
    },
    evidence: [],
    ...NOT_RESEARCHED,
  },
];
