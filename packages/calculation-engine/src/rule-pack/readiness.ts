import type {
  CalculationIssue,
  ContentIntegrity,
  Program,
  RulePack,
  RulePackActivation,
  Workflow,
} from '@khums/shared-types';
import { compareIsoDates } from '@khums/utils';

import { issue } from '../issues';
import { sameIntegrity, verifyDeclaredIntegrity } from '../integrity/rule-pack-integrity';
import { mappingReferences, validateFactMappingStructure } from '../mapping/structure';
import { validateRulePackStructure } from './structure';
import { collectReferences } from './references';

/** A date range (or single date: start === end) the pack must be effective for. */
export interface DateRange {
  readonly start: string;
  readonly end: string;
}

export interface ReadinessRequest {
  readonly workflow: Workflow;
  readonly activation: RulePackActivation | null;
  readonly dateRanges: readonly DateRange[];
  /**
   * The input was produced from financial facts through the pack's fact mapping. The pack must
   * then define one, and every mapping element it uses must be approved and sourced.
   */
  readonly requireFactMapping?: boolean;
}

const programsFor = (pack: RulePack, workflow: Workflow): Program | null => {
  switch (workflow) {
    case 'annual':
      return pack.workflows.annual;
    case 'first-time':
      return pack.workflows.firstTime;
    case 'missed-year':
      return pack.workflows.missedYear?.perYear ?? null;
  }
};

/**
 * A scholar-review channel pack (M4.5a) is never production content: it can never be approved
 * through governance, published, activated or used for a production calculation. Its approval
 * produces a NEW production version (new content, new digest), never a relabelled copy.
 */
function scholarReviewChannelIssues(pack: RulePack): CalculationIssue[] {
  return pack.metadata.releaseChannel === 'SCHOLAR_REVIEW'
    ? [
        issue(
          'READINESS_SCHOLAR_REVIEW_PACK',
          'A scholar-review pack can never be approved, published, activated or used in production',
          'metadata.releaseChannel',
        ),
      ]
    : [];
}

interface MetadataCheck {
  readonly issues: CalculationIssue[];
  /** Integrity recomputed from the pack content in THIS call (never cached). */
  readonly computed: ContentIntegrity | null;
  /** References of approvals bound to the recomputed content (the only ones that count). */
  readonly validApprovalReferences: ReadonlySet<string>;
}

/**
 * Metadata gates, including content integrity (FR-1): the digest is recomputed from the actual
 * content and compared with the declared integrity, and only approvals bound to that exact
 * recomputed integrity count as approvals. A changed pack therefore loses its approvals.
 */
function checkMetadata(pack: RulePack): MetadataCheck {
  const { metadata } = pack;
  const verified = verifyDeclaredIntegrity(pack);
  const issues: CalculationIssue[] = [...verified.issues];
  const { computed } = verified;
  if (metadata.isMock) {
    issues.push(
      issue(
        'READINESS_MOCK_RULE_PACK',
        'MOCK / NOT FOR PRODUCTION rule pack cannot be used for production calculations',
        'metadata.isMock',
      ),
    );
  }
  issues.push(...scholarReviewChannelIssues(pack));
  if (metadata.status !== 'PUBLISHED') {
    issues.push(
      issue(
        'READINESS_NOT_PUBLISHED',
        `Rule pack status is ${metadata.status}, not PUBLISHED`,
        'metadata.status',
      ),
    );
  }

  const validApprovals = metadata.approvals.filter((approval, index) => {
    const path = `metadata.approvals.${String(index)}`;
    if (approval.integrity === undefined) {
      issues.push(
        issue('READINESS_APPROVAL_NOT_BOUND', 'Approval is not bound to a content digest', path),
      );
      return false;
    }
    if (computed === null || !sameIntegrity(approval.integrity, computed)) {
      issues.push(
        issue(
          'READINESS_APPROVAL_STALE',
          'Approval covers different content (or another canonicalization/scope)',
          path,
        ),
      );
      return false;
    }
    return true;
  });

  // Approval sign-off: either independent review (a scholar reviewer AND a different approver) or
  // a single person's sign-off: a governing scholar's approval (SINGLE_SCHOLAR_V1) or the source
  // verification of a rule-builder pack (SOURCE_VERIFIED_AUTO_V1, decisions 63 and 67). Only
  // approvals bound to the content recomputed above count in any form. Which form a pack may carry
  // is decided by its governance ledger (`@khums/core` checks the approvals equal the ledger's
  // exactly); this gate never relaxes any other requirement.
  const governingScholarApproved = validApprovals.some(
    (a) => a.role === 'GOVERNING_SCHOLAR' || a.role === 'SOURCE_VERIFIER',
  );
  const scholars = new Set(
    validApprovals.filter((a) => a.role === 'SCHOLAR_REVIEWER').map((a) => a.reviewerId),
  );
  const approvers = new Set(
    validApprovals.filter((a) => a.role === 'APPROVER').map((a) => a.reviewerId),
  );
  if (!governingScholarApproved && scholars.size === 0) {
    issues.push(
      issue(
        'READINESS_MISSING_SCHOLAR_APPROVAL',
        'No valid scholar-reviewer approval for this content',
        'metadata.approvals',
      ),
    );
  }
  if (!governingScholarApproved && approvers.size === 0) {
    issues.push(
      issue(
        'READINESS_MISSING_APPROVER',
        'No valid approver sign-off for this content',
        'metadata.approvals',
      ),
    );
  }
  if (
    !governingScholarApproved &&
    scholars.size > 0 &&
    approvers.size > 0 &&
    [...approvers].every((id) => scholars.has(id))
  ) {
    issues.push(
      issue(
        'READINESS_APPROVAL_SEPARATION',
        'The approver must be a different person from the scholar reviewer(s)',
        'metadata.approvals',
      ),
    );
  }
  return {
    issues,
    computed,
    validApprovalReferences: new Set(validApprovals.map((a) => a.reference)),
  };
}

