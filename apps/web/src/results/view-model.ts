import type {
  AssessmentResult,
  CalculationRefusal,
  CalculationReport,
  ClarificationReason,
  Condition,
  Expression,
  FactMappingAction,
  MappingResult,
  MappingTraceEntry,
  MappingUnsupportedCode,
  MoneyAmount,
  Program,
  QuestionDefinition,
  RulePack,
  UnresolvedKind,
  Workflow,
} from '@khums/shared-types';
import { isNonNegativeDecimal } from '@khums/core';
import { assertNever } from '@khums/utils';

/**
 * Pure helpers for the results dashboard (M4.5.1). They only look things up in the rule pack the
 * result was calculated with; they never interpret or change a figure.
 */

/** Questions the pack asks about individual entries (fact mapping `ask` actions). */
export function factQuestionIds(pack: RulePack): ReadonlySet<string> {
  const ids = new Set<string>();
  const walk = (action: FactMappingAction) => {
    if (action.action !== 'ask') return;
    ids.add(action.questionId);
    for (const c of action.cases) walk(c.then);
  };
  for (const rule of pack.factMapping?.rules ?? []) walk(rule.then);
  return ids;
}

/** Questions about the whole assessment (everything the pack asks that is not about one entry). */
export function assessmentQuestions(pack: RulePack): readonly QuestionDefinition[] {
  const perFact = factQuestionIds(pack);
  return pack.questions.filter((q) => !perFact.has(q.id));
}

export interface CitedRule {
  readonly id: string;
  readonly summary: string;
  readonly status: string;
  /** The research ruling versions the rule cites (M5.3.6), with their in-pack provenance. */
  readonly rulings: readonly CitedRuling[];
}
export interface CitedSource {
  readonly id: string;
  readonly title: string;
  readonly locator: string | null;
  readonly url: string | null;
}

/** The pack's rules for the given ids, in the given order (unknown ids are skipped). */
export function citedRules(pack: RulePack, ids: readonly string[]): readonly CitedRule[] {
  return ids.flatMap((id) => {
    const rule = pack.rules.find((r) => r.id === id);
    return rule === undefined
      ? []
      : [
          {
            id,
            summary: rule.summary,
            status: rule.status,
            rulings: rule.rulingRefs.map((ref) => citedRuling(pack, ref)),
          },
        ];
  });
}

/**
 * One ruling a rule cites, with the provenance frozen in THIS pack version (M5.3.6 in-pack
 * snapshot): the ruling version and its state when the version was registered, the findings
 * (question ids) and the passages (locator, source). Null snapshot: none in this pack version.
 */
export interface CitedRuling {
  readonly ref: string;
  readonly snapshot: {
    readonly displayRef: string;
    readonly version: number;
    readonly state: string;
    readonly findings: readonly string[];
    readonly passages: readonly string[];
  } | null;
}

const locatorText = (locator: Readonly<Record<string, unknown>>): string =>
  Object.entries(locator)
    .filter(([, v]) => typeof v === 'string' || typeof v === 'number')
    .map(([k, v]) => `${k} ${String(v)}`)
    .join(', ');

export function citedRuling(pack: RulePack, ref: string): CitedRuling {
  const snap = pack.rulingSnapshots?.find((s) => s.ref === ref);
  if (snap === undefined) return { ref, snapshot: null };
  return {
    ref,
    snapshot: {
      displayRef: snap.displayRef,
      version: snap.rulingVersion,
      state: snap.state,
      findings: snap.findings.map((f) => `${f.displayRef} (${f.questionId})`),
      passages: snap.passages.map(
        (p) => `${p.displayRef}: ${locatorText(p.locator)} — ${p.source.title}`,
      ),
    },
  };
}

/** The pack's sources for the given ids, in the given order (unknown ids are skipped). */
export function citedSources(pack: RulePack, ids: readonly string[]): readonly CitedSource[] {
  return ids.flatMap((id) => {
    const source = pack.sources.find((s) => s.id === id);
    return source === undefined
      ? []
      : [{ id, title: source.title, locator: source.locator, url: source.url }];
  });
}

