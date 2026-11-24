import type { FactMapping } from './fact-mapping';
import type { ContentIntegrity } from './integrity';
import type { DecimalString, IsoDate, RoundingMode } from './primitives';
import type { LocatorCheck } from './rule-review';

/**
 * Versioned, source-backed Marja rule pack (docs/research/RULE_PACK_STRUCTURE.md).
 *
 * A rule pack is DATA. It declares input categories, questions, parameters and, per workflow,
 * a declarative program the engine evaluates. The engine itself contains no Khums formula:
 * every religiously significant choice lives here and must be scholar-approved before a pack
 * can be used in production.
 */

export type RulePackStatus =
  'DRAFT' | 'IN_REVIEW' | 'APPROVED' | 'PUBLISHED' | 'SUPERSEDED' | 'WITHDRAWN';

export type RuleStatus = 'DRAFT' | 'UNVERIFIED' | 'APPROVED' | 'SUPERSEDED';

/**
 * - `SCHOLAR_REVIEWER` + `APPROVER`: independent review (two different people).
 * - `GOVERNING_SCHOLAR`: one governing scholar reviewed and approved the content alone, under the
 *   `SINGLE_SCHOLAR_V1` governance policy bound to the pack version's ledger (2026-11-21).
 * - `SOURCE_VERIFIER`: the authorized scholar (or a SUPER_ADMIN) source-verified the rules of a
 *   rule-builder pack; under `SOURCE_VERIFIED_AUTO_V1` that verification is the approval
 *   (decisions 63, 67). One person, like `GOVERNING_SCHOLAR`.
 */
export type ApprovalRole =
  'SCHOLAR_REVIEWER' | 'APPROVER' | 'GOVERNING_SCHOLAR' | 'SOURCE_VERIFIER';

export interface ApprovalRecord {
  readonly role: ApprovalRole;
  /** Stable identifier of the person (details kept in the reviewer register). */
  readonly reviewerId: string;
  readonly approvedAt: IsoDate;
  /** Pointer to the signed review record (e.g. docs/research/reviews/...). */
  readonly reference: string;
  /**
   * The exact content this approval covers (M4.4.2). Required for production: an approval whose
   * integrity differs from the recomputed content digest is stale and never counts.
   */
  readonly integrity?: ContentIntegrity;
}

/**
 * Release channel of a schemaVersion 3 pack (M4.5a; owner decision 2026-11-21). Part of the hashed
 * content, so a scholar-review pack and its later production version always differ in digest.
 * - `SCHOLAR_REVIEW`: actual proposed, sourced rules for private scholar review. Results are only
 *   ever PROVISIONAL — FOR SCHOLAR REVIEW ONLY; never published, activated or used in production.
 * - `PRODUCTION`: for the governed production path (approval, publication, activation, readiness).
 */
export type ReleaseChannel = 'SCHOLAR_REVIEW' | 'PRODUCTION';

export interface RulePackMetadata {
  readonly packId: string;
  readonly marjaId: string;
  /** Semantic version of this pack. Published versions are immutable. */
  readonly version: string;
  /**
   * Pack schema version. 1: no fact mapping. 2: adds `factMapping` (M4.4.1). 3: adds
   * `releaseChannel` (M4.5a; `factMapping` optional). Versions 1 and 2 remain valid, unchanged and
   * never re-hashed; they carry no release channel.
   */
  readonly schemaVersion: 1 | 2 | 3;
  /** Required in schemaVersion 3, absent before. Hashed content. */
  readonly releaseChannel?: ReleaseChannel;
  readonly title: string;
  readonly status: RulePackStatus;
  /** MOCK / NOT FOR PRODUCTION packs used for development and tests. Never activatable. */
  readonly isMock: boolean;
  readonly effectiveFrom: IsoDate;
  readonly effectiveTo: IsoDate | null;
  /**
   * Legacy declared hash (`sha256:<hex>`, pre-M4.4.2). It cannot name its canonicalization, so it
   * is never accepted as integrity: production requires `null` here and `integrity` instead.
   */
  readonly contentHash: string | null;
  /**
   * Declared content integrity (M4.4.2). Excluded from the hashed content. Production recomputes
   * the digest and requires an exact match; development reports a mismatch as a warning.
   */
  readonly integrity?: ContentIntegrity;
  /** Research baseline this pack encodes (docs/research/reviews/...). */
  readonly researchBaseline: string | null;
  readonly approvals: readonly ApprovalRecord[];
  readonly supersedes: string | null;
}

export interface SourceReference {
  readonly id: string;
  readonly title: string;
  readonly url: string | null;
  /** Precise locator, e.g. ruling/mas'alah number, page, istifta' id. */
  readonly locator: string | null;
  /**
   * Tool-assisted locator check (M5.4; optional, hashed content when present, so older packs keep
   * their digests). Never the scholar's verification: see `LocatorCheck`.
   */
  readonly locatorCheck?: LocatorCheck;
}

