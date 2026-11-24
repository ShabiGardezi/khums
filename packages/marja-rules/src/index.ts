/**
 * @khums/marja-rules — public API.
 *
 * Holds Marja data: the (provisional) Marja catalogue now, and versioned, source-cited rule packs
 * in Milestone 4 (no calculation code here).
 *
 * NO RULINGS ARE DEFINED HERE. Rule content requires the verification and review process in
 * docs/RELIGIOUS_RULES.md and docs/research/ before it may be added.
 */
export type { CatalogueIssue } from './catalogue/policy';
export {
  allowedEvidenceConfidence,
  checkCatalogueConsistency,
  findMarja,
  isCalculationAvailable,
  isCountable,
  isListableInProductionDirectory,
  isReadable,
} from './catalogue/policy';
export { PROVISIONAL_MARJA_CATALOGUE } from './catalogue/provisional-catalogue';
