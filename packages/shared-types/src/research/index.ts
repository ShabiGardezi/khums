import type { GovernanceActorRef } from '../governance';

/**
 * Scholar research management domain (M5.3.2; docs/SCHOLAR_RESEARCH_ARCHITECTURE.md). Types only.
 *
 * Every research entity is an append-only, hash-chained list of full-snapshot revision records,
 * replayed and verified by `@khums/core`. Nothing is ever updated or physically deleted: content
 * changes append revisions, drafts are deleted by a tombstone revision, and approved content is
 * frozen (corrections are new versions or superseding records). These records hold research, not
 * rulings: a ruling is authoritative only as an APPROVED ruling version, and nothing here is
 * executable (rule packs reference exact approved ruling versions separately).
 */

/** The three layers' entities: evidence (source, passage, translation), findings (A), rulings (B). */
export type ResearchEntityType = 'SOURCE' | 'PASSAGE' | 'TRANSLATION' | 'FINDING' | 'RULING';

/** What a revision record does. Content (`payload`, `references`) changes only on CREATED/REVISED. */
export type ResearchRevisionKind =
  | 'CREATED'
  | 'REVISED'
  | 'VERIFIED'
  | 'REVIEWED'
  | 'APPROVED'
  | 'DISPUTED'
  | 'SUPERSEDED'
  | 'WITHDRAWN'
  /** Tombstone of a draft (reason required); earlier revisions and audit records are kept. */
  | 'DRAFT_DELETED';

/** Derived state (never stored). */
export type ResearchState =
  | 'DRAFT'
  | 'VERIFIED'
  | 'REVIEWED'
  | 'APPROVED'
  | 'DISPUTED'
  | 'SUPERSEDED'
  | 'WITHDRAWN'
  | 'DELETED';

/** A pinned reference to an exact revision (or ruling version) of a record of the SAME Marja. */
export interface ResearchReference {
  readonly entityType: ResearchEntityType;
  /** UUIDv7 of the referenced entity. */
  readonly entityId: string;
  /** Exact revision of the referenced chain; for a ruling version, the revision that approved it. */
  readonly revision: number;
  /** For RULING references: the ruling version; null otherwise. */
  readonly rulingVersion: number | null;
  /** Must equal the referring record's Marja. */
  readonly marjaId: string;
}

/** Kinds of assistance AI may give (never authorship, interpretation or approval). */
export type AiAssistanceType =
  | 'SOURCE_LOCATING'
  | 'OCR_TEXT_EXTRACTION'
  | 'TRANSLATION_DRAFT'
  | 'DUPLICATE_DETECTION'
  | 'CONSISTENCY_CHECK'
  /** Phase 4 (decision 74): verbatim copying of an office-published text into a passage. */
  | 'TEXT_TRANSCRIPTION'
  /** Phase 4 (decision 74): a DRAFT finding or ruling written by AI from explicit text only. */
  | 'FINDING_DRAFT';

/**
 * The identity of one AI declaration: what kind of help, which field, how generated, which tool,
 * when. Review state is not part of it.
 */
export interface AiDeclarationRef {
  readonly assistance: AiAssistanceType;
  readonly field: string;
  readonly generation: 'AI_GENERATED' | 'MACHINE_ASSISTED';
  readonly tool: string;
  readonly occurredAt: string;
}

/**
 * Declared AI involvement in one content revision, with the scholar's review of it. A declaration
 * recorded wrongly is never removed or edited: a later revision adds a CORRECTION (a new
 * declaration with `correctionOf` naming the original's identity and a `correctionReason`). The
 * correction enters `NOT_REVIEWED`; once corrected, the original no longer gates approval, the
 * correction does. Who corrected it and when are the introducing record's actor and time.
 */
export interface AiInvolvement {
  readonly assistance: AiAssistanceType;
  /** Affected content path, e.g. `payload.text`. */
  readonly field: string;
  readonly generation: 'AI_GENERATED' | 'MACHINE_ASSISTED';
  /** Tool or model name as declared by the scholar. */
  readonly tool: string;
  readonly occurredAt: string;
  readonly scholarReview: 'NOT_REVIEWED' | 'REVIEWED_UNCHANGED' | 'REVIEWED_CORRECTED';
  /** Present only on a correction: the identity of the declaration it corrects. */
  readonly correctionOf?: AiDeclarationRef;
  /** Present only on a correction: why the original declaration was wrong (3–500 characters). */
  readonly correctionReason?: string;
}

