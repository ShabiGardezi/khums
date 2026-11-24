import type {
  EvidenceConfidence,
  LifecycleEvidenceItem,
  MarjaCatalogueEntry,
} from '@khums/shared-types';

import { PROVISIONAL_MARJA_CATALOGUE } from './provisional-catalogue';

/** Finds a catalogue entry by id (exact match; ids are validated before use). */
export function findMarja(
  id: string,
  catalogue: readonly MarjaCatalogueEntry[] = PROVISIONAL_MARJA_CATALOGUE,
): MarjaCatalogueEntry | undefined {
  return catalogue.find((entry) => entry.id === id);
}

/**
 * Release evidence policy, gate 1 (RULE_PACK_STRUCTURE.md §3.3): a Marja may be listed in the
 * production directory only when its lifecycle status is human-verified and backed by official
 * evidence. Development previews may show the provisional list, clearly labelled.
 */
export function isListableInProductionDirectory(entry: MarjaCatalogueEntry): boolean {
  return (
    (entry.lifecycle.status === 'LIVING' || entry.lifecycle.status === 'DECEASED') &&
    entry.lifecycle.humanVerification === 'VERIFIED' &&
    entry.lifecycle.evidenceConfidence === 'OFFICIAL_EVIDENCE'
  );
}

const OFFICIAL_CLASSES = new Set(['OFFICE_OWN', 'OFFICE_OTHER', 'STATE_OFFICIAL']);

/** Content was actually read (live or archived copy). SOURCE_INVENTORY.md §1.4. */
export function isReadable(item: LifecycleEvidenceItem): boolean {
  return item.accessStatus === 'READABLE' || item.accessStatus === 'ARCHIVED_COPY_AVAILABLE';
}

/** Counted only when read and supporting, whatever its source class (§1.5). */
export function isCountable(item: LifecycleEvidenceItem): boolean {
  return isReadable(item) && item.assessment === 'SUPPORTING';
}

/**
 * Evidence confidence allowed by the counted items (§1.5). With no counted item, the register
 * distinguishes `UNASSESSED` from `NO_EVIDENCE`, so both are accepted.
 */
export function allowedEvidenceConfidence(
  counted: readonly LifecycleEvidenceItem[],
): readonly EvidenceConfidence[] {
  if (counted.some((i) => OFFICIAL_CLASSES.has(i.sourceClass))) return ['OFFICIAL_EVIDENCE'];
  const reports = counted.filter((i) => i.sourceClass === 'NEWS' || i.sourceClass === 'COMMUNITY');
  const news = reports.filter((i) => i.sourceClass === 'NEWS');
  if (news.length >= 2) return ['MULTIPLE_INDEPENDENT_REPORTS'];
  if (reports.length >= 1) return ['SINGLE_REPORT'];
  return ['UNASSESSED', 'NO_EVIDENCE'];
}

/**
 * Release evidence policy, gate 3: calculation availability requires an approved, published rule
 * pack (and a verified directory entry). Status alone never makes calculation available.
 */
export function isCalculationAvailable(entry: MarjaCatalogueEntry): boolean {
  return (
    entry.calculation.availability === 'AVAILABLE' &&
    entry.rulePack.status === 'PUBLISHED' &&
    entry.rulePack.packId !== null &&
    isListableInProductionDirectory(entry)
  );
}

export interface CatalogueIssue {
  readonly id: string;
  readonly code:
    | 'DUPLICATE_ID'
    | 'EMPTY_NAME'
    | 'AVAILABILITY_WITHOUT_PUBLISHED_PACK'
    | 'AVAILABILITY_WITHOUT_VERIFIED_LIFECYCLE'
    | 'PACK_ID_WITHOUT_PACK'
    | 'UNVERIFIED_LIFECYCLE_CLAIM'
    | 'VERIFIED_WITHOUT_OFFICIAL_EVIDENCE'
    | 'LIFECYCLE_CONTRADICTS_PROPOSAL'
    | 'PENDING_WITHOUT_EVIDENCE_OR_REGISTER_ENTRY'
    | 'UNKNOWN_WITH_COUNTED_EVIDENCE'
    | 'COUNTED_ITEM_NOT_RECORDED'
    | 'COUNTED_ITEM_NOT_COUNTABLE'
    | 'COUNTABLE_ITEM_NOT_COUNTED'
    | 'UNREAD_ITEM_ASSESSED'
    | 'UNREAD_ITEM_VERIFIED'
    | 'CONFIDENCE_NOT_SUPPORTED';
}

