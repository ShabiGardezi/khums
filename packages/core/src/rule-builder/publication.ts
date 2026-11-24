import type {
  AuthorizationDecision,
  GovernanceLedger,
  GovernanceRecord,
  RulePack,
  RulePackActivation,
} from '@khums/shared-types';
import { err, ok, type Result } from '@khums/utils';
import type {
  BuilderEntryRef,
  RuleVerificationRecord,
  ScholarRuleRevision,
} from '@khums/validation';

import {
  executeGovernanceCommand,
  type AuthorizedGovernanceOutcome,
  type GovernanceCommandRequest,
  type GovernanceCommandType,
} from '../governance/authorized';
import { preparePackForPublication } from '../governance/commands';
import { createLedger, deepFreeze } from '../governance/ledger';
import {
  buildRulingSnapshots,
  withRulingSnapshots,
  type ResearchChainLoader,
  type RulingReferenceIssueCode,
} from '../research/rule-pack-references';
import {
  builderPackId,
  compileBuilderPack,
  type BuilderSourceInfo,
  type CompileBuilderError,
} from './compile';
import {
  checkVerificationPreconditions,
  currentVerification,
  type PendingRuleVerification,
} from './verification';
import { validateBuilderRule } from './validate';

/**
 * Automatic approval and publication of source-verified builder rules (Phase 2 step 5;
 * decisions 63 and 67). When a source verification is recorded:
 *
 * 1. `compileVerifiedBuilderPack` compiles the Marja's builder rules into a new `PRODUCTION` pack
 *    version (`<marja>-builder`, next major version) containing ONLY rules whose current revision
 *    is source-verified (status `APPROVED`); every other rule — unverified, incomplete, needing a
 *    developer, or whose evidence changed since its verification — is left out and each of its
 *    entry types maps to a review stop, so nothing unverified can produce a public figure. Ruling
 *    snapshots are built under the `SOURCE_VERIFIED` reference policy and sealed into the content.
 * 2. `runAutomaticBuilderGovernance` runs the EXISTING governance ledger with the verifier as the
 *    actor of every record, through `executeGovernanceCommand` (authorization, separation under
 *    the bound policy, every eligibility, integrity and readiness gate): SUBMITTED (binding
 *    `SOURCE_VERIFIED_AUTO_V1`) → REVIEW_STARTED → REVIEW_COMPLETED → APPROVED (evidence: the
 *    verification) → PUBLISHED → ACTIVATED, then SUPERSEDED on every earlier published builder
 *    version. The four attestations are the review; recording them is the approval (§17.1).
 *
 * Pure: the caller loads the stores, persists the ledgers, contents, verification and audit events
 * in one unit of work, and never runs this for a principal that is not a trusted staff principal
 * (each command re-authorizes it).
 */

/** Builder production packs apply to any assessment period (the builder has no date field). */
export const BUILDER_PRODUCTION_EFFECTIVE_FROM = '2000-01-01';

/** The next builder pack version after `existing` (`1.0.0`, `2.0.0`, …; monotonically increasing). */
export function nextBuilderVersion(existing: readonly string[]): string {
  const majors = existing.map((v) => Number.parseInt(v.split('.')[0] ?? '0', 10) || 0);
  return `${String(Math.max(0, ...majors) + 1)}.0.0`;
}

export type WithheldReason =
  /** The current revision has no matching source verification. */
  | 'NOT_VERIFIED'
  /** The current revision is a draft, invalid, rejected, or needs a developer implementation. */
  | 'NOT_READY'
  /** Verified, but its research evidence no longer meets the preconditions. */
  | 'EVIDENCE_CHANGED'
  /**
   * Verified, but the verifier no longer holds `builder.rule.verify` for the Marja (role revoked
   * or changed): the rule needs verifying again (audit BLD-07).
   */
  | 'VERIFIER_NOT_AUTHORIZED';

export interface VerifiedBuilderPack {
  readonly pack: RulePack;
  readonly included: readonly {
    readonly ruleId: string;
    readonly revision: number;
    readonly verificationId: string;
  }[];
  readonly withheld: readonly {
    readonly ruleId: string;
    readonly revision: number;
    readonly reason: WithheldReason;
  }[];
}

export type VerifiedBuilderPackError =
  | CompileBuilderError
  | {
      readonly code: 'RULING_SNAPSHOTS_FAILED';
      readonly issues: readonly RulingReferenceIssueCode[];
    };

