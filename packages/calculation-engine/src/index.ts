/**
 * @khums/calculation-engine — public API.
 *
 * A generic, deterministic interpreter for Marja rule packs. It contains **no Khums formula**:
 * which categories count, what is deducted, rates, rounding and consultation stops are all
 * rule-pack data that must be scholar-approved before production use.
 *
 * - `calculate()` runs the annual, first-time or missed-year workflow defined by a rule pack.
 * - Production mode refuses unless the pack is published, approved by a scholar reviewer and a
 *   separate approver, activated, effective for the dates, and every rule it uses is approved
 *   and sourced. Scholar-review mode (M4.5a) accepts only scholar-review channel packs and labels
 *   results PROVISIONAL_SCHOLAR_REVIEW. Development mode labels results NOT_RELIGIOUS_GUIDANCE
 *   (MOCK / NOT FOR PRODUCTION). No mode accepts another mode's packs.
 * - All arithmetic uses @khums/money (exact decimals); amounts are decimal strings.
 * - Platform-agnostic: no framework, database, Node or browser APIs; no clock (dates are inputs).
 */
export type { CalculationOptions } from './calculate';
export {
  calculate,
  DEVELOPMENT_DISCLAIMER,
  PROVISIONAL_DISCLAIMER,
  PROVISIONAL_LABEL,
} from './calculate';
export type {
  DateRange,
  ReadinessRequest,
  ScholarReviewReadinessRequest,
} from './rule-pack/readiness';
export {
  checkActivationEligibility,
  checkApprovalEligibility,
  checkProductionReadiness,
  checkPublicationEligibility,
  checkScholarReviewReadiness,
} from './rule-pack/readiness';
export type { CanonicalizationError, CanonicalizationErrorCode } from './integrity/canonical';
export { canonicalize } from './integrity/canonical';
export type { IntegrityComputationError } from './integrity/rule-pack-integrity';
export {
  canonicalDigest,
  canonicalRulePackContent,
  computeRulePackIntegrity,
  EXCLUDED_METADATA_FIELDS,
  recomputedDigest,
  RULE_PACK_CANONICALIZATION,
  RULE_PACK_INTEGRITY_SCOPE,
  sameIntegrity,
  sealRulePack,
} from './integrity/rule-pack-integrity';
export type { StructureReport } from './rule-pack/structure';
export { validateRulePackStructure } from './rule-pack/structure';
export { validateInput } from './input/validate-input';
export { ENGINE_VERSION } from './version';
export type { MapFactsOptions } from './mapping/map-facts';
export { mapFactsToInput } from './mapping/map-facts';
export { validateFactMappingStructure } from './mapping/structure';
export { FACT_DATE_FIELDS, SUPPORTED_MAPPING_VERSIONS } from './mapping/vocabulary';