function checkProgramRules(
  pack: RulePack,
  program: Program,
  path: string,
  extraRuleIds: readonly string[],
): CalculationIssue[] {
  const issues: CalculationIssue[] = [];
  const rulesById = new Map(pack.rules.map((r) => [r.id, r]));
  const usedRuleIds = new Set<string>(extraRuleIds);

  const requireRules = (ruleIds: readonly string[], element: string, elementPath: string): void => {
    if (ruleIds.length === 0) {
      issues.push(
        issue(
          'READINESS_ELEMENT_WITHOUT_RULE',
          `${element} is not justified by any rule`,
          elementPath,
        ),
      );
    }
    ruleIds.forEach((id) => usedRuleIds.add(id));
  };

  program.steps.forEach((s, i) => {
    requireRules(s.ruleIds, `Step "${s.id}"`, `${path}.steps.${i}`);
  });
  const refs = collectReferences(program);
  pack.inputCategories.forEach((c, i) => {
    if (refs.categoryIds.has(c.id))
      requireRules(c.ruleIds, `Input category "${c.id}"`, `inputCategories.${i}`);
  });
  pack.parameters.forEach((p, i) => {
    if (refs.parameterIds.has(p.id))
      requireRules(p.ruleIds, `Parameter "${p.id}"`, `parameters.${i}`);
  });
  pack.questions.forEach((q, i) => {
    if (refs.questionIds.has(q.id)) requireRules(q.ruleIds, `Question "${q.id}"`, `questions.${i}`);
  });
  pack.consultations.forEach((c, i) => {
    if (refs.consultationIds.has(c.id))
      requireRules(c.ruleIds, `Consultation "${c.id}"`, `consultations.${i}`);
  });

  for (const ruleId of usedRuleIds) {
    const rule = rulesById.get(ruleId);
    if (!rule) continue; // reported by structure validation
    if (rule.status !== 'APPROVED') {
      issues.push(
        issue(
          'READINESS_RULE_NOT_APPROVED',
          `Rule "${ruleId}" is ${rule.status}, not APPROVED`,
          `rules.${ruleId}`,
        ),
      );
    }
    if (rule.sourceRefs.length === 0) {
      issues.push(
        issue(
          'READINESS_RULE_WITHOUT_SOURCE',
          `Rule "${ruleId}" cites no source`,
          `rules.${ruleId}`,
        ),
      );
    }
  }
  return issues;
}

/**
 * Rule justification of everything one workflow's program (and missed-year aggregation) uses,
 * plus approval and sourcing of the rules it relies on. Shared by the production and the
 * scholar-review gates (the latter keeps only the justification issues).
 */
