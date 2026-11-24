import type {
  AssessmentInput,
  CalculationIssue,
  CalculationMeta,
  CalculationRefusal,
  CalculationReport,
  MissedYearAggregate,
  Program,
  RefusalReason,
  RulePack,
  RulePackActivation,
} from '@khums/shared-types';
import { Decimal, getCurrency } from '@khums/money';
import { assertNever, daysBetweenIsoDates, err, invariant, ok, type Result } from '@khums/utils';

import { validateInput } from './input/validate-input';
import { asWarnings, hasErrors, issue } from './issues';
import type { InferredKind } from './rule-pack/program-analysis';
import {
  checkProductionReadiness,
  checkScholarReviewReadiness,
  type DateRange,
} from './rule-pack/readiness';
import { validateRulePackStructure } from './rule-pack/structure';
import { recomputedDigest } from './integrity/rule-pack-integrity';
import { ENGINE_VERSION } from './version';
import { runProgram } from './workflows/run-program';

export type CalculationOptions =
  /** Production: requires a published, scholar-approved, activated pack (see readiness gate). */
  | { readonly mode: 'production'; readonly activation: RulePackActivation }
  /**
   * Scholar review (M4.5a): only sealed, sourced schemaVersion 3 packs on the `SCHOLAR_REVIEW`
   * channel (`checkScholarReviewReadiness`). Results are labelled PROVISIONAL_SCHOLAR_REVIEW with
   * the PROVISIONAL — FOR SCHOLAR REVIEW ONLY disclaimer; never religious guidance.
   */
  | { readonly mode: 'scholar-review' }
  /**
   * Development: allows draft/mock packs. Results are labelled NOT_RELIGIOUS_GUIDANCE with a
   * MOCK / NOT FOR PRODUCTION disclaimer, and readiness gaps are returned as warnings. Packs on the
   * scholar-review channel are refused (their results must always carry the provisional label).
   */
  | { readonly mode: 'development' };

export const DEVELOPMENT_DISCLAIMER =
  'MOCK / NOT FOR PRODUCTION — development calculation. Not religious guidance and not a ruling of any Marja.';

/** Canonical label of every provisional calculation, report and export (M4.5a). */
export const PROVISIONAL_LABEL = 'PROVISIONAL — FOR SCHOLAR REVIEW ONLY';

export const PROVISIONAL_DISCLAIMER = `${PROVISIONAL_LABEL} — proposed rules under scholarly review. Not religious guidance, not an approved ruling of any Marja, and not to be relied on for paying Khums.`;

const programFor = (pack: RulePack, input: AssessmentInput): Program | null => {
  switch (input.workflow) {
    case 'annual':
      return pack.workflows.annual;
    case 'first-time':
      return pack.workflows.firstTime;
    case 'missed-year':
      return pack.workflows.missedYear?.perYear ?? null;
    /* v8 ignore next 2 -- exhaustive switch guard, unreachable by type */
    default:
      return assertNever(input);
  }
};

const dateRangesFor = (input: AssessmentInput): DateRange[] => {
  switch (input.workflow) {
    case 'annual':
      return [input.period];
    case 'first-time':
      return [{ start: input.assessmentDate, end: input.assessmentDate }];
    case 'missed-year':
      return input.years.map((y) => y.period);
    /* v8 ignore next 2 -- exhaustive switch guard, unreachable by type */
    default:
      return assertNever(input);
  }
};

const kindsKey = (input: AssessmentInput): 'annual' | 'firstTime' | 'missedYear' =>
  input.workflow === 'annual'
    ? 'annual'
    : input.workflow === 'first-time'
      ? 'firstTime'
      : 'missedYear';

/**
 * Runs a Khums assessment workflow by interpreting the rule pack's program.
 *
 * The engine contains no Khums formula. It refuses (returns `err`) when the pack is malformed,
 * the workflow is not defined by the pack, the input is invalid, or — in production — the pack
 * is not published, scholar-approved, activated and fully approved for the rules it uses.
 */