export const labelOf = (
  items: readonly { readonly id: string; readonly label: string }[],
  id: string | null,
): string | null => (id === null ? null : (items.find((i) => i.id === id)?.label ?? null));

/**
 * Which notice a result must carry. Driven by the result itself, never by the page.
 * - `APPROVED`: production guidance from a non-mock, approved pack;
 * - `PROVISIONAL`: scholar-review results (M4.5a): PROVISIONAL — FOR SCHOLAR REVIEW ONLY;
 * - `MOCK`: everything else (development, or anything unexpected: never shown as approved).
 */
export type ResultLabel = 'MOCK' | 'PROVISIONAL' | 'APPROVED';
export function resultLabel(report: Pick<CalculationReport, 'meta'>): ResultLabel {
  const { guidance, rulePack } = report.meta;
  if (guidance === 'APPROVED_RULE_PACK' && !rulePack.isMock) return 'APPROVED';
  if (guidance === 'PROVISIONAL_SCHOLAR_REVIEW' && !rulePack.isMock) return 'PROVISIONAL';
  return 'MOCK';
}

// ── Result summary (Phase 3 step 4, decision 73) ──────────────────────────────────────────────

/** The program the pack runs for a workflow (missed years: the per-year program). */
function programFor(pack: RulePack, workflow: Workflow): Program | null {
  switch (workflow) {
    case 'annual':
      return pack.workflows.annual;
    case 'first-time':
      return pack.workflows.firstTime;
    case 'missed-year':
      return pack.workflows.missedYear?.perYear ?? null;
    default:
      return assertNever(workflow);
  }
}

/**
 * The input categories the pack's own program only ever SUBTRACTS (they appear only on the
 * subtracted side of a `subtract`, following step references; a subtraction inside a subtrahend
 * flips the sign back). Read from the program structure alone: nothing is inferred about what a
 * category means. Conservative (audit L-3): a category is listed only when its sign is certain.
 * A category used on both sides, inside a condition, or under a `multiply`/`percentage` whose
 * other operand is not a pack parameter with a non-negative value is never listed (it is shown
 * as used, not as deducted).
 */
export function deductedCategoryIds(pack: RulePack, workflow: Workflow): ReadonlySet<string> {
  const program = programFor(pack, workflow);
  if (program === null) return new Set();
  const steps = new Map(program.steps.map((s) => [s.id, s.expression]));
  const parameters = new Map(pack.parameters.map((p) => [p.id, p.value]));
  const positive = new Set<string>();
  const negative = new Set<string>();
  const uncertain = new Set<string>();
  const visited = new Set<string>();
  type Sign = 'POSITIVE' | 'NEGATIVE' | 'UNKNOWN';
  const flip = (sign: Sign): Sign =>
    sign === 'POSITIVE' ? 'NEGATIVE' : sign === 'NEGATIVE' ? 'POSITIVE' : 'UNKNOWN';
  // A scaling operand keeps the sign only when it is a pack parameter known to be >= 0.
  const keepsSign = (factor: Expression) =>
    factor.op === 'parameter' && isNonNegativeDecimal(parameters.get(factor.parameterId) ?? '');
  const walkCondition = (condition: Condition) => {
    switch (condition.kind) {
      case 'answer':
      case 'periodDays':
        return;
      case 'compare':
        walk(condition.left, 'UNKNOWN');
        walk(condition.right, 'UNKNOWN');
        return;
      case 'all':
      case 'any':
        for (const c of condition.conditions) walkCondition(c);
        return;
      case 'not':
        walkCondition(condition.condition);
        return;
      default:
        assertNever(condition);
    }
  };
  const scaled = (value: Expression, factor: Expression, sign: Sign) => {
    if (keepsSign(factor)) {
      walk(value, sign);
      walk(factor, 'UNKNOWN');
    } else if (keepsSign(value)) {
      walk(factor, sign);
      walk(value, 'UNKNOWN');
    } else {
      walk(value, 'UNKNOWN');
      walk(factor, 'UNKNOWN');
    }
  };
  function walk(expression: Expression, sign: Sign): void {
    switch (expression.op) {
      case 'sumCategories':
        for (const id of expression.categoryIds) {
          (sign === 'POSITIVE' ? positive : sign === 'NEGATIVE' ? negative : uncertain).add(id);
        }
        return;
      case 'step': {
        const key = `${expression.stepId}:${sign}`;
        const target = steps.get(expression.stepId);
        if (visited.has(key) || target === undefined) return;
        visited.add(key);
        walk(target, sign);
        return;
      }
      case 'add':
      case 'max':
      case 'min':
        for (const operand of expression.operands) walk(operand, sign);
        return;
      case 'subtract':
        walk(expression.minuend, sign);
        for (const s of expression.subtrahends) walk(s, flip(sign));
        return;
      case 'multiply':
        scaled(expression.value, expression.factor, sign);
        return;
      case 'percentage':
        scaled(expression.of, expression.rate, sign);
        return;
      case 'divide':
        // A quotient has the sign of the dividend times the sign of the divisor, like a product.
        scaled(expression.dividend, expression.divisor, sign);
        return;
      case 'when':
        walkCondition(expression.condition);
        walk(expression.then, sign);
        walk(expression.otherwise, sign);
        return;
      case 'parameter':
      case 'zero':
      case 'consult':
        return;
      default:
        assertNever(expression);
    }
  }
  for (const output of program.outputs) walk({ op: 'step', stepId: output.stepId }, 'POSITIVE');
  return new Set([...negative].filter((id) => !positive.has(id) && !uncertain.has(id)));
}