/** A rule = an approved ruling (or a candidate) the program relies on, with its sources. */
export interface RuleDefinition {
  readonly id: string;
  readonly status: RuleStatus;
  /** Scholar-approved wording (or a draft placeholder while not approved). */
  readonly summary: string;
  readonly sourceRefs: readonly string[];
  /** Approved ruling / finding ids from the research layers. */
  readonly rulingRefs: readonly string[];
  /**
   * Research catalogue questions this rule concerns (docs/research/RESEARCH_MATRIX.md §2), e.g.
   * `INC-01` (M5.4; optional, hashed when present). Links the rule to the research workspace.
   */
  readonly questionIds?: readonly string[];
  /**
   * What is still unresolved for this rule, as recorded by the research team (M5.4; optional,
   * hashed when present). Never a ruling or an interpretation: only what remains to be checked.
   */
  readonly openIssues?: readonly string[];
}

/** A category the user can record amounts under. Meaning is defined by the pack's rules. */
export interface InputCategoryDefinition {
  readonly id: string;
  readonly label: string;
  readonly ruleIds: readonly string[];
}

/**
 * `decimal` (Phase 4, decision 78): a non-negative percentage answered per fact, used only by a
 * mapping amount adjustment; never by program conditions.
 */
export type QuestionKind = 'boolean' | 'choice' | 'decimal';

export interface QuestionDefinition {
  readonly id: string;
  readonly label: string;
  readonly kind: QuestionKind;
  /**
   * Decision 82, `decimal` questions only: what the number is. `PERCENT` (the default when
   * absent) is a percentage; `AMOUNT` is a money amount in the assessment currency.
   */
  readonly unit?: 'PERCENT' | 'AMOUNT';
  /** Allowed answers for `choice` questions; empty for `boolean`. */
  readonly choices: readonly string[];
  readonly required: boolean;
  readonly ruleIds: readonly string[];
}

/** A scalar parameter (e.g. a rate) whose value comes from an approved rule. */
export interface ParameterDefinition {
  readonly id: string;
  readonly label: string;
  readonly value: DecimalString;
  readonly ruleIds: readonly string[];
}

/** A situation in which the engine must stop and refer the user to qualified guidance. */
export interface ConsultationDefinition {
  readonly id: string;
  readonly label: string;
  readonly ruleIds: readonly string[];
}

// ── Program (declarative calculation) ───────────────────────────────────────────────

export type Expression =
  /** Sum of the user's entries in the given categories (money). */
  | { readonly op: 'sumCategories'; readonly categoryIds: readonly string[] }
  /** A pack parameter (scalar). */
  | { readonly op: 'parameter'; readonly parameterId: string }
  /** The value of an earlier step. */
  | { readonly op: 'step'; readonly stepId: string }
  /** Money zero. */
  | { readonly op: 'zero' }
  | { readonly op: 'add'; readonly operands: readonly Expression[] }
  | {
      readonly op: 'subtract';
      readonly minuend: Expression;
      readonly subtrahends: readonly Expression[];
    }
  | { readonly op: 'multiply'; readonly value: Expression; readonly factor: Expression }
  /** `of × rate ÷ 100`, exact. */
  | { readonly op: 'percentage'; readonly of: Expression; readonly rate: Expression }
  | { readonly op: 'max'; readonly operands: readonly Expression[] }
  | { readonly op: 'min'; readonly operands: readonly Expression[] }
  /**
   * Decision 82: `dividend ÷ divisor`, rounded as stated (a quotient is generally not a finite
   * decimal, so the rounding is part of the operation and never implied). A zero divisor stops
   * as unresolved, never divides.
   */
  | {
      readonly op: 'divide';
      readonly dividend: Expression;
      readonly divisor: Expression;
      readonly rounding: RoundingSpec;
    }
  | {
      readonly op: 'when';
      readonly condition: Condition;
      readonly then: Expression;
      readonly otherwise: Expression;
    }
  /** Stop: this value cannot be calculated; individual consultation is required. */
  | { readonly op: 'consult'; readonly consultationId: string };

export type ComparisonOperator = 'lt' | 'lte' | 'eq' | 'gte' | 'gt';

export type Condition =
  | { readonly kind: 'answer'; readonly questionId: string; readonly equals: boolean | string }
  | {
      readonly kind: 'compare';
      readonly left: Expression;
      readonly operator: ComparisonOperator;
      readonly right: Expression;
    }
  /**
   * Phase 4 (decision 78), annual only: the assessment period's length in days, both ends
   * included, compared with a whole number of days.
   */
  | { readonly kind: 'periodDays'; readonly operator: ComparisonOperator; readonly days: number }
  | { readonly kind: 'all'; readonly conditions: readonly Condition[] }
  | { readonly kind: 'any'; readonly conditions: readonly Condition[] }
  | { readonly kind: 'not'; readonly condition: Condition };

export interface RoundingSpec {
  /** Decimal places, or the currency's ISO 4217 minor units. */
  readonly scale: number | 'currency';
  readonly mode: RoundingMode;
}

