import type { GovernancePolicyId } from '@khums/shared-types';

/**
 * Version-controlled INITIAL per-Marja governance policy configuration (single-scholar stage 4).
 *
 * Applied only when the policy store is empty, as first assignments by
 * `system:initial-configuration`; every later change needs two administrators (a proposal and
 * a confirmation by another, both audited in the registry). Marja ids must exist in the catalogue.
 *
 * Owner decision 2026-11-22 (M5.3.3 plan R3): only the initial research scope, Sistani and
 * Khamenei (`INITIAL_RESEARCH_MARJAS`), is configured. The other catalogue Marjas stay
 * UNCONFIGURED: rule-pack submissions for them are refused (fail closed,
 * `activeGovernancePolicy`) until two administrators configure them through the audited registry,
 * and research creation for them is refused independently (D12). A policy is a governance process
 * setting only: not religious approval, not production authorization, and not an indication that
 * calculation is available for any Marja. (The earlier six-Marja seed of 2026-11-21 was never
 * applied to any database.)
 */
export const INITIAL_GOVERNANCE_POLICIES: readonly {
  readonly marjaId: string;
  readonly policy: GovernancePolicyId;
}[] = Object.freeze([
  { marjaId: 'sistani', policy: 'SINGLE_SCHOLAR_V1' }, // Sayyid Ali al-Husayni al-Sistani
  { marjaId: 'khamenei', policy: 'SINGLE_SCHOLAR_V1' }, // Sayyid Ali Khamenei
]);

export const INITIAL_GOVERNANCE_POLICY_REASON =
  'Initial configuration: single-scholar governance for the initial research scope (owner decision 2026-11-22).';

/**
 * Fixed time and request id of the initial records written by the migration command (M4.6.3a),
 * so every run builds byte-identical records: re-running the seed is idempotent, and a stored
 * registry that differs is left untouched and reported (changes need two administrators).
 */
export const INITIAL_GOVERNANCE_POLICY_RECORDED_AT = '2026-11-22T00:00:00.000Z';
export const INITIAL_GOVERNANCE_POLICY_SEED_REQUEST_ID = 'migration:initial-configuration';
