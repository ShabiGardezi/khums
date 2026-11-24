import type { CalculationIssue, Program, RulePack } from '@khums/shared-types';
import { Decimal } from '@khums/money';
import { compareIsoDates, isIsoDate } from '@khums/utils';

import { issue } from '../issues';
import { integrityStructureIssues } from '../integrity/rule-pack-integrity';
import { collectReferences } from './references';
import { validateFactMappingStructure } from '../mapping/structure';
import { analyzeProgram, type InferredKind } from './program-analysis';

const SEMVER = /^\d+\.\d+\.\d+$/;

export interface StructureReport {
  readonly issues: CalculationIssue[];
  /** Inferred value kind of every step, per workflow key. */
  readonly stepKinds: Readonly<
    Record<'annual' | 'firstTime' | 'missedYear', ReadonlyMap<string, InferredKind>>
  >;
}

function checkDuplicates(
  items: readonly { id: string }[],
  path: string,
  issues: CalculationIssue[],
): void {
  const seen = new Set<string>();
  items.forEach((item, index) => {
    if (seen.has(item.id)) {
      issues.push(issue('PACK_DUPLICATE_ID', `Duplicate id "${item.id}"`, `${path}.${index}`));
    }
    seen.add(item.id);
  });
}

function checkRuleRefs(
  ruleIds: readonly string[],
  known: ReadonlySet<string>,
  path: string,
  issues: CalculationIssue[],
): void {
  for (const id of ruleIds) {
    if (!known.has(id)) issues.push(issue('PACK_UNKNOWN_RULE', `Unknown rule "${id}"`, path));
  }
}

/**
 * Structural validation of a rule pack. Any issue returned here is an error in every mode:
 * the pack is malformed and cannot be evaluated at all.
 */
