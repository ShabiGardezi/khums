import type {
  CalculationIssue,
  FactMappingAction,
  FinancialFactKind,
  Program,
  RulePack,
  Workflow,
} from '@khums/shared-types';

import { Decimal } from '@khums/money';

import { issue } from '../issues';
import { collectReferences } from '../rule-pack/references';
import {
  FACT_DATE_FIELDS,
  FACT_SUBTYPES,
  SUPPORTED_MAPPING_VERSIONS,
  WORKFLOWS_REQUIRING_ENTRY_DATES,
} from './vocabulary';

/** Any amount/date handling as found in pack data (validated here, not trusted). */
interface AnyHandling {
  readonly handling: string;
  readonly consultationId?: string;
}

const STOP = new Set(['clarify', 'consult']);
const USE_OR_STOP = new Set(['use', 'clarify', 'consult']);
const RANGE = new Set(['use-min', 'use-max', 'clarify', 'consult']);

const programFor = (pack: RulePack, workflow: Workflow): Program | null => {
  switch (workflow) {
    case 'annual':
      return pack.workflows.annual;
    case 'first-time':
      return pack.workflows.firstTime;
    case 'missed-year':
      return pack.workflows.missedYear?.perYear ?? null;
  }
};

const subtypesOf = (kind: FinancialFactKind): readonly string[] => FACT_SUBTYPES[kind];

/**
 * Structural checks for a pack's fact mapping. Errors in every mode; any issue makes the pack
 * unusable (fail closed). Covers:
 * - schema-version consistency and the mapping-language and fact-sheet versions;
 * - every reference (categories, questions and answer values, consultations, rules, workflows);
 * - known subtypes per kind, and no overlap: at most one rule per (workflow, kind, subtype);
 * - categories the workflow's program actually uses (otherwise a mapped amount would be ignored);
 * - every exclusion's own justification;
 * - only supported operations and handlings;
 * - dates where the workflow needs them, from fields the matched kinds have.
 * Returns no issues for a version 1 pack without a mapping.
 */