export interface ProgramStep {
  readonly id: string;
  readonly label: string;
  /** Rules that justify this step. Production requires ≥ 1 approved, sourced rule. */
  readonly ruleIds: readonly string[];
  readonly expression: Expression;
  readonly rounding: RoundingSpec | null;
}

export interface ProgramOutput {
  readonly id: string;
  readonly label: string;
  readonly stepId: string;
}

export interface Program {
  readonly steps: readonly ProgramStep[];
  readonly outputs: readonly ProgramOutput[];
}

export interface MissedYearProgram {
  /** Evaluated once per past year. */
  readonly perYear: Program;
  /**
   * Output ids (of `perYear`) the pack explicitly allows to be summed across years.
   * Empty = no aggregate figure (aggregation is itself a rule-pack decision).
   */
  readonly aggregateOutputIds: readonly string[];
  /** Rules that justify the aggregation (required when aggregateOutputIds is non-empty). */
  readonly aggregateRuleIds: readonly string[];
}

export interface RulePackWorkflows {
  readonly annual: Program | null;
  readonly firstTime: Program | null;
  readonly missedYear: MissedYearProgram | null;
}

export interface RulePack {
  readonly metadata: RulePackMetadata;
  readonly sources: readonly SourceReference[];
  readonly rules: readonly RuleDefinition[];
  readonly inputCategories: readonly InputCategoryDefinition[];
  readonly questions: readonly QuestionDefinition[];
  readonly parameters: readonly ParameterDefinition[];
  readonly consultations: readonly ConsultationDefinition[];
  readonly workflows: RulePackWorkflows;
  /**
   * How this pack reads neutral financial facts (schemaVersion 2 only). Absent in version 1
   * packs, which can only be used with inputs already expressed in their categories.
   */
  readonly factMapping?: FactMapping;
  /**
   * In-pack provenance (M5.3.6, D13 §9.3; optional in every schema version, hashed content when
   * present, so packs without it keep their digests): an immutable
   * snapshot of every ruling version the rules cite and its finding → passage → source chain,
   * computed by the server from the research records when the version is submitted or registered.
   * Absent when no rule cites a ruling (older packs are unchanged).
   */
  readonly rulingSnapshots?: readonly RulingSnapshot[];
}

/** A source revision a snapshotted passage belongs to. */
export interface RulingSourceSnapshot {
  readonly entityId: string;
  readonly displayRef: string;
  /** The pinned revision and its record digest. */
  readonly revision: number;
  readonly recordDigest: string;
  readonly title: string;
  readonly copyright: string;
}

/** A passage revision cited by the ruling or one of its findings. */
export interface RulingPassageSnapshot {
  readonly entityId: string;
  readonly displayRef: string;
  readonly revision: number;
  readonly recordDigest: string;
  /** The content revision a pin to `revision` refers to, and its payload digest. */
  readonly contentRevision: number;
  readonly payloadDigest: string;
  readonly locator: Readonly<Record<string, unknown>>;
  readonly originalLanguage: string;
  /** Verbatim text only when the source's copyright is PERMITTED (D10); otherwise null. */
  readonly text: string | null;
  readonly source: RulingSourceSnapshot;
}

/** A finding revision the ruling cites. */
export interface RulingFindingSnapshot {
  readonly entityId: string;
  readonly displayRef: string;
  readonly revision: number;
  readonly recordDigest: string;
  readonly contentRevision: number;
  readonly payloadDigest: string;
  readonly questionId: string;
  /** The passage revisions the finding cites (`<entityId>@<revision>`). */
  readonly passageRefs: readonly string[];
}

/** One cited ruling version as it stood when the pack version was submitted or registered. */
export interface RulingSnapshot {
  /** `<ruling entity id>@<version>`, as the rules cite it. */
  readonly ref: string;
  readonly marjaId: string;
  readonly displayRef: string;
  readonly rulingSeriesId: string;
  readonly rulingVersion: number;
  /** DRAFT (staff-only provisional packs) or APPROVED, at snapshot time. */
  readonly state: 'DRAFT' | 'APPROVED';
  /** The ruling's latest content revision, its payload digest and record digest. */
  readonly contentRevision: number;
  readonly payloadDigest: string;
  readonly contentRecordDigest: string;
  /** The scholar's ruling text (conclusion, conditions, exceptions, precaution, explanation). */
  readonly payload: Readonly<Record<string, unknown>>;
  readonly findings: readonly RulingFindingSnapshot[];
  readonly passages: readonly RulingPassageSnapshot[];
}

/**
 * Activation record: the separate, explicit act that makes a published, approved pack
 * usable in production. Stored outside the (immutable) pack.
 */
export interface RulePackActivation {
  readonly packId: string;
  readonly version: string;
  /** The verified content this activation was created for; must equal the recomputed digest. */
  readonly integrity: ContentIntegrity;
  readonly activatedAt: IsoDate;
  readonly activatedBy: string;
  /** References to the approval records this activation relies on. */
  readonly approvalReferences: readonly string[];
  /** The governance PUBLISHED record (`packId@version#n`) this activation was created from. */
  readonly publicationReference: string;
}