/** One entry in the summary, with the amount the mapping passed on unchanged (null: none). */
export interface SummaryEntry {
  readonly factId: string;
  readonly categoryId: string | null;
  readonly amount: string | null;
}

/** One figure of the result, exactly as the engine returned it. */
export interface SummaryFigure {
  readonly id: string;
  readonly label: string;
  readonly value: MoneyAmount | null;
  /** When not calculated: the open items that stopped it (labels as the pack states them). */
  readonly reasons: readonly string[];
}

/** Something that stopped a figure or the whole calculation, with its reason. */
export type SummaryStop =
  | { readonly kind: 'CONSULTATION'; readonly factId: string | null; readonly label: string }
  | {
      readonly kind: 'CLARIFICATION';
      readonly factId: string;
      readonly reason: ClarificationReason;
      readonly questionLabel: string | null;
    }
  | {
      readonly kind: 'UNSUPPORTED';
      readonly factId: string | null;
      readonly code: MappingUnsupportedCode;
    }
  | { readonly kind: 'UNRESOLVED'; readonly unresolved: UnresolvedKind; readonly label: string }
  /** The engine refused to run (other than a missing required answer, listed as UNRESOLVED). */
  | { readonly kind: 'REFUSED' };

export interface ResultSummary {
  /** True only when the engine calculated (figures may still be open). */
  readonly calculated: boolean;
  /** Every figure was calculated and nothing is open. */
  readonly completed: boolean;
  /** Per-category figures; never a combined total (none is produced by the summary). */
  readonly figures: readonly SummaryFigure[];
  readonly counted: readonly SummaryEntry[];
  readonly deducted: readonly SummaryEntry[];
  readonly excluded: readonly SummaryEntry[];
  readonly stops: readonly SummaryStop[];
  readonly pack: {
    readonly packId: string;
    readonly version: string;
    readonly contentDigest: string | null;
  };
}

/**
 * A short summary built ONLY from what the mapping and the engine returned: the figures (or why
 * one was not calculated), which entries were counted, deducted (see `deductedCategoryIds`) or
 * left out, and what stopped for review or needs an answer. No figure is computed or added here.
 */
