import type {
  Answers,
  ComparisonOperator,
  Condition,
  Expression,
  RulePack,
  UnresolvedKind,
} from '@khums/shared-types';
import { Decimal } from '@khums/money';
import { assertNever, invariant } from '@khums/utils';

/** A reason a value could not be calculated. Registered on the result only if it matters. */
export interface UnresolvedRef {
  readonly id: string;
  readonly kind: UnresolvedKind;
  readonly label: string;
  readonly ruleIds: readonly string[];
  readonly questionId: string | null;
}

export type Evaluated =
  | { readonly resolved: true; readonly value: Decimal }
  | { readonly resolved: false; readonly reasons: readonly UnresolvedRef[] };

type ConditionResult =
  | { readonly resolved: true; readonly value: boolean }
  | { readonly resolved: false; readonly reasons: readonly UnresolvedRef[] };

export interface EvaluationContext {
  readonly pack: RulePack;
  readonly categorySums: ReadonlyMap<string, Decimal>;
  readonly answers: Answers;
  readonly stepValues: ReadonlyMap<string, Evaluated>;
  /** Annual workflow: the assessment period's length in days (both ends); otherwise null. */
  readonly periodDays: number | null;
  /** Decision 82: the assessment currency's minor units, for `divide` at currency scale. */
  readonly minorUnits?: number;
}

const resolved = (value: Decimal): Evaluated => ({ resolved: true, value });

const mergeReasons = (results: readonly (Evaluated | ConditionResult)[]): UnresolvedRef[] => {
  const byId = new Map<string, UnresolvedRef>();
  for (const r of results) {
    if (!r.resolved) for (const reason of r.reasons) byId.set(reason.id, reason);
  }
  return [...byId.values()];
};

/** Folds one or more values; unresolved if any operand is unresolved. */
function combineList(
  results: readonly Evaluated[],
  fold: (a: Decimal, b: Decimal) => Decimal,
): Evaluated {
  const values: Decimal[] = [];
  for (const r of results) {
    if (!r.resolved) return { resolved: false, reasons: mergeReasons(results) };
    values.push(r.value);
  }
  const [first, ...rest] = values;
  invariant(first, 'Operand lists are non-empty (validated)');
  return resolved(rest.reduce(fold, first));
}

function combine2(
  a: Evaluated,
  b: Evaluated,
  apply: (x: Decimal, y: Decimal) => Decimal,
): Evaluated {
  if (!a.resolved || !b.resolved) return { resolved: false, reasons: mergeReasons([a, b]) };
  return resolved(apply(a.value, b.value));
}

const compare = (left: Decimal, operator: ComparisonOperator, right: Decimal): boolean => {
  const c = left.compare(right);
  switch (operator) {
    case 'lt':
      return c < 0;
    case 'lte':
      return c <= 0;
    case 'eq':
      return c === 0;
    case 'gte':
      return c >= 0;
    case 'gt':
      return c > 0;
    /* v8 ignore next 2 -- exhaustive switch guard, unreachable by type */
    default:
      return assertNever(operator);
  }
};

/** Three-valued (Kleene) logic: a definite answer wins over unknowns where it decides the result. */
function evaluateCondition(condition: Condition, ctx: EvaluationContext): ConditionResult {
  switch (condition.kind) {
    case 'answer': {
      if (!(condition.questionId in ctx.answers)) {
        const question = ctx.pack.questions.find((q) => q.id === condition.questionId);
        invariant(question, `Unknown question ${condition.questionId} (pack not validated?)`);
        return {
          resolved: false,
          reasons: [
            {
              id: `missing-answer:${question.id}`,
              kind: 'MISSING_ANSWER',
              label: question.label,
              ruleIds: question.ruleIds,
              questionId: question.id,
            },
          ],
        };
      }
      return { resolved: true, value: ctx.answers[condition.questionId] === condition.equals };
    }
    case 'periodDays': {
      invariant(ctx.periodDays !== null, 'Period conditions are annual only (pack not validated?)');
      const days = Decimal.parse(String(ctx.periodDays));
      const limit = Decimal.parse(String(condition.days));
      invariant(days.ok && limit.ok, 'Whole day counts');
      return { resolved: true, value: compare(days.value, condition.operator, limit.value) };
    }
    case 'compare': {
      const left = evaluate(condition.left, ctx);
      const right = evaluate(condition.right, ctx);
      if (!left.resolved || !right.resolved)
        return { resolved: false, reasons: mergeReasons([left, right]) };
      return { resolved: true, value: compare(left.value, condition.operator, right.value) };
    }
    case 'all':
    case 'any': {
      const decisive = condition.kind === 'all' ? false : true;
      const results = condition.conditions.map((c) => evaluateCondition(c, ctx));
      if (results.some((r) => r.resolved && r.value === decisive))
        return { resolved: true, value: decisive };
      const reasons = mergeReasons(results);
      return reasons.length > 0
        ? { resolved: false, reasons }
        : { resolved: true, value: !decisive };
    }
    case 'not': {
      const inner = evaluateCondition(condition.condition, ctx);
      return inner.resolved ? { resolved: true, value: !inner.value } : inner;
    }
    /* v8 ignore next 2 -- exhaustive switch guard, unreachable by type */
    default:
      return assertNever(condition);
  }
}

