/**
 * Review status of a rule-pack rule (M5.4 review infrastructure; owner decision 2026-11-22).
 *
 * The status is DERIVED, never stored and never authored: it is computed from the pack content
 * (declared source-locator checks, cited ruling versions) and from the live research and feedback
 * records. It never approves anything; approval stays with the governing scholar's ruling and pack
 * workflows. A status says how far a rule's evidence has come, not what the rule says.
 *
 * - `SOURCE_VERIFIED_AWAITING_SCHOLAR_REVIEW`: the rule cites ruling versions whose whole evidence
 *   chain (sources, passages) the scholar has verified, but the ruling or its encoding is not yet
 *   scholar-approved.
 * - `PARTIALLY_VERIFIED`: source locators were checked (tool-assisted, documented in
 *   docs/research), or some evidence is verified, but there is no complete scholar-verified chain.
 * - `SOURCE_UNVERIFIED`: no checked source locator and no scholar-verified evidence.
 * - `SCHOLAR_APPROVED`: every cited ruling version is the current APPROVED one and the rule's
 *   encoding is approved.
 * - `SCHOLAR_REJECTED`: a cited ruling version was withdrawn by the scholar.
 * - `NEEDS_CORRECTION`: a cited ruling was superseded or revised after this pack version, or a
 *   correction was requested through feedback.
 */
export type RuleReviewStatus =
  | 'SOURCE_VERIFIED_AWAITING_SCHOLAR_REVIEW'
  | 'PARTIALLY_VERIFIED'
  | 'SOURCE_UNVERIFIED'
  | 'SCHOLAR_APPROVED'
  | 'SCHOLAR_REJECTED'
  | 'NEEDS_CORRECTION';

/**
 * Tool-assisted locator check of a source reference (docs/research/PRIMARY_SOURCE_INVENTORY §1):
 * whether the cited number or heading exists where stated, in a stated edition. It is NOT the
 * scholar's verification and says nothing about what the text rules.
 */
export type LocatorCheck = 'VERIFIED' | 'PARTIALLY_VERIFIED' | 'UNVERIFIED';

/** Why a rule has its status (stable codes; the web localizes them). */
export type RuleReviewReason =
  /** A cited ruling version was withdrawn. */
  | 'RULING_WITHDRAWN'
  /** A cited ruling version was superseded by a newer approved version. */
  | 'RULING_SUPERSEDED'
  /** A cited ruling changed after this pack version froze its provenance. */
  | 'RULING_CHANGED_SINCE_PACK'
  /** Open feedback on this rule asks for a correction (rule content or source). */
  | 'CORRECTION_REQUESTED'
  /** A cited ruling version is still a draft. */
  | 'RULING_NOT_APPROVED'
  /** The rule's encoding in this pack is not approved (rule status UNVERIFIED). */
  | 'ENCODING_NOT_APPROVED'
  /** A cited ruling's evidence chain is incomplete or not verified. */
  | 'EVIDENCE_NOT_VERIFIED'
  /** A cited ruling version cannot be found in this Marja's research records. */
  | 'RULING_NOT_FOUND'
  /** The rule cites no research ruling: there is no scholar-verified evidence at all. */
  | 'NO_SCHOLAR_RESEARCH'
  /** At least one cited source locator is not checked. */
  | 'SOURCE_LOCATOR_UNCHECKED';

/** What is still needed before the rule could calculate anything authoritative. */
export type ReviewMissingItem =
  | 'SCHOLAR_SOURCE_VERIFICATION'
  | 'VERIFIED_PASSAGE'
  | 'APPROVED_FINDING'
  | 'APPROVED_RULING'
  | 'ENCODED_CALCULATION'
  | 'SCHOLAR_APPROVAL_OF_ENCODING';

export interface RuleReview {
  readonly ruleId: string;
  readonly status: RuleReviewStatus;
  readonly reasons: readonly RuleReviewReason[];
  readonly missing: readonly ReviewMissingItem[];
}