export function summarizeResult(
  pack: RulePack,
  mapping: MappingResult,
  report: CalculationReport | null,
  refusal: CalculationRefusal | null = null,
): ResultSummary {
  const workflow = report?.workflow ?? mapping.input?.workflow ?? null;
  const deducted = workflow === null ? new Set<string>() : deductedCategoryIds(pack, workflow);
  const entries = (outcome: MappingTraceEntry['outcome']) =>
    mapping.trace
      .filter((line) => line.outcome === outcome)
      .map((line) => ({ factId: line.factId, categoryId: line.categoryId, amount: line.amount }));
  const used = report === null ? [] : entries('ENTRY');
  const questionLabel = (id: string | null) =>
    id === null ? null : (pack.questions.find((q) => q.id === id)?.label ?? id);

  const stops: SummaryStop[] = [
    ...mapping.consultations.map((c): SummaryStop => ({
      kind: 'CONSULTATION',
      factId: c.factId,
      label: labelOf(pack.consultations, c.consultationId) ?? c.consultationId,
    })),
    ...mapping.clarifications.map((c): SummaryStop => ({
      kind: 'CLARIFICATION',
      factId: c.factId,
      reason: c.reason,
      questionLabel: questionLabel(c.questionId),
    })),
    ...mapping.unsupported.map((u): SummaryStop => ({
      kind: 'UNSUPPORTED',
      factId: u.factId,
      code: u.code,
    })),
  ];

  if (refusal !== null) {
    // A required question left unanswered is named (the engine refuses without it); anything
    // else is one "not run" item. Never a figure.
    let other = false;
    for (const issue of refusal.issues) {
      if (issue.severity !== 'error') continue;
      const question =
        issue.code === 'INPUT_MISSING_REQUIRED_ANSWER'
          ? pack.questions.find((q) => issue.path?.endsWith(`.${q.id}`) === true)
          : undefined;
      if (question === undefined) other = true;
      else stops.push({ kind: 'UNRESOLVED', unresolved: 'MISSING_ANSWER', label: question.label });
    }
    if (other || refusal.issues.every((i) => i.severity !== 'error'))
      stops.push({ kind: 'REFUSED' });
  }

  let figures: SummaryFigure[] = [];
  let completed = false;
  if (report !== null) {
    const results =
      report.workflow === 'missed-year' ? report.years.map((y) => y.result) : [report.result];
    const seen = new Set<string>();
    for (const result of results) {
      for (const item of result.unresolved) {
        const key = `${item.kind}:${item.label}`;
        if (seen.has(key)) continue;
        seen.add(key);
        stops.push({ kind: 'UNRESOLVED', unresolved: item.kind, label: item.label });
      }
    }
    const program = workflow === null ? null : programFor(pack, workflow);
    const reasonsFor = (result: AssessmentResult, outputId: string): string[] => {
      const stepId = program?.outputs.find((o) => o.id === outputId)?.stepId;
      const step = result.breakdown.find((s) => s.stepId === stepId);
      const ids = new Set(step?.unresolvedCaseIds ?? []);
      return result.unresolved.filter((u) => ids.has(u.id)).map((u) => u.label);
    };
    if (report.workflow === 'missed-year') {
      figures = (report.aggregate?.outputs ?? []).map((o) => ({ ...o, reasons: [] }));
      completed =
        report.aggregate?.status === 'COMPLETED' &&
        report.years.every((y) => y.result.status === 'COMPLETED');
    } else {
      const { result } = report;
      figures = result.outputs.map((o) => ({
        ...o,
        reasons: o.value === null ? reasonsFor(result, o.id) : [],
      }));
      completed = result.status === 'COMPLETED';
    }
  }

  const meta = report?.meta.rulePack;
  return {
    calculated: report !== null,
    completed,
    figures,
    counted: used.filter((e) => e.categoryId === null || !deducted.has(e.categoryId)),
    deducted: used.filter((e) => e.categoryId !== null && deducted.has(e.categoryId)),
    excluded: report === null ? [] : entries('EXCLUDED'),
    stops,
    pack:
      meta === undefined
        ? {
            packId: mapping.pack.packId,
            version: mapping.pack.version,
            contentDigest: mapping.pack.contentDigest,
          }
        : { packId: meta.packId, version: meta.version, contentDigest: meta.contentDigest },
  };
}