export function validateFactMappingStructure(pack: RulePack): CalculationIssue[] {
  const issues: CalculationIssue[] = [];
  const mapping = pack.factMapping;
  const version = pack.metadata.schemaVersion;
  if (version === 1 && mapping !== undefined) {
    issues.push(
      issue(
        'MAPPING_SCHEMA_VERSION',
        'A fact mapping requires schemaVersion 2 or later',
        'factMapping',
      ),
    );
  }
  if (version === 2 && mapping === undefined) {
    issues.push(
      issue('MAPPING_SCHEMA_VERSION', 'Schema version 2 requires a fact mapping', 'factMapping'),
    );
  }
  if (mapping === undefined) return issues;

  if (!SUPPORTED_MAPPING_VERSIONS.includes(mapping.mappingVersion)) {
    issues.push(
      issue(
        'MAPPING_UNSUPPORTED_VERSION',
        'Unsupported mapping version',
        'factMapping.mappingVersion',
      ),
    );
  }
  if (
    mapping.factSheetSchemaVersions.length === 0 ||
    !mapping.factSheetSchemaVersions.every((v) => (v as number) === 1)
  ) {
    issues.push(
      issue(
        'MAPPING_UNSUPPORTED_VERSION',
        'Unsupported fact-sheet schema version',
        'factMapping.factSheetSchemaVersions',
      ),
    );
  }

  const categories = new Set(pack.inputCategories.map((c) => c.id));
  const consultations = new Set(pack.consultations.map((c) => c.id));
  const rules = new Set(pack.rules.map((r) => r.id));
  const questions = new Map(pack.questions.map((q) => [q.id, q]));

  const checkRules = (ruleIds: readonly string[], path: string) => {
    for (const id of ruleIds) {
      if (!rules.has(id)) issues.push(issue('PACK_UNKNOWN_RULE', `Unknown rule "${id}"`, path));
    }
  };
  const checkConsultation = (id: string, path: string) => {
    if (!consultations.has(id)) {
      issues.push(issue('MAPPING_UNKNOWN_CONSULTATION', `Unknown consultation "${id}"`, path));
    }
  };
  const checkHandling = (h: AnyHandling, allowed: ReadonlySet<string>, path: string) => {
    if (!allowed.has(h.handling)) {
      issues.push(
        issue('MAPPING_UNSUPPORTED_OPERATION', `Unsupported handling "${h.handling}"`, path),
      );
    } else if (h.handling === 'consult') {
      checkConsultation(h.consultationId ?? '', path);
    }
  };

  checkRules(mapping.ruleIds, 'factMapping.ruleIds');
  checkHandling(mapping.unmatched, new Set(['consult']), 'factMapping.unmatched');
  if (mapping.outOfPeriod !== undefined) {
    checkHandling(mapping.outOfPeriod, new Set(['consult']), 'factMapping.outOfPeriod');
  }

  const ids = new Set<string>();
  // workflow|kind|subtype → the rules claiming it and their date window ('ANY' when undated).
  const claimed = new Map<string, { readonly ruleId: string; readonly window: string }[]>();
  mapping.rules.forEach((rule, index) => {
    const path = `factMapping.rules.${String(index)}`;
    if (ids.has(rule.id)) {
      issues.push(issue('MAPPING_DUPLICATE_RULE', `Duplicate mapping rule "${rule.id}"`, path));
    }
    ids.add(rule.id);
    checkRules(rule.ruleIds, `${path}.ruleIds`);

    // Phase 4 (decision 78): date windows exist only for the annual workflow's single period.
    const dated = rule.match.dated;
    if (dated !== undefined) {
      const known = ['IN_PERIOD', 'BEFORE_START', 'AFTER_END'].includes(dated.window);
      const annualOnly = rule.match.workflows.length === 1 && rule.match.workflows[0] === 'annual';
      const daysOk =
        dated.window !== 'AFTER_END' ||
        (Number.isInteger(dated.days) && dated.days >= 1 && dated.days <= 31);
      if (!known || !annualOnly || !daysOk) {
        issues.push(
          issue(
            'MAPPING_INVALID_DATE_WINDOW',
            'A date window needs the annual workflow alone and, after the end, 1 to 31 days',
            `${path}.match.dated`,
          ),
        );
      }
    }
    const window = dated?.window ?? 'ANY';

    // Known subtypes only, each listed kind naming at least one of its own subtypes.
    for (const subtype of rule.match.subtypes) {
      if (!rule.match.kinds.some((kind) => subtypesOf(kind).includes(subtype))) {
        issues.push(
          issue(
            'MAPPING_UNKNOWN_SUBTYPE',
            `"${subtype}" is not a subtype of the listed kinds`,
            `${path}.match.subtypes`,
          ),
        );
      }
    }
    for (const kind of rule.match.kinds) {
      if (!rule.match.subtypes.some((s) => subtypesOf(kind).includes(s))) {
        issues.push(
          issue(
            'MAPPING_KIND_WITHOUT_SUBTYPE',
            `${kind} has none of its subtypes named`,
            `${path}.match.kinds`,
          ),
        );
      }
    }

    for (const workflow of rule.match.workflows) {
      const program = programFor(pack, workflow);
      if (program === null) {
        issues.push(
          issue(
            'MAPPING_UNKNOWN_WORKFLOW',
            `The pack defines no ${workflow} workflow`,
            `${path}.match.workflows`,
          ),
        );
      }
      // No overlap: (workflow, kind, subtype) is claimed by at most one rule.
      for (const kind of rule.match.kinds) {
        for (const subtype of rule.match.subtypes) {
          if (!subtypesOf(kind).includes(subtype)) continue;
          const key = `${workflow}|${kind}|${subtype}`;
          const owners = claimed.get(key) ?? [];
          // Rules may share a type only with different date windows (windows never overlap).
          const clash = owners.find(
            (o) =>
              o.ruleId !== rule.id &&
              (o.window === 'ANY' || window === 'ANY' || o.window === window),
          );
          if (clash !== undefined) {
            issues.push(
              issue(
                'MAPPING_OVERLAPPING_RULES',
                `Rules "${clash.ruleId}" and "${rule.id}" both match ${workflow} ${kind} ${subtype}`,
                `${path}.match`,
              ),
            );
          } else {
            claimed.set(key, [...owners, { ruleId: rule.id, window }]);
          }
        }
      }
    }

    const checkAction = (action: FactMappingAction, actionPath: string): void => {
      switch (action.action) {
        case 'category': {
          if (!categories.has(action.categoryId)) {
            issues.push(
              issue(
                'MAPPING_UNKNOWN_CATEGORY',
                `Unknown input category "${action.categoryId}"`,
                actionPath,
              ),
            );
          }
          // A category the workflow's program never reads would silently drop the amount.
          for (const workflow of rule.match.workflows) {
            const program = programFor(pack, workflow);
            if (
              program !== null &&
              !collectReferences(program).categoryIds.has(action.categoryId)
            ) {
              issues.push(
                issue(
                  'MAPPING_CATEGORY_NOT_IN_PROGRAM',
                  `The ${workflow} program does not use category "${action.categoryId}"`,
                  actionPath,
                ),
              );
            }
          }
          const { amount, date } = action;
          // Phase 4 / decision 82: per-fact adjustments (a single `adjust`, or an ordered list).
          const adjustments =
            action.adjustments ?? (action.adjust === undefined ? [] : [action.adjust]);
          const adjustmentValid = (adjust: (typeof adjustments)[number], index: number) => {
            if (adjust.mode === 'FIXED_PERCENT') {
              const parsed = Decimal.parse(adjust.percent);
              return parsed.ok && !parsed.value.isNegative();
            }
            const q = questions.get(adjust.questionId);
            if (q?.kind !== 'decimal' || q.required) return false;
            switch (adjust.mode) {
              case 'AMOUNT':
                return q.unit === 'AMOUNT' && index === 0;
              case 'ADD_PERCENT':
              case 'PERCENT':
                return q.unit !== 'AMOUNT';
              default:
                return false;
            }
          };
          if (
            (action.adjust !== undefined && action.adjustments !== undefined) ||
            action.adjustments?.length === 0 ||
            !adjustments.every(adjustmentValid)
          ) {
            issues.push(
              issue(
                'MAPPING_INVALID_ADJUSTMENT',
                'An amount adjustment needs a per-fact decimal question of the right unit (an amount first), or a fixed percentage',
                `${actionPath}.${action.adjustments === undefined ? 'adjust' : 'adjustments'}`,
              ),
            );
          }
          checkHandling(amount.estimated, USE_OR_STOP, `${actionPath}.amount.estimated`);
          checkHandling(amount.range, RANGE, `${actionPath}.amount.range`);
          checkHandling(amount.unknown, STOP, `${actionPath}.amount.unknown`);
          checkHandling(amount.notProvided, STOP, `${actionPath}.amount.notProvided`);
          checkHandling(date.approximate, USE_OR_STOP, `${actionPath}.date.approximate`);
          checkHandling(date.unknown, STOP, `${actionPath}.date.unknown`);
          checkHandling(date.notProvided, STOP, `${actionPath}.date.notProvided`);
          if (date.field === null) {
            const needsDate = rule.match.workflows.filter((w) =>
              WORKFLOWS_REQUIRING_ENTRY_DATES.has(w),
            );
            if (needsDate.length > 0) {
              issues.push(
                issue(
                  'MAPPING_DATE_REQUIRED',
                  `Entries for ${needsDate.join(', ')} need a date field`,
                  `${actionPath}.date.field`,
                ),
              );
            }
          } else {
            const field = date.field;
            for (const kind of rule.match.kinds) {
              if (!FACT_DATE_FIELDS[kind].includes(field)) {
                issues.push(
                  issue(
                    'MAPPING_DATE_FIELD_NOT_IN_KIND',
                    `${kind} facts have no "${field}" date`,
                    `${actionPath}.date.field`,
                  ),
                );
              }
            }
          }
          return;
        }
        case 'exclude':
          if (!Array.isArray(action.ruleIds) || action.ruleIds.length === 0) {
            issues.push(
              issue(
                'MAPPING_EXCLUDE_WITHOUT_RULE',
                'An exclusion must cite its own rule(s)',
                actionPath,
              ),
            );
          } else {
            checkRules(action.ruleIds, `${actionPath}.ruleIds`);
          }
          return;
        case 'consult':
          checkConsultation(action.consultationId, actionPath);
          return;
        case 'ask': {
          const question = questions.get(action.questionId);
          if (question === undefined) {
            issues.push(
              issue(
                'MAPPING_UNKNOWN_QUESTION',
                `Unknown question "${action.questionId}"`,
                actionPath,
              ),
            );
          }
          action.cases.forEach((c, caseIndex) => {
            const valid =
              question === undefined ||
              (question.kind === 'boolean'
                ? typeof c.equals === 'boolean'
                : typeof c.equals === 'string' && question.choices.includes(c.equals));
            if (!valid) {
              issues.push(
                issue(
                  'MAPPING_INVALID_ANSWER_VALUE',
                  `Answer value does not fit question "${action.questionId}"`,
                  `${actionPath}.cases.${String(caseIndex)}`,
                ),
              );
            }
            checkAction(c.then, `${actionPath}.cases.${String(caseIndex)}.then`);
          });
          checkHandling(action.otherwise, new Set(['consult']), `${actionPath}.otherwise`);
          return;
        }
      }
      // Unknown operation in untyped pack data: refuse rather than ignore.
      issues.push(
        issue(
          'MAPPING_UNSUPPORTED_OPERATION',
          `Unsupported mapping action "${String((action as { action?: unknown }).action)}"`,
          actionPath,
        ),
      );
    };
    checkAction(rule.then, `${path}.then`);
  });
  return issues;
}

