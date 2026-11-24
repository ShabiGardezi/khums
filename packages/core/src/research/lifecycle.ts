import type {
  GovernancePermission,
  ResearchEntityType,
  ResearchRevisionKind,
  ResearchState,
} from '@khums/shared-types';

/**
 * Research lifecycles (M5.3.2; docs/SCHOLAR_RESEARCH_ARCHITECTURE.md §5) and the permission each
 * action needs (§7). Content changes only in a draft, with one explicit exception: a VERIFIED
 * finding may be REVISED, which returns it to DRAFT. Content is frozen in APPROVED (findings,
 * ruling versions), REVIEWED (translations) and VERIFIED (sources, passages); corrections are new
 * versions or superseding records; drafts are deleted by tombstone.
 */

type Transitions = Partial<
  Record<ResearchState, Partial<Record<ResearchRevisionKind, ResearchState>>>
>;

const EVIDENCE: Transitions = {
  DRAFT: { REVISED: 'DRAFT', VERIFIED: 'VERIFIED', DRAFT_DELETED: 'DELETED' },
  VERIFIED: { DISPUTED: 'DISPUTED', SUPERSEDED: 'SUPERSEDED' },
  DISPUTED: { SUPERSEDED: 'SUPERSEDED' },
};

export const RESEARCH_TRANSITIONS: Readonly<Record<ResearchEntityType, Transitions>> = {
  SOURCE: EVIDENCE,
  PASSAGE: EVIDENCE,
  TRANSLATION: {
    DRAFT: { REVISED: 'DRAFT', REVIEWED: 'REVIEWED', DRAFT_DELETED: 'DELETED' },
    REVIEWED: { DISPUTED: 'DISPUTED', SUPERSEDED: 'SUPERSEDED' },
    DISPUTED: { SUPERSEDED: 'SUPERSEDED' },
  },
  FINDING: {
    DRAFT: { REVISED: 'DRAFT', VERIFIED: 'VERIFIED', DRAFT_DELETED: 'DELETED' },
    // A verified finding is not frozen: REVISED returns it to DRAFT (re-verification required).
    VERIFIED: { REVISED: 'DRAFT', APPROVED: 'APPROVED', DRAFT_DELETED: 'DELETED' },
    APPROVED: { SUPERSEDED: 'SUPERSEDED', WITHDRAWN: 'WITHDRAWN' },
  },
  RULING: {
    DRAFT: { REVISED: 'DRAFT', APPROVED: 'APPROVED', DRAFT_DELETED: 'DELETED' },
    APPROVED: { SUPERSEDED: 'SUPERSEDED', WITHDRAWN: 'WITHDRAWN' },
  },
};

export const TERMINAL_RESEARCH_STATES: ReadonlySet<ResearchState> = new Set([
  'DELETED',
  'SUPERSEDED',
  'WITHDRAWN',
]);

/** Transitions that need a reason (3–500 characters). */
export const REASON_REQUIRED: ReadonlySet<ResearchRevisionKind> = new Set([
  'DISPUTED',
  'WITHDRAWN',
  'DRAFT_DELETED',
]);

/** Approval-type transitions: refused while declared AI involvement is unreviewed. */
export const APPROVAL_KINDS: ReadonlySet<ResearchRevisionKind> = new Set([
  'VERIFIED',
  'REVIEWED',
  'APPROVED',
]);

/** Which entity types a record of each type may reference (exact revisions, same Marja). */
export const ALLOWED_REFERENCES: Readonly<
  Record<ResearchEntityType, readonly ResearchEntityType[]>
> = {
  SOURCE: [],
  PASSAGE: ['SOURCE'],
  TRANSLATION: ['PASSAGE'],
  // D14 (owner decision 2026-11-22): findings cite exact passage revisions (and translations of
  // them), never a source document directly; provenance runs finding → passage → source.
  FINDING: ['PASSAGE', 'TRANSLATION'],
  RULING: ['FINDING', 'PASSAGE', 'TRANSLATION'],
};

/** The state a referenced revision must be in when the referring record is verified or approved. */
export const REQUIRED_REFERENCE_STATE: Readonly<Record<ResearchEntityType, ResearchState>> = {
  SOURCE: 'VERIFIED',
  PASSAGE: 'VERIFIED',
  TRANSLATION: 'REVIEWED',
  FINDING: 'APPROVED',
  RULING: 'APPROVED',
};

/** A research action: creating, revising, or one transition kind. */
export type ResearchAction =
  'CREATE' | 'REVISE' | Exclude<ResearchRevisionKind, 'CREATED' | 'REVISED'>;

const EDIT: Readonly<Record<ResearchEntityType, GovernancePermission>> = {
  SOURCE: 'research.source.record',
  PASSAGE: 'research.source.record',
  TRANSLATION: 'research.translation.edit',
  FINDING: 'research.finding.edit',
  RULING: 'research.ruling.edit',
};

/**
 * The permission an action needs. Every research permission has separation `NONE` and never
 * consults a governance policy: the authorized scholar may approve their own work (owner D5).
 */
export function researchPermissionFor(
  entityType: ResearchEntityType,
  action: ResearchAction,
): GovernancePermission | null {
  if (action === 'CREATE' || action === 'REVISE' || action === 'DRAFT_DELETED') {
    return EDIT[entityType];
  }
  switch (entityType) {
    case 'SOURCE':
    case 'PASSAGE':
      return action === 'VERIFIED' || action === 'DISPUTED' || action === 'SUPERSEDED'
        ? 'research.source.verify'
        : null;
    case 'TRANSLATION':
      return action === 'REVIEWED' || action === 'DISPUTED' || action === 'SUPERSEDED'
        ? 'research.translation.review'
        : null;
    case 'FINDING':
      if (action === 'VERIFIED') return 'research.finding.verify';
      return action === 'APPROVED' || action === 'SUPERSEDED' || action === 'WITHDRAWN'
        ? 'research.finding.approve'
        : null;
    case 'RULING':
      if (action === 'WITHDRAWN') return 'research.ruling.withdraw';
      return action === 'APPROVED' || action === 'SUPERSEDED' ? 'research.ruling.approve' : null;
  }
}
