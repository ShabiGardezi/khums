import { verifiedBundleWorkflows } from '@khums/core';
import type { RulePack, Workflow } from '@khums/shared-types';

/**
 * Where the browser's calculation rules come from, as chosen by the SERVER for its operational
 * state (decision 65):
 * - `DEVELOPMENT`: the non-religious mock pack (local machines and CI only);
 * - `VERIFIED`: the public state; per Marja, only the governed, published, activated and ready
 *   pack that the API served (checked again in the browser before every calculation).
 * Every other state offers no calculation (null). Provisional packs never reach the browser here.
 */
export type CalculationSource =
  | { readonly kind: 'DEVELOPMENT'; readonly pack: RulePack }
  | {
      readonly kind: 'VERIFIED';
      /** `UNAVAILABLE`: the verified packs could not be loaded; no figures are offered. */
      readonly status: 'READY' | 'UNAVAILABLE';
      readonly packs: Readonly<Record<string, VerifiedPackSource>>;
    };

/**
 * A verified pack as the API served it (pack with person ids redacted, plus the public
 * verification summary; never the governance ledger): untrusted JSON until
 * `checkPublicPackBundle` passes.
 */
export interface VerifiedPackSource {
  readonly pack: unknown;
  readonly summary: unknown;
}

/** What the results step can do for the selected Marja. */
export type MarjaCalculation =
  | { readonly kind: 'DEVELOPMENT'; readonly pack: RulePack }
  | { readonly kind: 'VERIFIED'; readonly marjaId: string; readonly bundle: VerifiedPackSource }
  /** Public state, no verified pack for this Marja: a clear message and no figures. */
  | { readonly kind: 'NO_VERIFIED_RULES' }
  /** Public state, the verified packs could not be loaded: a clear message and no figures. */
  | { readonly kind: 'VERIFIED_UNAVAILABLE' }
  /** No calculation in this operational state. */
  | { readonly kind: 'NONE' };

export function calculationFor(
  source: CalculationSource | null,
  marjaId: string,
): MarjaCalculation {
  if (source === null) return { kind: 'NONE' };
  if (source.kind === 'DEVELOPMENT') return { kind: 'DEVELOPMENT', pack: source.pack };
  if (source.status === 'UNAVAILABLE') return { kind: 'VERIFIED_UNAVAILABLE' };
  const bundle = Object.hasOwn(source.packs, marjaId) ? source.packs[marjaId] : undefined;
  return bundle === undefined
    ? { kind: 'NO_VERIFIED_RULES' }
    : { kind: 'VERIFIED', marjaId, bundle };
}

/** Whether the public calculator has verified rules for `marjaId` (the Marja list's badge). */
export const hasVerifiedRules = (source: CalculationSource | null, marjaId: string): boolean =>
  calculationFor(source, marjaId).kind === 'VERIFIED';

/**
 * The assessment types offered for `marjaId` (Phase 3 step 1), or null when not restricted.
 * Public state with a verified pack: exactly the workflows that pack defines (re-checked with
 * `checkPublicPackBundle`; a bundle failing it offers none). Everywhere else (development mock
 * mode, no calculation, a Marja without verified rules, packs that could not be loaded) the types
 * are not restricted: no figures are offered there, and the existing messages say so.
 */
export function offeredWorkflows(
  source: CalculationSource | null,
  marjaId: string,
): readonly Workflow[] | null {
  const calculation = calculationFor(source, marjaId);
  if (calculation.kind !== 'VERIFIED') return null;
  return verifiedBundleWorkflows(calculation.bundle) ?? [];
}