export function validateRulePackStructure(pack: RulePack): StructureReport {
  const issues: CalculationIssue[] = [];
  const { metadata } = pack;

  if (!SEMVER.test(metadata.version)) {
    issues.push(
      issue('PACK_INVALID_METADATA', 'version must be MAJOR.MINOR.PATCH', 'metadata.version'),
    );
  }
  if (!isIsoDate(metadata.effectiveFrom)) {
    issues.push(
      issue('PACK_INVALID_METADATA', 'effectiveFrom must be YYYY-MM-DD', 'metadata.effectiveFrom'),
    );
  }
  if (metadata.effectiveTo !== null) {
    if (!isIsoDate(metadata.effectiveTo)) {
      issues.push(
        issue('PACK_INVALID_METADATA', 'effectiveTo must be YYYY-MM-DD', 'metadata.effectiveTo'),
      );
    } else if (
      isIsoDate(metadata.effectiveFrom) &&
      compareIsoDates(metadata.effectiveTo, metadata.effectiveFrom) < 0
    ) {
      issues.push(
        issue(
          'PACK_INVALID_METADATA',
          'effectiveTo is before effectiveFrom',
          'metadata.effectiveTo',
        ),
      );
    }
  }
  if (metadata.isMock && (metadata.status === 'APPROVED' || metadata.status === 'PUBLISHED')) {
    issues.push(
      issue(
        'PACK_MOCK_CANNOT_BE_APPROVED',
        'A MOCK / NOT FOR PRODUCTION pack can never be APPROVED or PUBLISHED',
        'metadata.status',
      ),
    );
  }

  // A mock fixture can never carry actual proposed rules for scholar review (M4.5a).
  if (metadata.isMock && metadata.releaseChannel === 'SCHOLAR_REVIEW') {
    issues.push(
      issue(
        'STRUCTURE_MOCK_SCHOLAR_REVIEW',
        'A MOCK / NOT FOR PRODUCTION pack can never be a scholar-review pack',
        'metadata.releaseChannel',
      ),
    );
  }
  // The release channel exists only from schemaVersion 3, and is required there (M4.5a).
  if ((metadata.schemaVersion === 3) !== (metadata.releaseChannel !== undefined)) {
    issues.push(
      issue(
        'CHANNEL_MISMATCH',
        'schemaVersion 3 packs require a release channel; versions 1–2 carry none',
        'metadata.releaseChannel',
      ),
    );
  }

  checkDuplicates(pack.sources, 'sources', issues);
  checkDuplicates(pack.rules, 'rules', issues);
  checkDuplicates(pack.inputCategories, 'inputCategories', issues);
  checkDuplicates(pack.questions, 'questions', issues);
  checkDuplicates(pack.parameters, 'parameters', issues);
  checkDuplicates(pack.consultations, 'consultations', issues);

  const sourceIds = new Set(pack.sources.map((s) => s.id));
  const ruleIds = new Set(pack.rules.map((r) => r.id));

  pack.rules.forEach((rule, index) => {
    for (const ref of rule.sourceRefs) {
      if (!sourceIds.has(ref)) {
        issues.push(
          issue('PACK_UNKNOWN_SOURCE', `Unknown source "${ref}"`, `rules.${index}.sourceRefs`),
        );
      }
    }
  });
  pack.inputCategories.forEach((c, i) => {
    checkRuleRefs(c.ruleIds, ruleIds, `inputCategories.${i}.ruleIds`, issues);
  });
  pack.consultations.forEach((c, i) => {
    checkRuleRefs(c.ruleIds, ruleIds, `consultations.${i}.ruleIds`, issues);
  });
  pack.parameters.forEach((p, i) => {
    checkRuleRefs(p.ruleIds, ruleIds, `parameters.${i}.ruleIds`, issues);
    if (!Decimal.isValid(p.value)) {
      issues.push(
        issue(
          'PACK_INVALID_PARAMETER_VALUE',
          `Parameter "${p.id}" is not a decimal string`,
          `parameters.${i}.value`,
        ),
      );
    }
  });
  pack.questions.forEach((q, i) => {
    checkRuleRefs(q.ruleIds, ruleIds, `questions.${i}.ruleIds`, issues);
    const uniqueChoices = new Set(q.choices);
    const valid =
      q.kind === 'choice'
        ? q.choices.length >= 2 && uniqueChoices.size === q.choices.length
        : // Phase 4: a decimal question is answered per fact (mapping), never required here.
          q.choices.length === 0 && (q.kind === 'boolean' || !q.required);
    if (!valid) {
      issues.push(
        issue(
          'PACK_INVALID_QUESTION',
          q.kind === 'boolean'
            ? `Boolean question "${q.id}" must not declare choices`
            : q.kind === 'decimal'
              ? `Decimal question "${q.id}" must not declare choices or be required`
              : `Choice question "${q.id}" needs at least two distinct choices`,
          `questions.${i}`,
        ),
      );
    }
  });

  const analyse = (program: Program | null, path: string): ReadonlyMap<string, InferredKind> => {
    if (program === null) return new Map();
    program.steps.forEach((s, i) => {
      checkRuleRefs(s.ruleIds, ruleIds, `${path}.steps.${i}.ruleIds`, issues);
    });
    const analysis = analyzeProgram(pack, program, path);
    issues.push(...analysis.issues);
    return analysis.stepKinds;
  };

  const { workflows } = pack;
  // Phase 4: only the annual workflow has one assessment period to measure.
  for (const [program, path] of [
    [workflows.firstTime, 'workflows.firstTime'],
    [workflows.missedYear?.perYear ?? null, 'workflows.missedYear.perYear'],
  ] as const) {
    if (program !== null && collectReferences(program).usesPeriod) {
      issues.push(
        issue('PROGRAM_INVALID_CONDITION', 'Period conditions are for the annual workflow', path),
      );
    }
  }
  const annual = analyse(workflows.annual, 'workflows.annual');
  const firstTime = analyse(workflows.firstTime, 'workflows.firstTime');
  const missedYear = analyse(workflows.missedYear?.perYear ?? null, 'workflows.missedYear.perYear');

  if (workflows.missedYear !== null) {
    const outputIds = new Set(workflows.missedYear.perYear.outputs.map((o) => o.id));
    workflows.missedYear.aggregateOutputIds.forEach((id, i) => {
      if (!outputIds.has(id)) {
        issues.push(
          issue(
            'PROGRAM_UNKNOWN_AGGREGATE_OUTPUT',
            `Aggregate refers to unknown per-year output "${id}"`,
            `workflows.missedYear.aggregateOutputIds.${i}`,
          ),
        );
      }
    });
    checkRuleRefs(
      workflows.missedYear.aggregateRuleIds,
      ruleIds,
      'workflows.missedYear.aggregateRuleIds',
      issues,
    );
  }

  issues.push(...validateFactMappingStructure(pack));
  issues.push(...integrityStructureIssues(pack));
  return { issues, stepKinds: { annual, firstTime, missedYear } };
}