function workflowRuleIssues(pack: RulePack, workflow: Workflow): CalculationIssue[] {
  const program = programsFor(pack, workflow);
  if (program === null) return [];
  const path =
    workflow === 'annual'
      ? 'workflows.annual'
      : workflow === 'first-time'
        ? 'workflows.firstTime'
        : 'workflows.missedYear.perYear';
  const issues: CalculationIssue[] = [];
  const missedYear = workflow === 'missed-year' ? pack.workflows.missedYear : null;
  const aggregates = missedYear !== null && missedYear.aggregateOutputIds.length > 0;
  const aggregateRuleIds = aggregates ? missedYear.aggregateRuleIds : [];
  if (aggregates && aggregateRuleIds.length === 0) {
    issues.push(
      issue(
        'READINESS_ELEMENT_WITHOUT_RULE',
        'Missed-year aggregation is not justified by any rule',
        'workflows.missedYear',
      ),
    );
  }
  issues.push(...checkProgramRules(pack, program, path, aggregateRuleIds));
  return issues;
}

/**
 * Fact-mapping readiness for one workflow: the mapping as a whole and every mapping rule for the
 * workflow must be justified by rules, and every rule, question and consultation the mapping can
 * reach must be approved and sourced (same standard as program elements).
 */
function checkMappingRules(pack: RulePack, workflow: Workflow): CalculationIssue[] {
  const issues: CalculationIssue[] = [];
  const mapping = pack.factMapping;
  if (mapping === undefined) return issues;
  // An inconsistent mapping is never production-ready, even if structure validation was skipped.
  issues.push(...validateFactMappingStructure(pack));
  if (mapping.ruleIds.length === 0) {
    issues.push(
      issue(
        'READINESS_ELEMENT_WITHOUT_RULE',
        'The fact mapping is not justified by any rule',
        'factMapping.ruleIds',
      ),
    );
  }
  mapping.rules.forEach((rule, index) => {
    if (rule.match.workflows.includes(workflow) && rule.ruleIds.length === 0) {
      issues.push(
        issue(
          'READINESS_ELEMENT_WITHOUT_RULE',
          `Mapping rule "${rule.id}" is not justified by any rule`,
          `factMapping.rules.${String(index)}`,
        ),
      );
    }
  });
  const refs = mappingReferences(pack, workflow);
  const rulesById = new Map(pack.rules.map((r) => [r.id, r]));
  const used = new Set(refs.ruleIds);
  pack.questions.forEach((q, i) => {
    if (!refs.questionIds.has(q.id)) return;
    if (q.ruleIds.length === 0) {
      issues.push(
        issue(
          'READINESS_ELEMENT_WITHOUT_RULE',
          `Question "${q.id}" is not justified by any rule`,
          `questions.${String(i)}`,
        ),
      );
    }
    q.ruleIds.forEach((id) => used.add(id));
  });
  pack.consultations.forEach((c, i) => {
    if (!refs.consultationIds.has(c.id)) return;
    if (c.ruleIds.length === 0) {
      issues.push(
        issue(
          'READINESS_ELEMENT_WITHOUT_RULE',
          `Consultation "${c.id}" is not justified by any rule`,
          `consultations.${String(i)}`,
        ),
      );
    }
    c.ruleIds.forEach((id) => used.add(id));
  });
  for (const ruleId of used) {
    const rule = rulesById.get(ruleId);
    if (rule === undefined) continue; // reported by structure validation
    if (rule.status !== 'APPROVED') {
      issues.push(
        issue(
          'READINESS_RULE_NOT_APPROVED',
          `Rule "${ruleId}" is ${rule.status}, not APPROVED`,
          `rules.${ruleId}`,
        ),
      );
    }
    if (rule.sourceRefs.length === 0) {
      issues.push(
        issue(
          'READINESS_RULE_WITHOUT_SOURCE',
          `Rule "${ruleId}" cites no source`,
          `rules.${ruleId}`,
        ),
      );
    }
  }
  return issues;
}

/**
 * Production gate. Returns blocking issues (empty = ready). Covers: mock flag, publication,
 * approval sign-off (scholar + separate approver, or a single governing scholar under the
 * `SINGLE_SCHOLAR_V1` policy), content hash, activation, rule approval/sourcing for
 * everything the workflow uses, and effective dates.
 */
