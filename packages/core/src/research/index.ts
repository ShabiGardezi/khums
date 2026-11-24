/** Scholar research management foundations (M5.3.2; docs/SCHOLAR_RESEARCH_ARCHITECTURE.md). */
export type {
  ResearchCommand,
  ResearchCommandInput,
  ResearchCommandOutcome,
  ResearchRefusalCode,
} from './actions';
export { executeResearchCommand } from './actions';
export type { AiIssueCode } from './ai-involvement';
export { aiReviewPending, effectiveAiInvolvement } from './ai-involvement';
export type { AiProvenanceEntry, AiProvenanceEvent } from './ai-provenance';
export { researchAiProvenance } from './ai-provenance';
export type { ResearchCatalogueQuestion } from './catalogue';
export type {
  EvidenceAttachmentInput,
  EvidenceAttachmentIssueCode,
  EvidenceAttachmentOutcome,
  EvidenceCommandOutcome,
  EvidenceContentIssueCode,
  EvidenceRefusalCode,
} from './evidence';
export {
  checkEvidenceContent,
  decideEvidenceAttachment,
  EVIDENCE_ENTITY_TYPES,
  evidenceReadDecision,
} from './evidence';
export { executeEvidenceCommand } from './evidence';
export {
  isCatalogueQuestion,
  RESEARCH_CATALOGUE_REVISION,
  RESEARCH_QUESTION_CATALOGUE,
} from './catalogue';
export type {
  ResearchBinding,
  ResearchIssueCode,
  ResearchRevisionDraft,
  ResearchView,
} from './chain';
export { appendResearchRevision, replayResearchChain } from './chain';
export { formatUuidV7, researchDisplayRef } from './ids';
export type { ResearchAction } from './lifecycle';
export {
  ALLOWED_REFERENCES,
  REASON_REQUIRED,
  REQUIRED_REFERENCE_STATE,
  RESEARCH_TRANSITIONS,
  researchPermissionFor,
} from './lifecycle';
export type { ReferenceIssue, ReferenceIssueCode, ReferenceResolver } from './references';
export { checkResearchReferences } from './references';
export type {
  RulingSeries,
  RulingSeriesInput,
  RulingSeriesIssueCode,
  RulingVersion,
} from './rulings';
export { replayRulingSeries, rulingSeriesForCreate } from './rulings';
export type {
  ResearchChainLoader,
  RulingReferenceIssue,
  RulingReferenceIssueCode,
  RulingReferencePolicy,
} from './rule-pack-references';
export {
  buildRulingSnapshots,
  checkRulingSnapshots,
  parseRulingRef,
  rulingContentRecordDigest,
  rulingIdsOf,
  rulingReferenceIssue,
  withRulingSnapshots,
} from './rule-pack-references';
export { INITIAL_RESEARCH_MARJAS, isResearchMarja } from './scope';
export { rulingReviewStatus } from './ruling-review-status';
