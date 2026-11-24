import { SUPPORTED_MAPPING_VERSIONS } from '@khums/calculation-engine';
import type { FactMappingAction, FinancialFactKind, RulePack, Workflow } from '@khums/shared-types';
import { assertNever, err, ok, type Result } from '@khums/utils';
import { FINANCIAL_FACT_SUBTYPES } from '@khums/validation';

import { checkPublicPackBundle } from '../governance/public-pack';
import { FACT_KINDS } from './fact-entry';

/**
 * Which entry types a pack's OWN fact mapping uses for one workflow (Phase 3 step 2), so the entry
 * form can say in advance which types the verified rules cover and which will stop for review.
 *
 * Derived only from pack data, exactly as the engine's mapper reads it: a mapping rule matches on
 * workflow, kind and subtype only (`map-facts.ts`, at most one rule per triple), and a type no rule
 * matches goes to the pack's `unmatched` consultation. Nothing here interprets a ruling, names a
 * category's meaning, or predicts a figure: the amount and date policies of a `category` action
 * (and the answers to an `ask` action) are still applied by the engine to each actual entry.
 */
export type EntryCoverage =
  /** Mapped to one of the pack's input categories (its amount and date policies still apply). */
  | { readonly status: 'CALCULATED'; readonly categoryId: string }
  /** The pack states that this type feeds no category (with its own justification). */
  | { readonly status: 'EXCLUDED' }
  /** The outcome depends on the answer to a pack question about the entry. */
  | { readonly status: 'ASKS_QUESTION'; readonly questionId: string }
  /**
   * Stops for individual review: an explicit `consult` mapping, or no mapping rule at all
   * (`unmatched: true`, the pack's unmatched consultation).
   */
  | { readonly status: 'REVIEW'; readonly consultationId: string; readonly unmatched: boolean };

export type EntryCoverageStatus = EntryCoverage['status'];

/** Coverage of every kind and subtype the fact sheet knows, for one workflow of one pack. */
export interface EntryCoverageMap {
  readonly packId: string;
  readonly version: string;
  readonly workflow: Workflow;
  readonly entries: Readonly<Record<FinancialFactKind, Readonly<Record<string, EntryCoverage>>>>;
}

export type EntryCoverageError =
  /** The pack has no fact mapping, or a mapping version the engine does not support. */
  | { readonly code: 'MAPPING_NOT_DEFINED' }
  /** The pack does not define this workflow (the engine refuses it). */
  | { readonly code: 'WORKFLOW_NOT_SUPPORTED' }
  /** A public bundle that does not pass the browser's verified-pack check. */
  | { readonly code: 'NOT_VERIFIED' };

const WORKFLOW_KEY = {
  annual: 'annual',
  'first-time': 'firstTime',
  'missed-year': 'missedYear',
} as const satisfies Record<Workflow, keyof RulePack['workflows']>;

function classify(action: FactMappingAction): EntryCoverage {
  switch (action.action) {
    case 'category':
      return { status: 'CALCULATED', categoryId: action.categoryId };
    case 'exclude':
      return { status: 'EXCLUDED' };
    case 'consult':
      return { status: 'REVIEW', consultationId: action.consultationId, unmatched: false };
    case 'ask':
      // Conservative: the case taken depends on the person's answer, so no single outcome.
      return { status: 'ASKS_QUESTION', questionId: action.questionId };
    default:
      return assertNever(action);
  }
}

/** Describes, from the pack's own fact mapping, how each entry type is treated in `workflow`. */
export function describeEntryCoverage(
  pack: RulePack,
  workflow: Workflow,
): Result<EntryCoverageMap, EntryCoverageError> {
  const mapping = pack.factMapping;
  if (mapping === undefined || !SUPPORTED_MAPPING_VERSIONS.includes(mapping.mappingVersion)) {
    return err({ code: 'MAPPING_NOT_DEFINED' });
  }
  if (pack.workflows[WORKFLOW_KEY[workflow]] === null) {
    return err({ code: 'WORKFLOW_NOT_SUPPORTED' });
  }
  const unmatched: EntryCoverage = {
    status: 'REVIEW',
    consultationId: mapping.unmatched.consultationId,
    unmatched: true,
  };
  const entries = {} as Record<FinancialFactKind, Readonly<Record<string, EntryCoverage>>>;
  for (const kind of FACT_KINDS) {
    const byType: Record<string, EntryCoverage> = {};
    for (const subtype of FINANCIAL_FACT_SUBTYPES[kind] as readonly string[]) {
      // Same match as the engine's mapper; structure validation allows at most one rule.
      const rule = mapping.rules.find(
        (r) =>
          (r.match.workflows as readonly string[]).includes(workflow) &&
          (r.match.kinds as readonly string[]).includes(kind) &&
          r.match.subtypes.includes(subtype),
      );
      byType[subtype] = rule === undefined ? unmatched : classify(rule.then);
    }
    entries[kind] = byType;
  }
  return ok({ packId: pack.metadata.packId, version: pack.metadata.version, workflow, entries });
}

/**
 * The same, for a public verified bundle as the API served it (untrusted JSON): only a bundle that
 * passes `checkPublicPackBundle` is described.
 */
export function describeVerifiedEntryCoverage(
  bundle: { readonly pack: unknown; readonly summary: unknown },
  workflow: Workflow,
): Result<EntryCoverageMap, EntryCoverageError> {
  const checked = checkPublicPackBundle(bundle.pack, bundle.summary);
  if (!checked.ok) return err({ code: 'NOT_VERIFIED' });
  return describeEntryCoverage(checked.value.pack, workflow);
}

/**
 * The workflows a public verified bundle supports (those its pack defines, equal to its summary),
 * or null when the bundle does not pass `checkPublicPackBundle`.
 */
export function verifiedBundleWorkflows(bundle: {
  readonly pack: unknown;
  readonly summary: unknown;
}): readonly Workflow[] | null {
  const checked = checkPublicPackBundle(bundle.pack, bundle.summary);
  return checked.ok ? checked.value.workflows : null;
}

/** Looks up one entry type; null for a kind/subtype pair the fact sheet does not know. */
export function entryCoverageFor(
  coverage: EntryCoverageMap,
  kind: FinancialFactKind,
  subtype: string,
): EntryCoverage | null {
  const byType = coverage.entries[kind];
  return Object.hasOwn(byType, subtype) ? (byType[subtype] ?? null) : null;
}