export interface CompileVerifiedBuilderPackInput {
  readonly marjaId: string;
  readonly version: string;
  /** Every rule of the Marja: its revisions, oldest first. */
  readonly histories: readonly (readonly ScholarRuleRevision[])[];
  /** Every stored verification of the Marja's rules, oldest first (plus the one being recorded). */
  readonly verifications: readonly PendingRuleVerification[];
  readonly sources: Readonly<Record<string, BuilderSourceInfo>>;
  readonly load: ResearchChainLoader;
  /** Whether a stored verification still counts (see `ClassifyOptions.counts`). */
  readonly counts?: (verification: PendingRuleVerification) => boolean;
}

export interface ClassifyOptions {
  /**
   * Whether a verification still counts: its verifier still holds `builder.rule.verify` for the
   * Marja at (re)publication time (audit BLD-07). Default: every verification counts.
   */
  readonly counts?: (verification: PendingRuleVerification) => boolean;
  /**
   * Preview only (audit BLD-03): treat this rule's current revision as verified, as if its
   * verification were being recorded now (its research preconditions still apply).
   */
  readonly assumeVerified?: string;
}

/** The placeholder verification id of a rule assumed verified in a preview. */
export const PREVIEW_VERIFICATION_ID = 'preview';

const claimedEntries = (revision: ScholarRuleRevision): BuilderEntryRef[] => [
  ...revision.content.includedEntries,
  ...revision.content.deductions.flatMap((d) => d.entries),
  ...revision.content.exceptions,
];

/** Which current revisions are source-verified now, and why the others are not. */
export function classifyBuilderRules(
  histories: readonly (readonly ScholarRuleRevision[])[],
  verifications: readonly PendingRuleVerification[],
  load: ResearchChainLoader,
  options: ClassifyOptions = {},
): {
  readonly included: readonly { revision: ScholarRuleRevision; verificationId: string }[];
  readonly withheld: readonly { revision: ScholarRuleRevision; reason: WithheldReason }[];
} {
  const included: { revision: ScholarRuleRevision; verificationId: string }[] = [];
  const withheld: { revision: ScholarRuleRevision; reason: WithheldReason }[] = [];
  for (const history of histories) {
    const current = history.at(-1);
    if (current === undefined) continue;
    if (
      current.rejected === true ||
      validateBuilderRule(current.content).status !== 'READY_FOR_VERIFICATION'
    ) {
      withheld.push({ revision: current, reason: 'NOT_READY' });
      continue;
    }
    const assumed = options.assumeVerified === current.ruleId;
    const verification = assumed
      ? { verificationId: PREVIEW_VERIFICATION_ID }
      : currentVerification(current, verifications, load, options.counts);
    if (verification === null) {
      const revoked =
        options.counts !== undefined && currentVerification(current, verifications, load) !== null;
      withheld.push({
        revision: current,
        reason: revoked ? 'VERIFIER_NOT_AUTHORIZED' : 'NOT_VERIFIED',
      });
      continue;
    }
    if (checkVerificationPreconditions(current, load).length > 0) {
      withheld.push({ revision: current, reason: assumed ? 'NOT_READY' : 'EVIDENCE_CHANGED' });
      continue;
    }
    included.push({ revision: current, verificationId: verification.verificationId });
  }
  return { included, withheld };
}

