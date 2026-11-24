import { calculate } from '@khums/calculation-engine';
import type {
  Answers,
  CalculationRefusal,
  CalculationReport,
  FactAnswers,
  MappingResult,
  RulePack,
  YearAnswers,
} from '@khums/shared-types';

import { checkPublicPackBundle } from '../governance/public-pack';
import { prepareAssessmentInput } from './prepare-input';

/**
 * Runs one assessment for the results dashboard (M4.5.1): maps the user's neutral facts with the
 * pack's own fact mapping, then calculates. DEVELOPMENT ONLY for now: it accepts only packs
 * marked `isMock: true` and always calculates in development mode, so every result carries
 * `NOT_RELIGIOUS_GUIDANCE` and the engine's disclaimer. Scholar-review packs get their own mode in
 * M4.5a; authoritative production calculations go through the governed readiness path and are
 * never run here.
 *
 * Pure: no I/O, no storage; the caller keeps the facts on the user's device.
 */
export type AssessmentRun =
  /** The pack is not a mock pack: refused here (provisional and approved packs never run here). */
  | { readonly kind: 'NOT_A_DEVELOPMENT_PACK' }
  /** Mapping needs clarification, a consultation stops it, or something is unsupported. */
  | { readonly kind: 'NEEDS_INPUT'; readonly mapping: MappingResult }
  /** The engine refused (invalid input or pack, unsupported workflow). */
  | {
      readonly kind: 'REFUSED';
      readonly mapping: MappingResult;
      readonly refusal: CalculationRefusal;
    }
  /** Calculated: the report may still contain unresolved cases (consultation, missing answer). */
  | {
      readonly kind: 'CALCULATED';
      readonly mapping: MappingResult;
      readonly report: CalculationReport;
    };

export function runDevelopmentAssessment(
  rawSheet: unknown,
  pack: RulePack,
  answers: Answers = {},
  factAnswers: FactAnswers = {},
  yearAnswers: YearAnswers = {},
): AssessmentRun {
  if (!pack.metadata.isMock) return { kind: 'NOT_A_DEVELOPMENT_PACK' };
  const mapping = prepareAssessmentInput(rawSheet, pack, answers, factAnswers, yearAnswers);
  if (mapping.status !== 'MAPPED' || mapping.input === null) {
    return { kind: 'NEEDS_INPUT', mapping };
  }
  const result = calculate(mapping.input, pack, { mode: 'development' });
  return result.ok
    ? { kind: 'CALCULATED', mapping, report: result.value }
    : { kind: 'REFUSED', mapping, refusal: result.error };
}

/**
 * Runs one PUBLIC assessment with a verified pack (decision 65), in the user's browser: the facts
 * never leave the device (decision 27). The bundle (redacted pack + public verification summary,
 * as served by the API, which ran the governed ledger check) is checked again here with
 * `checkPublicPackBundle` (recomputed digest, engine production readiness for every workflow,
 * never mock or scholar-review content); the facts are mapped with the pack's own approved fact
 * mapping; the engine then calculates in `production` mode with the activation the summary names,
 * which re-runs the production gate with the user's own periods. A result is only ever returned
 * with the engine's `APPROVED_RULE_PACK` guidance. The ledger is never sent to the browser.
 */
export type VerifiedAssessmentRun =
  /** The bundle is not a public verified pack (or the result would not be approved). */
  | { readonly kind: 'NOT_VERIFIED' }
  | Exclude<AssessmentRun, { readonly kind: 'NOT_A_DEVELOPMENT_PACK' }>;

export function runVerifiedAssessment(
  rawSheet: unknown,
  bundle: { readonly pack: unknown; readonly summary: unknown },
  answers: Answers = {},
  factAnswers: FactAnswers = {},
  yearAnswers: YearAnswers = {},
): VerifiedAssessmentRun {
  const verified = checkPublicPackBundle(bundle.pack, bundle.summary);
  if (!verified.ok) return { kind: 'NOT_VERIFIED' };
  const { pack, activation } = verified.value;
  const mapping = prepareAssessmentInput(rawSheet, pack, answers, factAnswers, yearAnswers);
  if (mapping.status !== 'MAPPED' || mapping.input === null) {
    return { kind: 'NEEDS_INPUT', mapping };
  }
  const result = calculate(mapping.input, pack, { mode: 'production', activation });
  if (!result.ok) return { kind: 'REFUSED', mapping, refusal: result.error };
  // Defence in depth: a public result is only ever an approved, non-mock production result.
  const { meta } = result.value;
  if (
    meta.guidance !== 'APPROVED_RULE_PACK' ||
    meta.mode !== 'production' ||
    meta.rulePack.isMock
  ) {
    return { kind: 'NOT_VERIFIED' };
  }
  return { kind: 'CALCULATED', mapping, report: result.value };
}
