import type {
  CalculationIssue,
  Condition,
  Expression,
  Program,
  RulePack,
  ValueKind,
} from '@khums/shared-types';
import { Decimal } from '@khums/money';
import { assertNever } from '@khums/utils';

import { issue } from '../issues';

/** `any` = a pure consultation stop, which is compatible with every kind. */
export type InferredKind = ValueKind | 'any';

export interface ProgramAnalysis {
  readonly issues: CalculationIssue[];
  readonly stepKinds: ReadonlyMap<string, InferredKind>;
}

interface Context {
  readonly pack: RulePack;
  readonly categoryIds: ReadonlySet<string>;
  readonly parameterIds: ReadonlySet<string>;
  /** Decision 82: parameters whose value is zero (never a divisor). */
  readonly zeroParameterIds: ReadonlySet<string>;
  readonly consultationIds: ReadonlySet<string>;
  readonly allStepIds: ReadonlySet<string>;
  readonly stepKinds: Map<string, InferredKind>;
  readonly issues: CalculationIssue[];
}

const unify = (
  kinds: readonly (InferredKind | null)[],
  path: string,
  ctx: Context,
): InferredKind | null => {
  if (kinds.some((k) => k === null)) return null;
  const concrete = new Set(kinds.filter((k): k is ValueKind => k !== 'any' && k !== null));
  if (concrete.size > 1) {
    ctx.issues.push(issue('PROGRAM_KIND_MISMATCH', 'Operands mix money and scalar values', path));
    return null;
  }
  const [only] = [...concrete];
  return only ?? 'any';
};

function checkCondition(condition: Condition, path: string, ctx: Context): void {
  switch (condition.kind) {
    case 'answer': {
      const question = ctx.pack.questions.find((q) => q.id === condition.questionId);
      if (!question) {
        ctx.issues.push(
          issue('PROGRAM_UNKNOWN_QUESTION', `Unknown question "${condition.questionId}"`, path),
        );
        return;
      }
      if (question.kind === 'decimal') {
        ctx.issues.push(
          issue(
            'PROGRAM_INVALID_CONDITION',
            `Decimal question "${question.id}" is answered per fact and cannot be a condition`,
            path,
          ),
        );
        return;
      }
      const valid =
        question.kind === 'boolean'
          ? typeof condition.equals === 'boolean'
          : typeof condition.equals === 'string' && question.choices.includes(condition.equals);
      if (!valid) {
        ctx.issues.push(
          issue(
            'PROGRAM_INVALID_ANSWER_VALUE',
            `Condition value is not a valid answer to "${question.id}"`,
            path,
          ),
        );
      }
      return;
    }
    case 'periodDays':
      if (!Number.isInteger(condition.days) || condition.days < 1 || condition.days > 100_000) {
        ctx.issues.push(
          issue('PROGRAM_INVALID_CONDITION', 'Period length must be 1 to 100000 days', path),
        );
      }
      return;
    case 'compare': {
      const left = inferKind(condition.left, `${path}.left`, ctx);
      const right = inferKind(condition.right, `${path}.right`, ctx);
      unify([left, right], path, ctx);
      return;
    }
    case 'all':
    case 'any':
      condition.conditions.forEach((c, i) => {
        checkCondition(c, `${path}.conditions.${i}`, ctx);
      });
      return;
    case 'not':
      checkCondition(condition.condition, `${path}.condition`, ctx);
      return;
    /* v8 ignore next 2 -- exhaustive switch guard, unreachable by type */
    default:
      assertNever(condition);
  }
}

function inferList(
  operands: readonly Expression[],
  path: string,
  field: string,
  ctx: Context,
): InferredKind | null {
  if (operands.length === 0) {
    ctx.issues.push(issue('PROGRAM_EMPTY_OPERANDS', 'Operation needs at least one operand', path));
    return null;
  }
  return unify(
    operands.map((e, i) => inferKind(e, `${path}.${field}.${i}`, ctx)),
    path,
    ctx,
  );
}

