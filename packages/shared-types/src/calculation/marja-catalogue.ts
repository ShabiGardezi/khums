/**
 * Marja catalogue contracts (docs/research/RULE_PACK_STRUCTURE.md §3).
 *
 * Four independent dimensions, never derived from one another:
 *   lifecycle (fact, with evidence)  ≠  research status  ≠  rule-pack status  ≠  calculation availability.
 * A living or verified Marja does NOT imply an approved rule pack or available calculations.
 */

/**
 * Lifecycle status the platform may state. `LIVING` and `DECEASED` are allowed **only** once the
 * status is human-verified (SOURCE_INVENTORY.md §1.6, RULE_PACK_STRUCTURE.md §3.2). Until then:
 * - `PENDING_VERIFICATION`: the inventory records a candidate or a proposed status, with counted
 *   evidence or an explicit pending entry, awaiting human verification;
 * - `UNKNOWN`: a status is proposed but no evidence item has been recorded or counted.
 */
export type MarjaLifecycleStatus = 'LIVING' | 'DECEASED' | 'PENDING_VERIFICATION' | 'UNKNOWN';

/** A researcher's proposed lifecycle (inventory §2 "Lifecycle (proposed)"). Never a verified fact. */
export type ProposedLifecycle = 'LIVING' | 'DECEASED';

/** Who published an evidence item (SOURCE_INVENTORY.md §1.2). Says nothing about access or checks. */
export type EvidenceSourceClass =
  | 'OFFICE_OWN'
  | 'OFFICE_OTHER'
  | 'STATE_OFFICIAL'
  | 'NEWS'
  | 'COMMUNITY'
  | 'REFERENCE'
  /** Decision 81: a scholar-provided document accepted by the owner as a research source. */
  | 'SCHOLAR_PROVIDED';

/** Whether the item's content could be read (SOURCE_INVENTORY.md §1.4). */
export type SourceAccessStatus =
  'READABLE' | 'ACCESS_BLOCKED' | 'NOT_FOUND' | 'ARCHIVED_COPY_AVAILABLE' | 'NOT_YET_ACCESSED';

/** Whether the item's content supports the recorded fact (SOURCE_INVENTORY.md §1.5). */
export type EvidenceItemAssessment = 'UNASSESSED' | 'SUPPORTING' | 'INCONCLUSIVE';

export type EvidenceConfidence =
  | 'OFFICIAL_EVIDENCE'
  | 'MULTIPLE_INDEPENDENT_REPORTS'
  | 'SINGLE_REPORT'
  | 'UNASSESSED'
  | 'NO_EVIDENCE';

export type HumanVerificationStatus = 'PENDING' | 'IN_REVIEW' | 'VERIFIED' | 'DISPUTED';

/** Progress of religious research (docs/research/RESEARCH_PLAN.md phases). */
export type MarjaResearchStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'SCHOLAR_REVIEW' | 'COMPLETE';

/** Status of the Marja's rule pack, if any. */
export type RulePackAvailability = 'NONE' | 'DRAFT' | 'IN_REVIEW' | 'APPROVED' | 'PUBLISHED';

/** Whether users can calculate with this Marja's rules. */
export type CalculationAvailability = 'UNAVAILABLE' | 'AVAILABLE';

export interface LocalizedText {
  readonly en: string;
  readonly ur: string;
}

/** One lifecycle evidence item (inventory §3). Class, access, assessment and verification are separate. */
export interface LifecycleEvidenceItem {
  /** Stable inventory id, e.g. `E-SIS-1`. */
  readonly id: string;
  readonly sourceClass: EvidenceSourceClass;
  readonly accessStatus: SourceAccessStatus;
  readonly assessment: EvidenceItemAssessment;
  readonly humanVerification: HumanVerificationStatus;
}

export interface MarjaCatalogueEntry {
  /** Stable identifier (matches the research inventory's proposed id). */
  readonly id: string;
  /** Display name per locale. Names only: no titles implying endorsement or ranking. */
  readonly name: LocalizedText;
  /** Locale-aware alphabetical sort key (family/commonly used name). */
  readonly sortName: LocalizedText;
  /** Four separate fields, never merged (SOURCE_INVENTORY.md §1.5–§1.6, §2). */
  readonly lifecycle: {
    /** What the platform may state; see MarjaLifecycleStatus. */
    readonly status: MarjaLifecycleStatus;
    /** The inventory's proposed status, preserved as provenance; `null` if none is proposed. */
    readonly proposed: ProposedLifecycle | null;
    readonly evidenceConfidence: EvidenceConfidence;
    readonly humanVerification: HumanVerificationStatus;
    /** Inventory §2 "Counted items": the only items evidence confidence is based on. */
    readonly countedEvidence: readonly string[];
  };
  /** Every lifecycle evidence item recorded for this Marja in inventory §3, counted or not. */
  readonly evidence: readonly LifecycleEvidenceItem[];
  readonly research: { readonly status: MarjaResearchStatus };
  readonly rulePack: { readonly status: RulePackAvailability; readonly packId: string | null };
  readonly calculation: { readonly availability: CalculationAvailability };
  /** Where this entry's data comes from (document + revision). */
  readonly source: string;
}