export function checkProductionReadiness(
  pack: RulePack,
  request: ReadinessRequest,
): CalculationIssue[] {
  const meta = checkMetadata(pack);
  const issues = meta.issues;
  const { metadata } = pack;

  const { activation } = request;
  if (activation === null) {
    issues.push(
      issue(
        'READINESS_NOT_ACTIVATED',
        'No activation record: the pack has not been activated for production',
        null,
      ),
    );
  } else {
    const mismatches = [
      activation.packId !== metadata.packId && 'packId',
      activation.version !== metadata.version && 'version',
      activation.approvalReferences.length === 0 && 'approvalReferences (empty)',
      activation.publicationReference.trim() === '' && 'publicationReference (empty)',
      activation.approvalReferences.some((ref) => !meta.validApprovalReferences.has(ref)) &&
        'approvalReferences',
    ].filter((m): m is string => typeof m === 'string');
    // The activation must name the content as RECOMPUTED now, not merely the declared value.
    if (meta.computed === null || !sameIntegrity(activation.integrity, meta.computed)) {
      issues.push(
        issue(
          'READINESS_ACTIVATION_STALE',
          'Activation was created for different content (or another canonicalization/scope)',
          null,
        ),
      );
    }
    if (mismatches.length > 0) {
      issues.push(
        issue(
          'READINESS_ACTIVATION_MISMATCH',
          `Activation does not match the pack: ${mismatches.join(', ')}`,
          null,
        ),
      );
    }
  }

  issues.push(...workflowRuleIssues(pack, request.workflow));

  if (request.requireFactMapping === true && pack.factMapping === undefined) {
    issues.push(
      issue(
        'READINESS_MAPPING_MISSING',
        'The input comes from financial facts, but the pack defines no fact mapping',
        'factMapping',
      ),
    );
  }
  if (pack.factMapping !== undefined) issues.push(...checkMappingRules(pack, request.workflow));

  issues.push(...effectiveDateIssues(pack, request.dateRanges));
  return issues;
}

function effectiveDateIssues(pack: RulePack, dateRanges: readonly DateRange[]): CalculationIssue[] {
  const { metadata } = pack;
  const issues: CalculationIssue[] = [];
  for (const range of dateRanges) {
    const startsTooEarly = compareIsoDates(range.start, metadata.effectiveFrom) < 0;
    const endsTooLate =
      metadata.effectiveTo !== null && compareIsoDates(range.end, metadata.effectiveTo) > 0;
    if (startsTooEarly || endsTooLate) {
      issues.push(
        issue(
          'READINESS_NOT_EFFECTIVE',
          `Rule pack is not effective for ${range.start}…${range.end} (effective ${metadata.effectiveFrom}…${metadata.effectiveTo ?? 'open'})`,
          null,
        ),
      );
    }
  }
  return issues;
}

/**
 * Activation eligibility for the scholar-approval → activation workflow: everything the
 * production gate requires except the activation record itself and assessment dates, for every
 * workflow the pack defines. An activation may only be created when this returns no issues.
 */
export function checkActivationEligibility(pack: RulePack): CalculationIssue[] {
  // A structurally invalid pack (programs, mapping or integrity) can never be activated.
  const issues: CalculationIssue[] = [
    ...validateRulePackStructure(pack).issues.filter((i) => i.severity === 'error'),
    ...checkMetadata(pack).issues,
  ];
  const workflows: Workflow[] = [];
  if (pack.workflows.annual) workflows.push('annual');
  if (pack.workflows.firstTime) workflows.push('first-time');
  if (pack.workflows.missedYear) workflows.push('missed-year');
  for (const workflow of workflows) {
    for (const found of checkProductionReadiness(pack, {
      workflow,
      activation: null,
      dateRanges: [],
    })) {
      const duplicate = issues.some(
        (existing) =>
          existing.code === found.code &&
          existing.path === found.path &&
          existing.message === found.message,
      );
      if (found.code !== 'READINESS_NOT_ACTIVATED' && !duplicate) issues.push(found);
    }
  }
  return issues;
}

/**
 * Approval eligibility: the content must be sealed (declared integrity that matches the content
 * recomputed now), structurally valid and not MOCK, so reviewers approve an exact digest. Status
 * transitions are owned by the future review workflow and are not checked here.
 */
