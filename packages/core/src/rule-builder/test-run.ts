import { calculate, PROVISIONAL_DISCLAIMER } from '@khums/calculation-engine';
import type {
  AuthorizationDecision,
  CalculationRefusal,
  CalculationReport,
  FactAnswers,
  FinancialFactKind,
  MappingResult,
  OperationalState,
} from '@khums/shared-types';
import type { ScholarRuleRevision, TestScholarRulesRequest } from '@khums/validation';

import { authorize } from '../authorization/evaluate';
import { isTrustedPrincipal } from '../authorization/principal';
import { prepareAssessmentInput } from '../financial/prepare-input';
import { deepFreeze } from '../governance/ledger';
import { scholarTestingAllowed, type BuilderDecisionContext } from './operational-gate';
import {
  compileBuilderPack,
  type BuilderSourceInfo,
  type CompileBuilderError,
  type CompiledBuilderPack,
} from './compile';

/**
 * Staff-only test calculation of a Marja's builder rules (Phase 2 step 3): the latest revisions
 * are compiled into a SCHOLAR_REVIEW test pack (never stored, never registered, never public) and
 * one annual assessment is run in the engine's `scholar-review` mode, so every result is
 * PROVISIONAL — FOR SCHOLAR REVIEW ONLY. Test entries are mapped by the pack's own fact mapping on
 * the server (per-entry confirmations and review stops cannot be bypassed). Nothing is recorded
 * here; the API audits the run without figures.
 */

/** Test packs are never versioned releases. */
export const BUILDER_TEST_PACK_VERSION = '0.0.0';
/** Test packs accept any test period from this date (they are never used for real assessments). */
export const BUILDER_TEST_EFFECTIVE_FROM = '2000-01-01';

export interface BuilderTestInput {
  readonly principal: unknown;
  readonly operationalState: OperationalState;
  readonly marjaId: string;
  readonly revisions: readonly ScholarRuleRevision[];
  readonly sources: Readonly<Record<string, BuilderSourceInfo>>;
  readonly test: TestScholarRulesRequest;
  readonly context: BuilderDecisionContext;
}

export type BuilderTestOutcome =
  | { readonly status: 'DENIED'; readonly decision: AuthorizationDecision }
  | { readonly status: 'REFUSED'; readonly issue: 'OPERATIONAL_STATE_FORBIDS' }
  | {
      readonly status: 'COMPILE_FAILED';
      readonly decision: Extract<AuthorizationDecision, { allowed: true }>;
      readonly error: CompileBuilderError;
    }
  | {
      readonly status: 'RAN';
      readonly decision: Extract<AuthorizationDecision, { allowed: true }>;
      readonly compiled: CompiledBuilderPack;
      /** Always the PROVISIONAL — FOR SCHOLAR REVIEW ONLY disclaimer. */
      readonly disclaimer: string;
      readonly outcome: 'CALCULATED' | 'NEEDS_REVIEW' | 'REFUSED';
      readonly mapping: MappingResult;
      readonly report: CalculationReport | null;
      readonly refusal: CalculationRefusal | null;
    };

/** The date fields each fact kind carries; a test entry gives all of them its one exact date. */
const TEST_DATE_FIELDS: Readonly<Record<FinancialFactKind, readonly string[]>> = {
  ASSET: ['valuedOn', 'acquiredOn'],
  BALANCE: ['valuedOn'],
  INCOME: ['receivedOn'],
  EXPENSE: ['paidOn'],
  LIABILITY: ['valuedOn', 'incurredOn', 'dueOn'],
};

/**
 * Builds the neutral fact sheet of a test request: exact amounts on exact dates. Untrusted shape:
 * the sheet is validated by `prepareAssessmentInput` like any other.
 */
export function builderTestSheet(test: TestScholarRulesRequest): unknown {
  return {
    schemaVersion: 1,
    currency: test.currency,
    context: { workflow: 'annual', period: test.period },
    facts: test.entries.map((e) => ({
      id: e.id,
      kind: e.kind,
      subtype: e.subtype,
      label: null,
      note: null,
      currency: test.currency,
      value: { status: 'KNOWN', amount: e.amount },
      periodId: null,
      ...Object.fromEntries(
        TEST_DATE_FIELDS[e.kind].map((field) => [field, { status: 'KNOWN', date: e.date }]),
      ),
    })),
  };
}

export function runBuilderTest(input: BuilderTestInput): BuilderTestOutcome {
  if (!scholarTestingAllowed(input.operationalState)) {
    return deepFreeze({ status: 'REFUSED', issue: 'OPERATIONAL_STATE_FORBIDS' });
  }
  const decision = authorize({
    principal: input.principal,
    permission: 'builder.rule.test',
    resource: { type: 'MARJA_RESEARCH', marjaId: input.marjaId },
    context: {
      decisionId: input.context.decisionId,
      evaluatedAt: input.context.evaluatedAt,
      session: input.context.session,
      governance: null,
    },
  });
  if (!decision.allowed || !isTrustedPrincipal(input.principal)) {
    return deepFreeze({ status: 'DENIED', decision });
  }
  const compiled = compileBuilderPack({
    marjaId: input.marjaId,
    version: BUILDER_TEST_PACK_VERSION,
    releaseChannel: 'SCHOLAR_REVIEW',
    effectiveFrom: BUILDER_TEST_EFFECTIVE_FROM,
    revisions: input.revisions,
    sources: input.sources,
  });
  if (!compiled.ok)
    return deepFreeze({ status: 'COMPILE_FAILED', decision, error: compiled.error });
  const { pack } = compiled.value;

  const factAnswers: Record<string, FactAnswers[string]> = {};
  for (const entry of input.test.entries) {
    const answers = input.test.entryAnswers[entry.id];
    if (answers === undefined) continue;
    factAnswers[entry.id] = {
      workflow: 'annual',
      kind: entry.kind,
      subtype: entry.subtype,
      answers,
    };
  }
  const mapping = prepareAssessmentInput(
    builderTestSheet(input.test),
    pack,
    input.test.answers,
    factAnswers,
  );
  const ran = (
    outcome: 'CALCULATED' | 'NEEDS_REVIEW' | 'REFUSED',
    report: CalculationReport | null,
    refusal: CalculationRefusal | null,
  ) =>
    deepFreeze({
      status: 'RAN' as const,
      decision,
      compiled: compiled.value,
      disclaimer: PROVISIONAL_DISCLAIMER,
      outcome,
      mapping,
      report,
      refusal,
    });
  if (mapping.status === 'UNSUPPORTED') return ran('REFUSED', null, null);
  if (mapping.status !== 'MAPPED' || mapping.input === null) return ran('NEEDS_REVIEW', null, null);
  const result = calculate(mapping.input, pack, { mode: 'scholar-review' });
  if (!result.ok) return ran('REFUSED', null, result.error);
  // Defence in depth: a builder test can only ever carry the provisional label.
  if (
    result.value.meta.guidance !== 'PROVISIONAL_SCHOLAR_REVIEW' ||
    result.value.meta.disclaimer !== PROVISIONAL_DISCLAIMER
  ) {
    return ran('REFUSED', null, null);
  }
  return ran('CALCULATED', result.value, null);
}