/** Lifecycle rules: SOURCE_INVENTORY.md §1.4–§1.6, RULE_PACK_STRUCTURE.md §3.2. */
function checkLifecycle(entry: MarjaCatalogueEntry): CatalogueIssue['code'][] {
  const codes: CatalogueIssue['code'][] = [];
  const { lifecycle, evidence } = entry;
  const claimsStatus = lifecycle.status === 'LIVING' || lifecycle.status === 'DECEASED';

  for (const item of evidence) {
    if (!isReadable(item) && item.assessment !== 'UNASSESSED') codes.push('UNREAD_ITEM_ASSESSED');
    if (!isReadable(item) && item.humanVerification === 'VERIFIED') {
      codes.push('UNREAD_ITEM_VERIFIED');
    }
  }

  const byId = new Map(evidence.map((i) => [i.id, i]));
  const counted: LifecycleEvidenceItem[] = [];
  for (const id of lifecycle.countedEvidence) {
    const item = byId.get(id);
    if (item === undefined) codes.push('COUNTED_ITEM_NOT_RECORDED');
    else if (!isCountable(item)) codes.push('COUNTED_ITEM_NOT_COUNTABLE');
    else counted.push(item);
  }
  if (evidence.some((i) => isCountable(i) && !lifecycle.countedEvidence.includes(i.id))) {
    codes.push('COUNTABLE_ITEM_NOT_COUNTED');
  }
  if (!allowedEvidenceConfidence(counted).includes(lifecycle.evidenceConfidence)) {
    codes.push('CONFIDENCE_NOT_SUPPORTED');
  }

  if (claimsStatus) {
    if (lifecycle.humanVerification !== 'VERIFIED') codes.push('UNVERIFIED_LIFECYCLE_CLAIM');
    // Verification needs a counted official item (REVIEW_PROCESS.md §9 step 3).
    const official = counted.some(
      (i) => OFFICIAL_CLASSES.has(i.sourceClass) && i.humanVerification === 'VERIFIED',
    );
    if (lifecycle.evidenceConfidence !== 'OFFICIAL_EVIDENCE' || !official) {
      codes.push('VERIFIED_WITHOUT_OFFICIAL_EVIDENCE');
    }
    if (lifecycle.proposed !== lifecycle.status) codes.push('LIFECYCLE_CONTRADICTS_PROPOSAL');
  }
  if (
    lifecycle.status === 'PENDING_VERIFICATION' &&
    lifecycle.proposed !== null &&
    counted.length === 0
  ) {
    codes.push('PENDING_WITHOUT_EVIDENCE_OR_REGISTER_ENTRY');
  }
  if (lifecycle.status === 'UNKNOWN' && counted.length > 0)
    codes.push('UNKNOWN_WITH_COUNTED_EVIDENCE');
  return codes;
}

/** Consistency rules every catalogue must satisfy (enforced in tests and usable in CI/tools). */
export function checkCatalogueConsistency(
  catalogue: readonly MarjaCatalogueEntry[],
): CatalogueIssue[] {
  const issues: CatalogueIssue[] = [];
  const seen = new Set<string>();
  for (const entry of catalogue) {
    if (seen.has(entry.id)) issues.push({ id: entry.id, code: 'DUPLICATE_ID' });
    seen.add(entry.id);
    if (
      [entry.name.en, entry.name.ur, entry.sortName.en, entry.sortName.ur].some(
        (n) => n.trim() === '',
      )
    ) {
      issues.push({ id: entry.id, code: 'EMPTY_NAME' });
    }
    if (entry.calculation.availability === 'AVAILABLE' && entry.rulePack.status !== 'PUBLISHED') {
      issues.push({ id: entry.id, code: 'AVAILABILITY_WITHOUT_PUBLISHED_PACK' });
    }
    if (entry.calculation.availability === 'AVAILABLE' && !isListableInProductionDirectory(entry)) {
      issues.push({ id: entry.id, code: 'AVAILABILITY_WITHOUT_VERIFIED_LIFECYCLE' });
    }
    if (entry.rulePack.status === 'NONE' && entry.rulePack.packId !== null) {
      issues.push({ id: entry.id, code: 'PACK_ID_WITHOUT_PACK' });
    }
    for (const code of checkLifecycle(entry)) issues.push({ id: entry.id, code });
  }
  return issues;
}