/** Compiles the Marja's source-verified builder rules into a sealed PRODUCTION pack version. */
export function compileVerifiedBuilderPack(
  input: CompileVerifiedBuilderPackInput,
): Result<VerifiedBuilderPack, VerifiedBuilderPackError> {
  const { included, withheld } = classifyBuilderRules(
    input.histories,
    input.verifications,
    input.load,
    input.counts === undefined ? {} : { counts: input.counts },
  );
  const compiled = compileBuilderPack({
    marjaId: input.marjaId,
    version: input.version,
    releaseChannel: 'PRODUCTION',
    effectiveFrom: BUILDER_PRODUCTION_EFFECTIVE_FROM,
    revisions: included.map((i) => i.revision),
    sources: input.sources,
    ruleStatus: 'APPROVED',
    withheldEntries: withheld.flatMap((w) => claimedEntries(w.revision)),
    verificationIds: Object.fromEntries(included.map((i) => [i.revision.ruleId, i.verificationId])),
  });
  if (!compiled.ok) return compiled;
  const snapshots = buildRulingSnapshots(compiled.value.pack, input.load, 'SOURCE_VERIFIED');
  if (snapshots.issues.length > 0) {
    return err({
      code: 'RULING_SNAPSHOTS_FAILED',
      issues: [...new Set(snapshots.issues.map((i) => i.code))],
    });
  }
  const attached = withRulingSnapshots(compiled.value.pack, snapshots.snapshots);
  if (!attached.ok) return err({ code: 'RULING_SNAPSHOTS_FAILED', issues: [attached.code] });
  return ok(
    deepFreeze({
      pack: attached.pack,
      included: included.map((i) => ({
        ruleId: i.revision.ruleId,
        revision: i.revision.revision,
        verificationId: i.verificationId,
      })),
      withheld: withheld.map((w) => ({
        ruleId: w.revision.ruleId,
        revision: w.revision.revision,
        reason: w.reason,
      })),
    }),
  );
}

/** What the next builder version would contain if `verifyingRuleId` were verified now. */
export interface BuilderPublicationPreview {
  readonly included: readonly { readonly ruleId: string; readonly revision: number }[];
  readonly withheld: readonly {
    readonly ruleId: string;
    readonly revision: number;
    readonly reason: WithheldReason;
  }[];
  /** Rules the active (public) version contains that the next version would leave out. */
  readonly removedFromPublic: readonly string[];
}

/**
 * Preview of the next builder publication (audit BLD-03): which rules a verification of
 * `verifyingRuleId` would publish and which it would withhold (with the reason), and which rules
 * now live in `liveRuleIds` would stop being public. Nothing is compiled or stored. Pure.
 */
export function previewBuilderPublication(input: {
  readonly histories: readonly (readonly ScholarRuleRevision[])[];
  readonly verifications: readonly PendingRuleVerification[];
  readonly load: ResearchChainLoader;
  readonly verifyingRuleId: string;
  /** Builder rule ids (without the `builder:` prefix) of the active version. */
  readonly liveRuleIds: readonly string[];
  readonly counts?: (verification: PendingRuleVerification) => boolean;
}): BuilderPublicationPreview {
  const { included, withheld } = classifyBuilderRules(
    input.histories,
    input.verifications,
    input.load,
    {
      assumeVerified: input.verifyingRuleId,
      ...(input.counts === undefined ? {} : { counts: input.counts }),
    },
  );
  const next = new Set(included.map((i) => i.revision.ruleId));
  return deepFreeze({
    included: included.map((i) => ({ ruleId: i.revision.ruleId, revision: i.revision.revision })),
    withheld: withheld.map((w) => ({
      ruleId: w.revision.ruleId,
      revision: w.revision.revision,
      reason: w.reason,
    })),
    removedFromPublic: input.liveRuleIds.filter((id) => !next.has(id)).sort(),
  });
}

/** One applied ledger command of the automatic publication. */
export interface AutomaticGovernanceStep {
  readonly command: GovernanceCommandType;
  readonly decision: Extract<AuthorizationDecision, { allowed: true }>;
  readonly record: GovernanceRecord;
  /** The ledger before this step (its length is the step's expected sequence). */
  readonly before: GovernanceLedger;
  readonly after: GovernanceLedger;
}

export interface AutomaticGovernanceInput {
  /** The verifier: a principal returned by `establishPrincipal` (re-authorized per command). */
  readonly principal: unknown;
  /** Server facts for each command: a fresh decision id, the server time, the session record. */
  readonly nextContext: () => {
    readonly decisionId: unknown;
    readonly evaluatedAt: unknown;
    readonly session: unknown;
  };
  /** The sealed pack from `compileVerifiedBuilderPack`; its version has no ledger yet. */
  readonly pack: RulePack;
  /** The completed verification (it names this pack version). */
  readonly verification: RuleVerificationRecord;
  /** Earlier versions of the builder pack that are PUBLISHED, with their published content. */
  readonly previous: readonly { readonly ledger: GovernanceLedger; readonly pack: RulePack }[];
}

