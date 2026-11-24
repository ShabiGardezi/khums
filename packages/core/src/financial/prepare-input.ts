import {
  mapFactsToInput,
  recomputedDigest,
  validateRulePackStructure,
} from '@khums/calculation-engine';
import type {
  Answers,
  FactAnswers,
  MappingResult,
  RulePack,
  YearAnswers,
} from '@khums/shared-types';

import { parseFinancialFactSheet } from './fact-sheet';

/**
 * Turns the user's neutral financial facts into the engine input of ONE rule pack, using that
 * pack's own fact mapping (RULE_PACK_STRUCTURE §5.7). It never calculates and never decides a
 * religious treatment: it only applies what the pack's approved mapping says. When the mapping
 * cannot proceed safely, the result lists what to ask the user, or which consultation stops apply.
 *
 * Missed-year sheets take each year's own answers in `yearAnswers` (keyed by period id) and no
 * shared `answers`; one year's answers are never applied to another (decision 62).
 *
 * Production use still goes through `calculate()`, whose readiness gate requires the mapping's
 * rules to be approved and sourced (`requireFactMapping`). Mock packs work in development only.
 */
export function prepareAssessmentInput(
  rawSheet: unknown,
  pack: RulePack,
  answers: Answers = {},
  factAnswers: FactAnswers = {},
  yearAnswers: YearAnswers = {},
): MappingResult {
  const packRef = {
    packId: pack.metadata.packId,
    version: pack.metadata.version,
    contentDigest: recomputedDigest(pack),
    mappingVersion: pack.factMapping?.mappingVersion ?? null,
  };
  const refuse = (code: 'INVALID_FACT_SHEET' | 'INVALID_RULE_PACK'): MappingResult => ({
    status: 'UNSUPPORTED',
    input: null,
    clarifications: [],
    consultations: [],
    unsupported: [{ factId: null, code }],
    trace: [],
    pack: packRef,
  });
  const sheet = parseFinancialFactSheet(rawSheet);
  if (!sheet.ok) return refuse('INVALID_FACT_SHEET');
  if (validateRulePackStructure(pack).issues.some((i) => i.severity === 'error')) {
    return refuse('INVALID_RULE_PACK');
  }
  return mapFactsToInput(sheet.value, pack, { answers, factAnswers, yearAnswers });
}