export function inferKind(expression: Expression, path: string, ctx: Context): InferredKind | null {
  switch (expression.op) {
    case 'sumCategories': {
      if (expression.categoryIds.length === 0) {
        ctx.issues.push(issue('PROGRAM_EMPTY_OPERANDS', 'sumCategories needs categories', path));
        return null;
      }
      let ok = true;
      for (const id of expression.categoryIds) {
        if (!ctx.categoryIds.has(id)) {
          ctx.issues.push(
            issue('PROGRAM_UNKNOWN_CATEGORY', `Unknown input category "${id}"`, path),
          );
          ok = false;
        }
      }
      return ok ? 'money' : null;
    }
    case 'parameter':
      if (!ctx.parameterIds.has(expression.parameterId)) {
        ctx.issues.push(
          issue('PROGRAM_UNKNOWN_PARAMETER', `Unknown parameter "${expression.parameterId}"`, path),
        );
        return null;
      }
      return 'scalar';
    case 'step': {
      const kind = ctx.stepKinds.get(expression.stepId);
      if (kind !== undefined) return kind;
      if (ctx.allStepIds.has(expression.stepId)) {
        ctx.issues.push(
          issue(
            'PROGRAM_FORWARD_REFERENCE',
            `Step "${expression.stepId}" is referenced before it is defined (or is invalid)`,
            path,
          ),
        );
      } else {
        ctx.issues.push(issue('PROGRAM_UNKNOWN_STEP', `Unknown step "${expression.stepId}"`, path));
      }
      return null;
    }
    case 'zero':
      return 'money';
    case 'add':
    case 'max':
    case 'min':
      return inferList(expression.operands, path, 'operands', ctx);
    case 'subtract': {
      const minuend = inferKind(expression.minuend, `${path}.minuend`, ctx);
      const rest = inferList(expression.subtrahends, path, 'subtrahends', ctx);
      return unify([minuend, rest], path, ctx);
    }
    case 'multiply': {
      const value = inferKind(expression.value, `${path}.value`, ctx);
      const factor = inferKind(expression.factor, `${path}.factor`, ctx);
      if (value === null || factor === null) return null;
      if (factor === 'money') {
        ctx.issues.push(
          issue('PROGRAM_KIND_MISMATCH', 'Multiplication factor must be a scalar', path),
        );
        return null;
      }
      return value;
    }
    case 'divide': {
      const dividend = inferKind(expression.dividend, `${path}.dividend`, ctx);
      const divisor = inferKind(expression.divisor, `${path}.divisor`, ctx);
      const { scale } = expression.rounding;
      if (scale !== 'currency' && !(Number.isInteger(scale) && scale >= 0 && scale <= 30)) {
        ctx.issues.push(
          issue('PROGRAM_INVALID_ROUNDING', 'Rounding scale must be 0–30 or "currency"', path),
        );
      }
      if (dividend === null || divisor === null) return null;
      if (divisor === 'money') {
        ctx.issues.push(issue('PROGRAM_KIND_MISMATCH', 'A divisor must be a scalar', path));
        return null;
      }
      // A divisor is a pack parameter that is not zero, so a division can never fail at runtime.
      if (
        expression.divisor.op !== 'parameter' ||
        ctx.zeroParameterIds.has(expression.divisor.parameterId)
      ) {
        ctx.issues.push(
          issue('PROGRAM_INVALID_DIVISOR', 'A divisor must be a non-zero pack parameter', path),
        );
        return null;
      }
      return dividend;
    }
    case 'percentage': {
      const of = inferKind(expression.of, `${path}.of`, ctx);
      const rate = inferKind(expression.rate, `${path}.rate`, ctx);
      if (of === null || rate === null) return null;
      if (rate === 'money') {
        ctx.issues.push(issue('PROGRAM_KIND_MISMATCH', 'Percentage rate must be a scalar', path));
        return null;
      }
      return of;
    }
    case 'when': {
      checkCondition(expression.condition, `${path}.condition`, ctx);
      return unify(
        [
          inferKind(expression.then, `${path}.then`, ctx),
          inferKind(expression.otherwise, `${path}.otherwise`, ctx),
        ],
        path,
        ctx,
      );
    }
    case 'consult':
      if (!ctx.consultationIds.has(expression.consultationId)) {
        ctx.issues.push(
          issue(
            'PROGRAM_UNKNOWN_CONSULTATION',
            `Unknown consultation "${expression.consultationId}"`,
            path,
          ),
        );
        return null;
      }
      return 'any';
    /* v8 ignore next 2 -- exhaustive switch guard, unreachable by type */
    default:
      return assertNever(expression);
  }
}

/** Statically checks one workflow program: references, ordering, kinds, rounding, outputs. */
export function analyzeProgram(pack: RulePack, program: Program, path: string): ProgramAnalysis {
  const ctx: Context = {
    pack,
    categoryIds: new Set(pack.inputCategories.map((c) => c.id)),
    parameterIds: new Set(pack.parameters.map((p) => p.id)),
    zeroParameterIds: new Set(
      pack.parameters
        .filter((p) => {
          const value = Decimal.parse(p.value);
          return value.ok && value.value.isZero();
        })
        .map((p) => p.id),
    ),
    consultationIds: new Set(pack.consultations.map((c) => c.id)),
    allStepIds: new Set(program.steps.map((s) => s.id)),
    stepKinds: new Map(),
    issues: [],
  };

  const seen = new Set<string>();
  program.steps.forEach((step, index) => {
    const stepPath = `${path}.steps.${index}`;
    if (seen.has(step.id)) {
      ctx.issues.push(issue('PROGRAM_DUPLICATE_STEP', `Duplicate step id "${step.id}"`, stepPath));
      return;
    }
    seen.add(step.id);
    const rounding = step.rounding;
    if (
      rounding !== null &&
      rounding.scale !== 'currency' &&
      !(Number.isInteger(rounding.scale) && rounding.scale >= 0 && rounding.scale <= 30)
    ) {
      ctx.issues.push(
        issue('PROGRAM_INVALID_ROUNDING', 'Rounding scale must be 0–30 or "currency"', stepPath),
      );
    }
    const kind = inferKind(step.expression, `${stepPath}.expression`, ctx);
    if (kind !== null) ctx.stepKinds.set(step.id, kind);
  });

  if (program.outputs.length === 0) {
    ctx.issues.push(issue('PROGRAM_NO_OUTPUTS', 'Program declares no outputs', `${path}.outputs`));
  }
  const outputIds = new Set<string>();
  program.outputs.forEach((output, index) => {
    const outputPath = `${path}.outputs.${index}`;
    if (outputIds.has(output.id)) {
      ctx.issues.push(
        issue('PROGRAM_DUPLICATE_OUTPUT', `Duplicate output id "${output.id}"`, outputPath),
      );
    }
    outputIds.add(output.id);
    if (!ctx.allStepIds.has(output.stepId)) {
      ctx.issues.push(
        issue(
          'PROGRAM_UNKNOWN_OUTPUT_STEP',
          `Output refers to unknown step "${output.stepId}"`,
          outputPath,
        ),
      );
      return;
    }
    if (ctx.stepKinds.get(output.stepId) === 'scalar') {
      ctx.issues.push(
        issue('PROGRAM_OUTPUT_NOT_MONEY', `Output "${output.id}" must be money`, outputPath),
      );
    }
  });

  return { issues: ctx.issues, stepKinds: ctx.stepKinds };
}