export function checkApprovalEligibility(pack: RulePack): CalculationIssue[] {
  const issues = validateRulePackStructure(pack).issues.filter((i) => i.severity === 'error');
  issues.push(...verifyDeclaredIntegrity(pack).issues);
  if (pack.metadata.isMock) {
    issues.push(
      issue(
        'READINESS_MOCK_RULE_PACK',
        'A MOCK rule pack can never be approved',
        'metadata.isMock',
      ),
    );
  }
  issues.push(...scholarReviewChannelIssues(pack));
  return issues;
}

export interface ScholarReviewReadinessRequest {
  readonly workflow: Workflow;
  readonly dateRanges: readonly DateRange[];
}

/**
 * Scholar-review gate (M4.5a): when a pack may be used for a PROVISIONAL calculation. Requires a
 * sealed (integrity-verified), structurally valid schemaVersion 3 pack on the `SCHOLAR_REVIEW`
 * channel that is not MOCK; every rule UNVERIFIED or APPROVED (never DRAFT or SUPERSEDED) and
 * sourced; every element the workflow uses justified by rules; effective for the dates. It does
 * NOT require approvals, publication or activation, and passing it never makes a pack
 * authoritative: results are always PROVISIONAL — FOR SCHOLAR REVIEW ONLY.
 */
export function checkScholarReviewReadiness(
  pack: RulePack,
  request: ScholarReviewReadinessRequest,
): CalculationIssue[] {
  const { metadata } = pack;
  const issues: CalculationIssue[] = [
    ...validateRulePackStructure(pack).issues.filter((i) => i.severity === 'error'),
    ...verifyDeclaredIntegrity(pack).issues,
  ];
  if (metadata.schemaVersion !== 3 || metadata.releaseChannel !== 'SCHOLAR_REVIEW') {
    issues.push(
      issue(
        'CHANNEL_MISMATCH',
        'Provisional calculations need a schemaVersion 3 pack on the SCHOLAR_REVIEW channel',
        'metadata.releaseChannel',
      ),
    );
  }
  if (metadata.isMock) {
    issues.push(
      issue(
        'READINESS_MOCK_RULE_PACK',
        'A MOCK pack is never used for scholar review',
        'metadata.isMock',
      ),
    );
  }
  pack.rules.forEach((rule, index) => {
    if (rule.status !== 'UNVERIFIED' && rule.status !== 'APPROVED') {
      issues.push(
        issue(
          'PROVISIONAL_RULE_STATUS',
          `Rule "${rule.id}" is ${rule.status}; scholar-review packs allow only UNVERIFIED or APPROVED rules`,
          `rules.${String(index)}`,
        ),
      );
    }
    if (rule.sourceRefs.length === 0) {
      issues.push(
        issue(
          'READINESS_RULE_WITHOUT_SOURCE',
          `Rule "${rule.id}" cites no source`,
          `rules.${rule.id}`,
        ),
      );
    }
  });
  // Justification of every used element (same standard as production), except that UNVERIFIED
  // rules are acceptable here: the status of every rule was checked above.
  issues.push(
    ...workflowRuleIssues(pack, request.workflow).filter(
      (i) => i.code === 'READINESS_ELEMENT_WITHOUT_RULE',
    ),
  );
  if (pack.factMapping !== undefined) {
    issues.push(
      ...checkMappingRules(pack, request.workflow).filter(
        (i) =>
          i.code !== 'READINESS_RULE_NOT_APPROVED' && i.code !== 'READINESS_RULE_WITHOUT_SOURCE',
      ),
    );
  }
  issues.push(...effectiveDateIssues(pack, request.dateRanges));
  // One entry per distinct issue (structure and readiness can report the same problem).
  return issues.filter(
    (found, index) =>
      issues.findIndex(
        (other) =>
          other.code === found.code && other.path === found.path && other.message === found.message,
      ) === index,
  );
}

/**
 * Publication eligibility (APPROVED → PUBLISHED): everything activation requires except the
 * PUBLISHED status itself, with status APPROVED. `status` is outside the hashed content, so
 * publishing keeps the digest and the approvals bound to it.
 */
export function checkPublicationEligibility(pack: RulePack): CalculationIssue[] {
  const issues = checkActivationEligibility(pack).filter(
    (i) => i.code !== 'READINESS_NOT_PUBLISHED',
  );
  if (pack.metadata.status !== 'APPROVED') {
    issues.push(
      issue(
        'READINESS_NOT_APPROVED_STATUS',
        `Only an APPROVED pack can be published (status is ${pack.metadata.status})`,
        'metadata.status',
      ),
    );
  }
  return issues;
}
