import type { Condition, Expression, Program } from '@khums/shared-types';
import { assertNever } from '@khums/utils';

export interface ProgramReferences {
  readonly categoryIds: Set<string>;
  readonly parameterIds: Set<string>;
  readonly questionIds: Set<string>;
  readonly consultationIds: Set<string>;
  /** Phase 4: whether a `periodDays` condition is used (annual programs only). */
  usesPeriod: boolean;
}

function walkCondition(condition: Condition, refs: ProgramReferences): void {
  switch (condition.kind) {
    case 'answer':
      refs.questionIds.add(condition.questionId);
      return;
    case 'periodDays':
      refs.usesPeriod = true;
      return;
    case 'compare':
      walk(condition.left, refs);
      walk(condition.right, refs);
      return;
    case 'all':
    case 'any':
      condition.conditions.forEach((c) => {
        walkCondition(c, refs);
      });
      return;
    case 'not':
      walkCondition(condition.condition, refs);
      return;
    /* v8 ignore next 2 -- exhaustive switch guard, unreachable by type */
    default:
      assertNever(condition);
  }
}

function walk(expression: Expression, refs: ProgramReferences): void {
  switch (expression.op) {
    case 'sumCategories':
      expression.categoryIds.forEach((id) => refs.categoryIds.add(id));
      return;
    case 'parameter':
      refs.parameterIds.add(expression.parameterId);
      return;
    case 'consult':
      refs.consultationIds.add(expression.consultationId);
      return;
    case 'step':
    case 'zero':
      return;
    case 'add':
    case 'max':
    case 'min':
      expression.operands.forEach((e) => {
        walk(e, refs);
      });
      return;
    case 'subtract':
      walk(expression.minuend, refs);
      expression.subtrahends.forEach((e) => {
        walk(e, refs);
      });
      return;
    case 'multiply':
      walk(expression.value, refs);
      walk(expression.factor, refs);
      return;
    case 'percentage':
      walk(expression.of, refs);
      walk(expression.rate, refs);
      return;
    case 'divide':
      walk(expression.dividend, refs);
      walk(expression.divisor, refs);
      return;
    case 'when':
      walkCondition(expression.condition, refs);
      walk(expression.then, refs);
      walk(expression.otherwise, refs);
      return;
    /* v8 ignore next 2 -- exhaustive switch guard, unreachable by type */
    default:
      assertNever(expression);
  }
}

/** Every pack element a program depends on (used by the readiness gate). */
export function collectReferences(program: Program): ProgramReferences {
  const refs: ProgramReferences = {
    categoryIds: new Set(),
    parameterIds: new Set(),
    questionIds: new Set(),
    consultationIds: new Set(),
    usesPeriod: false,
  };
  program.steps.forEach((s) => {
    walk(s.expression, refs);
  });
  return refs;
}