export function calculate(
  input: AssessmentInput,
  pack: RulePack,
  options: CalculationOptions,
): Result<CalculationReport, CalculationRefusal> {
  const refuse = (reason: RefusalReason, issues: readonly CalculationIssue[]) =>
    err({ reason, workflow: input.workflow, mode: options.mode, issues });

  const structure = validateRulePackStructure(pack);
  if (structure.issues.length > 0) return refuse('INVALID_RULE_PACK', structure.issues);

  const program = programFor(pack, input);
  if (program === null) {
    return refuse('WORKFLOW_NOT_SUPPORTED', [
      issue(
        'WORKFLOW_NOT_SUPPORTED',
        `Rule pack "${pack.metadata.packId}" defines no ${input.workflow} workflow`,
        'workflows',
      ),
    ]);
  }

  const inputIssues = validateInput(input, pack, program);
  if (hasErrors(inputIssues)) return refuse('INVALID_INPUT', inputIssues);

  // Strict separation by release channel: each mode has its own gate, and no gate accepts another
  // mode's packs (production refuses scholar-review packs inside `checkProductionReadiness`).
  let readiness: CalculationIssue[];
  switch (options.mode) {
    case 'production':
      readiness = checkProductionReadiness(pack, {
        workflow: input.workflow,
        activation: options.activation,
        dateRanges: dateRangesFor(input),
      });
      if (readiness.length > 0) return refuse('RULE_PACK_NOT_READY', readiness);
      break;
    case 'scholar-review':
      readiness = checkScholarReviewReadiness(pack, {
        workflow: input.workflow,
        dateRanges: dateRangesFor(input),
      });
      if (readiness.length > 0) return refuse('RULE_PACK_NOT_READY', readiness);
      break;
    case 'development':
      if (pack.metadata.releaseChannel === 'SCHOLAR_REVIEW') {
        return refuse('RULE_PACK_NOT_READY', [
          issue(
            'CHANNEL_MISMATCH',
            'Scholar-review packs are only calculated in scholar-review mode (provisional label)',
            'metadata.releaseChannel',
          ),
        ]);
      }
      readiness = checkProductionReadiness(pack, {
        workflow: input.workflow,
        activation: null,
        dateRanges: dateRangesFor(input),
      });
      break;
    /* v8 ignore next 2 -- exhaustive switch guard, unreachable by type */
    default:
      return assertNever(options);
  }

  const currencyResult = getCurrency(input.currency);
  invariant(currencyResult.ok, 'Currency validated above');
  const currency = currencyResult.value;
  const stepKinds: ReadonlyMap<string, InferredKind> = structure.stepKinds[kindsKey(input)];

  const meta: CalculationMeta = {
    engineVersion: ENGINE_VERSION,
    mode: options.mode,
    guidance:
      options.mode === 'production'
        ? 'APPROVED_RULE_PACK'
        : options.mode === 'scholar-review'
          ? 'PROVISIONAL_SCHOLAR_REVIEW'
          : 'NOT_RELIGIOUS_GUIDANCE',
    disclaimer:
      options.mode === 'production'
        ? null
        : options.mode === 'scholar-review'
          ? PROVISIONAL_DISCLAIMER
          : DEVELOPMENT_DISCLAIMER,
    rulePack: {
      packId: pack.metadata.packId,
      marjaId: pack.metadata.marjaId,
      version: pack.metadata.version,
      status: pack.metadata.status,
      isMock: pack.metadata.isMock,
      releaseChannel: pack.metadata.releaseChannel ?? null,
      contentHash: pack.metadata.contentHash,
      // Recomputed from the content actually used (traceability), whatever was declared.
      contentDigest: recomputedDigest(pack),
    },
    currency: currency.code,
    warnings: [...inputIssues, ...(options.mode === 'development' ? asWarnings(readiness) : [])],
  };

  switch (input.workflow) {
    case 'annual':
    case 'first-time': {
      const periodDays =
        input.workflow === 'annual'
          ? daysBetweenIsoDates(input.period.start, input.period.end) + 1
          : null;
      const run = runProgram(
        pack,
        program,
        stepKinds,
        input.entries,
        input.answers,
        currency,
        periodDays,
      );
      return ok({ workflow: input.workflow, meta, result: run.result });
    }
    case 'missed-year': {
      const missedYear = pack.workflows.missedYear;
      invariant(missedYear, 'Program presence checked above');
      const runs = input.years.map((year) => ({
        period: year.period,
        run: runProgram(pack, program, stepKinds, year.entries, year.answers, currency),
      }));

      let aggregate: MissedYearAggregate | null = null;
      if (missedYear.aggregateOutputIds.length > 0) {
        // A total is complete only when every year is: a year with any open item (a review, a
        // settlement, a payment to reconcile, a missing answer) makes the sum PARTIAL, never the
        // amount due (audit 2026-11-23 C5/T2).
        const openYearIndexes = runs.flatMap((r, i) =>
          r.run.result.status === 'COMPLETED' ? [] : [i],
        );
        const anyMissing = runs.some((r) =>
          missedYear.aggregateOutputIds.some((id) => r.run.outputValues.get(id) === null),
        );
        const completeness = anyMissing
          ? 'UNRESOLVED'
          : openYearIndexes.length > 0
            ? 'PARTIAL'
            : 'COMPLETE';
        aggregate = {
          status: completeness === 'COMPLETE' ? 'COMPLETED' : 'UNRESOLVED',
          completeness,
          ruleIds: missedYear.aggregateRuleIds,
          openYearIndexes,
          outputs: missedYear.aggregateOutputIds.map((id) => {
            const output = program.outputs.find((o) => o.id === id);
            invariant(output, `Unknown aggregate output ${id} (pack not validated?)`);
            if (anyMissing) return { id, label: output.label, value: null };
            const total = runs.reduce((sum, r) => {
              const value = r.run.outputValues.get(id);
              invariant(value, 'All aggregated outputs are resolved here');
              return sum.add(value);
            }, Decimal.ZERO);
            return {
              id,
              label: output.label,
              value: { amount: total.toString(), currency: currency.code },
            };
          }),
        };
      }
      return ok({
        workflow: 'missed-year',
        meta,
        years: runs.map((r) => ({ period: r.period, result: r.run.result })),
        aggregate,
      });
    }
    /* v8 ignore next 2 -- exhaustive switch guard, unreachable by type */
    default:
      return assertNever(input);
  }
}
