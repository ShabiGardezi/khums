import type {
  Answers,
  AssessmentResult,
  BreakdownStep,
  CurrencyInfoLike,
  FinancialEntry,
  Program,
  RulePack,
  UnresolvedCase,
} from './types';
import { Decimal } from '@khums/money';
import { invariant } from '@khums/utils';

import { evaluate, type Evaluated, type UnresolvedRef } from '../evaluate/evaluator';
import type { InferredKind } from '../rule-pack/program-analysis';

export interface ProgramRun {
  readonly result: AssessmentResult;
  /** Exact output values (for aggregation), keyed by output id; null when unresolved. */
  readonly outputValues: ReadonlyMap<string, Decimal | null>;
}

function sumByCategory(entries: readonly FinancialEntry[]): Map<string, Decimal> {
  const sums = new Map<string, Decimal>();
  for (const entry of entries) {
    const amount = Decimal.parse(entry.amount);
    invariant(amount.ok, 'Entry amounts must be validated before evaluation');
    let counted = amount.value;
    // Phase 4 / decision 82: the mapping's per-entry percentages (validated input), applied
    // exactly and in order.
    const adjustments =
      entry.adjustments ?? (entry.adjustment === undefined ? [] : [entry.adjustment]);
    for (const adjustment of adjustments) {
      const percent = Decimal.parse(adjustment.percent);
      invariant(percent.ok, 'Adjustments must be validated before evaluation');
      const part = counted.percentage(percent.value);
      counted = adjustment.mode === 'PERCENT' ? part : counted.add(part);
    }
    sums.set(entry.categoryId, (sums.get(entry.categoryId) ?? Decimal.ZERO).add(counted));
  }
  return sums;
}

/** Evaluates one workflow program against one set of entries and answers. */
export function runProgram(
  pack: RulePack,
  program: Program,
  stepKinds: ReadonlyMap<string, InferredKind>,
  entries: readonly FinancialEntry[],
  answers: Answers,
  currency: CurrencyInfoLike,
  periodDays: number | null = null,
): ProgramRun {
  const rulesById = new Map(pack.rules.map((r) => [r.id, r]));
  const stepValues = new Map<string, Evaluated>();
  const ctx = {
    pack,
    categorySums: sumByCategory(entries),
    answers,
    stepValues,
    periodDays,
    minorUnits: currency.minorUnits,
  };
  const breakdown: BreakdownStep[] = [];

  for (const step of program.steps) {
    let value = evaluate(step.expression, ctx);
    let rounding: BreakdownStep['rounding'] = null;
    if (value.resolved && step.rounding !== null) {
      const scale = step.rounding.scale === 'currency' ? currency.minorUnits : step.rounding.scale;
      value = { resolved: true, value: value.value.round(scale, step.rounding.mode) };
      rounding = { scale, mode: step.rounding.mode };
    }
    stepValues.set(step.id, value);

    const sourceRefs = [
      ...new Set(
        step.ruleIds.flatMap((id) => {
          const rule = rulesById.get(id);
          invariant(rule, `Unknown rule ${id} (pack not validated?)`);
          return rule.sourceRefs;
        }),
      ),
    ];
    const kind = stepKinds.get(step.id);
    invariant(kind, `No inferred kind for step ${step.id} (pack not validated?)`);
    breakdown.push({
      stepId: step.id,
      label: step.label,
      ruleIds: step.ruleIds,
      sourceRefs,
      kind: kind === 'any' ? 'money' : kind,
      value: value.resolved ? value.value.toString() : null,
      rounding,
      unresolvedCaseIds: value.resolved ? [] : value.reasons.map((r) => r.id),
    });
  }

  // Only reasons that actually block an output are reported as unresolved cases.
  const blocking = new Map<string, UnresolvedRef>();
  const outputValues = new Map<string, Decimal | null>();
  const outputs = program.outputs.map((output) => {
    const value = stepValues.get(output.stepId);
    invariant(value, `Output step ${output.stepId} missing (pack not validated?)`);
    if (!value.resolved) {
      value.reasons.forEach((r) => blocking.set(r.id, r));
      outputValues.set(output.id, null);
      return { id: output.id, label: output.label, value: null };
    }
    outputValues.set(output.id, value.value);
    return {
      id: output.id,
      label: output.label,
      value: { amount: value.value.toString(), currency: currency.code },
    };
  });

  const unresolved: UnresolvedCase[] = [...blocking.values()].map((reason) => ({
    id: reason.id,
    kind: reason.kind,
    label: reason.label,
    ruleIds: reason.ruleIds,
    questionId: reason.questionId,
    stepIds: breakdown.filter((s) => s.unresolvedCaseIds.includes(reason.id)).map((s) => s.stepId),
  }));

  return {
    result: {
      status: unresolved.length === 0 ? 'COMPLETED' : 'UNRESOLVED',
      outputs,
      breakdown,
      unresolved,
    },
    outputValues,
  };
}