/**
 * Every rule, question and consultation a mapping can reach for a workflow, across all branches
 * (category handlings, exclusions, asks and their cases, unmatched), for production readiness.
 */
export function mappingReferences(
  pack: RulePack,
  workflow: Workflow,
): { ruleIds: Set<string>; questionIds: Set<string>; consultationIds: Set<string> } {
  const refs = {
    ruleIds: new Set<string>(),
    questionIds: new Set<string>(),
    consultationIds: new Set<string>(),
  };
  const mapping = pack.factMapping;
  if (mapping === undefined) return refs;
  mapping.ruleIds.forEach((id) => refs.ruleIds.add(id));
  refs.consultationIds.add(mapping.unmatched.consultationId);
  if (mapping.outOfPeriod !== undefined)
    refs.consultationIds.add(mapping.outOfPeriod.consultationId);
  const addHandling = (h: AnyHandling) => {
    if (h.handling === 'consult' && h.consultationId !== undefined) {
      refs.consultationIds.add(h.consultationId);
    }
  };
  const walk = (action: FactMappingAction): void => {
    switch (action.action) {
      case 'category':
        [
          action.amount.estimated,
          action.amount.range,
          action.amount.unknown,
          action.amount.notProvided,
          action.date.approximate,
          action.date.unknown,
          action.date.notProvided,
        ].forEach(addHandling);
        for (const adjust of action.adjustments ??
          (action.adjust === undefined ? [] : [action.adjust])) {
          if (adjust.mode !== 'FIXED_PERCENT') refs.questionIds.add(adjust.questionId);
        }
        break;
      case 'exclude':
        action.ruleIds.forEach((id) => refs.ruleIds.add(id));
        break;
      case 'consult':
        refs.consultationIds.add(action.consultationId);
        break;
      case 'ask':
        refs.questionIds.add(action.questionId);
        refs.consultationIds.add(action.otherwise.consultationId);
        action.cases.forEach((c) => {
          walk(c.then);
        });
        break;
    }
  };
  for (const rule of mapping.rules) {
    if (!rule.match.workflows.includes(workflow)) continue;
    rule.ruleIds.forEach((id) => refs.ruleIds.add(id));
    walk(rule.then);
  }
  return refs;
}