/** Pure, deterministic evaluation of a (structurally validated) expression. */
export function evaluate(expression: Expression, ctx: EvaluationContext): Evaluated {
  switch (expression.op) {
    case 'sumCategories':
      return resolved(
        expression.categoryIds.reduce(
          (sum, id) => sum.add(ctx.categorySums.get(id) ?? Decimal.ZERO),
          Decimal.ZERO,
        ),
      );
    case 'parameter': {
      const parameter = ctx.pack.parameters.find((p) => p.id === expression.parameterId);
      invariant(parameter, `Unknown parameter ${expression.parameterId} (pack not validated?)`);
      return resolved(Decimal.of(parameter.value));
    }
    case 'step': {
      const value = ctx.stepValues.get(expression.stepId);
      invariant(value, `Step ${expression.stepId} not evaluated yet (pack not validated?)`);
      return value;
    }
    case 'zero':
      return resolved(Decimal.ZERO);
    case 'add':
      return combineList(
        expression.operands.map((e) => evaluate(e, ctx)),
        (a, b) => a.add(b),
      );
    case 'subtract': {
      // minuend − (s1 + s2 + …): identical to sequential subtraction with exact decimals.
      const subtrahends = combineList(
        expression.subtrahends.map((e) => evaluate(e, ctx)),
        (a, b) => a.add(b),
      );
      return combine2(evaluate(expression.minuend, ctx), subtrahends, (m, s) => m.subtract(s));
    }
    case 'multiply':
      return combine2(evaluate(expression.value, ctx), evaluate(expression.factor, ctx), (v, f) =>
        v.multiply(f),
      );
    case 'percentage':
      return combine2(evaluate(expression.of, ctx), evaluate(expression.rate, ctx), (o, r) =>
        o.percentage(r),
      );
    case 'divide': {
      const dividend = evaluate(expression.dividend, ctx);
      const divisor = evaluate(expression.divisor, ctx);
      if (!dividend.resolved || !divisor.resolved) {
        return { resolved: false, reasons: mergeReasons([dividend, divisor]) };
      }
      invariant(!divisor.value.isZero(), 'A divisor must not be zero (pack not validated?)');
      const { scale, mode } = expression.rounding;
      const places = scale === 'currency' ? ctx.minorUnits : scale;
      invariant(places !== undefined, 'Currency-scale division needs the currency minor units');
      return resolved(dividend.value.divide(divisor.value, places, mode));
    }
    case 'max':
      return combineList(
        expression.operands.map((e) => evaluate(e, ctx)),
        (a, b) => (b.greaterThan(a) ? b : a),
      );
    case 'min':
      return combineList(
        expression.operands.map((e) => evaluate(e, ctx)),
        (a, b) => (b.lessThan(a) ? b : a),
      );
    case 'when': {
      const condition = evaluateCondition(expression.condition, ctx);
      if (!condition.resolved) return condition;
      // Lazy: only the selected branch is evaluated (a consult in the other branch never fires).
      return evaluate(condition.value ? expression.then : expression.otherwise, ctx);
    }
    case 'consult': {
      const consultation = ctx.pack.consultations.find((c) => c.id === expression.consultationId);
      invariant(
        consultation,
        `Unknown consultation ${expression.consultationId} (pack not validated?)`,
      );
      return {
        resolved: false,
        reasons: [
          {
            id: consultation.id,
            kind: 'CONSULTATION_REQUIRED',
            label: consultation.label,
            ruleIds: consultation.ruleIds,
            questionId: null,
          },
        ],
      };
    }
    /* v8 ignore next 2 -- exhaustive switch guard, unreachable by type */
    default:
      return assertNever(expression);
  }
}