/** The catalogue question a finding investigates, with the catalogue revision it was written for. */
export interface ResearchQuestionRef {
  readonly id: string;
  readonly catalogueRevision: string;
}

/** One revision record of a research entity chain. */
export interface ResearchRevisionRecord {
  readonly entityType: ResearchEntityType;
  /** UUIDv7; immutable. */
  readonly entityId: string;
  /** Optional human-facing reference (S-/P-/T-/F-/R-…), unique and identical in every revision. */
  readonly displayRef: string;
  /** Bound at revision 0; identical in every revision. */
  readonly marjaId: string;
  /** RULING: the version (≥ 1); null for every other entity type. */
  readonly rulingVersion: number | null;
  /**
   * RULING only (M5.3.5): the series every version of one ruling shares — the entity id of its
   * version 1. Absent on every other entity type (so their records and digests are unchanged).
   */
  readonly rulingSeriesId?: string;
  /** FINDING: the catalogue question; null for every other entity type. */
  readonly question: ResearchQuestionRef | null;
  /** 0-based, contiguous. */
  readonly revision: number;
  /** `${entityId}#${revision}`. */
  readonly recordId: string;
  readonly kind: ResearchRevisionKind;
  /** Full content snapshot on CREATED/REVISED; null otherwise. Shape per entity type (M5.3.3+). */
  readonly payload: Readonly<Record<string, unknown>> | null;
  /** Canonical SHA-256 of `payload` (null when `payload` is null). */
  readonly payloadDigest: string | null;
  /** Pinned references (CREATED/REVISED only; empty on transitions). */
  readonly references: readonly ResearchReference[];
  /**
   * Declared AI involvement (CREATED/REVISED only), cumulative: every earlier declaration is kept
   * with the same identity; review may only progress from NOT_REVIEWED.
   */
  readonly aiInvolvement: readonly AiInvolvement[];
  /** The authenticated staff principal, always `STAFF_PRINCIPAL` (never a client value). */
  readonly actor: GovernanceActorRef;
  /** Server time, ISO 8601 UTC with milliseconds; non-decreasing. */
  readonly recordedAt: string;
  /** Required for DISPUTED, WITHDRAWN and DRAFT_DELETED; otherwise optional. */
  readonly reason: string | null;
  /** Authorization decision id. */
  readonly decisionId: string;
  readonly requestId: string;
  readonly previousRecordDigest: string | null;
  /** SHA-256 of the canonical record without `recordDigest`. */
  readonly recordDigest: string;
}

/** The revision chain of one research entity (one ruling version for RULING). */
export interface ResearchChain {
  readonly entityType: ResearchEntityType;
  readonly entityId: string;
  readonly records: readonly ResearchRevisionRecord[];
}

/** Copyright status of a source or evidence item (D10). */
export type CopyrightStatus = 'UNKNOWN' | 'PERMITTED' | 'RESTRICTED' | 'EXCERPTS_ONLY';

/** Media types accepted as evidence files (M5.3.3). */
export type EvidenceMediaType =
  'application/pdf' | 'image/png' | 'image/jpeg' | 'image/webp' | 'text/plain' | 'text/html';

/**
 * Write-once metadata of one archived evidence file (M5.3.3; architecture §4.3). Never updated or
 * deleted. The bytes are in private encrypted storage under `storageKey`; every retrieval
 * re-verifies `digest` (SHA-256 of the original bytes).
 */
export interface EvidenceArtefact {
  readonly artefactId: string;
  readonly marjaId: string;
  readonly sourceId: string;
  /** The source revision the file was attached at. */
  readonly sourceRevision: number;
  readonly digest: string;
  readonly size: number;
  readonly mediaType: EvidenceMediaType;
  /** `${marjaId}/${digest}`: immutable, provider-independent. */
  readonly storageKey: string;
  readonly copyright: CopyrightStatus;
  /** COMPLETE only with copyright PERMITTED (D10). */
  readonly extent: 'EXCERPT' | 'COMPLETE';
  readonly description: string;
  /** The staff principal who attached it (server-derived). */
  readonly recordedBy: string;
  readonly recordedAt: string;
  readonly decisionId: string;
  readonly requestId: string;
}