export interface AutomaticGovernanceResult {
  readonly ledger: GovernanceLedger;
  readonly steps: readonly AutomaticGovernanceStep[];
  readonly submittedPack: RulePack;
  readonly publishedPack: RulePack;
  readonly activation: RulePackActivation;
  /** One SUPERSEDED step per earlier published version. */
  readonly superseded: readonly AutomaticGovernanceStep[];
}

export interface AutomaticGovernanceFailure {
  readonly command: GovernanceCommandType;
  readonly outcome: Exclude<AuthorizedGovernanceOutcome, { readonly status: 'APPLIED' }>;
}

/** Runs the automatic ledger (see the module comment). Pure; fails at the first refusal. */
export function runAutomaticBuilderGovernance(
  input: AutomaticGovernanceInput,
): Result<AutomaticGovernanceResult, AutomaticGovernanceFailure> {
  const { pack, verification } = input;
  const evidence = { reference: `rule-verification:${verification.verificationId}` };
  const steps: AutomaticGovernanceStep[] = [];
  let ledger = createLedger(builderPackId(pack.metadata.marjaId), pack.metadata.version);
  let published: RulePack | null = null;
  let activation: RulePackActivation | null = null;

  const apply = (
    current: GovernanceLedger,
    command: GovernanceCommandRequest,
  ): Result<
    AutomaticGovernanceStep & { outcome: AuthorizedGovernanceOutcome },
    AutomaticGovernanceFailure
  > => {
    const outcome = executeGovernanceCommand({
      principal: input.principal,
      ledger: current,
      command,
      context: { ...input.nextContext(), policyRegistry: null, sourceVerification: verification },
    });
    if (outcome.status !== 'APPLIED') return err({ command: command.type, outcome });
    if (!outcome.decision.allowed) {
      return err({
        command: command.type,
        outcome: { status: 'DENIED', decision: outcome.decision },
      });
    }
    return ok({
      command: command.type,
      decision: outcome.decision,
      record: outcome.record,
      before: current,
      after: outcome.ledger,
      outcome,
    });
  };

  const sequence: (() => GovernanceCommandRequest | null)[] = [
    () => ({ type: 'SUBMIT', pack }),
    () => ({ type: 'START_REVIEW', pack }),
    () => ({ type: 'COMPLETE_REVIEW', pack, evidence }),
    () => ({ type: 'APPROVE', pack, evidence }),
    () => {
      const prepared = preparePackForPublication(pack, ledger);
      return prepared.ok ? { type: 'PUBLISH', pack: prepared.value } : null;
    },
    () => (published === null ? null : { type: 'ACTIVATE', pack: published }),
  ];
  for (const next of sequence) {
    const command = next();
    if (command === null) {
      return err({
        command: published === null ? 'PUBLISH' : 'ACTIVATE',
        outcome: {
          status: 'REFUSED',
          decision: steps.at(-1)?.decision ?? {
            allowed: false,
            decisionId: null,
            permission: null,
            reason: 'INVALID_REQUEST',
            evaluatedAt: null,
          },
          issues: [{ code: 'INVALID_TRANSITION', recordId: null }],
        },
      });
    }
    const applied = apply(ledger, command);
    if (!applied.ok) return applied;
    const { outcome, ...step } = applied.value;
    steps.push(step);
    ledger = step.after;
    if (outcome.status === 'APPLIED' && command.type === 'PUBLISH') published = outcome.pack;
    if (outcome.status === 'APPLIED' && command.type === 'ACTIVATE') {
      activation = outcome.activation;
    }
  }
  if (published === null || activation === null) {
    return err({
      command: 'ACTIVATE',
      outcome: {
        status: 'REFUSED',
        decision: steps[0]?.decision ?? {
          allowed: false,
          decisionId: null,
          permission: null,
          reason: 'INVALID_REQUEST',
          evaluatedAt: null,
        },
        issues: [{ code: 'INVALID_TRANSITION', recordId: null }],
      },
    });
  }

  const superseded: AutomaticGovernanceStep[] = [];
  for (const earlier of input.previous) {
    const applied = apply(earlier.ledger, {
      type: 'SUPERSEDE',
      pack: earlier.pack,
      successor: ledger,
    });
    if (!applied.ok) return applied;
    const { outcome: _outcome, ...step } = applied.value;
    superseded.push(step);
  }
  return ok(
    deepFreeze({
      ledger,
      steps,
      submittedPack: pack,
      publishedPack: published,
      activation,
      superseded,
    }),
  );
}
