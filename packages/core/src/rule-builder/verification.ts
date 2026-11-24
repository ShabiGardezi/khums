import { canonicalDigest } from '@khums/calculation-engine';
import type { AuthorizationDecision, ResearchEntityType, ResearchState } from '@khums/shared-types';
import { assertNever, err, ok, type Result } from '@khums/utils';
import {
  ruleVerificationAttestationsSchema,
  ruleVerificationNotesSchema,
  ruleVerificationRecordSchema,
  builderReasonSchema,
  type RuleVerificationRecord,
  type ScholarRuleRevision,
} from '@khums/validation';

import { authorize } from '../authorization/evaluate';
import { isTrustedPrincipal } from '../authorization/principal';
import { deepFreeze } from '../governance/ledger';
import { replayResearchChain } from '../research/chain';
import {
  rulingContentRecordDigest,
  rulingReferenceIssue,
  type ResearchChainLoader,
  type RulingReferenceIssueCode,
} from '../research/rule-pack-references';
import { validateBuilderRule } from './validate';

/**
 * Source verification of builder rules (Phase 2 step 5; REVIEW_PROCESS §17; decisions 63, 67).
 *
 * A verification is recorded for ONE builder rule revision by a principal holding
 * `builder.rule.verify` for the rule's Marja — the Marja's own SCHOLAR (or legacy
 * GOVERNING_SCHOLAR) or a SUPER_ADMIN — with four explicit attestations (sources authentic and
 * correctly cited, original text matches, translation accurate, attribution correct). It is never
 * recorded by AI, automated tests or a system actor: the principal must be a trusted, server-
 * established staff principal (`authorize` + `isTrustedPrincipal`).
 *
 * Preconditions fail closed with stable codes: the revision is complete and its developer-
 * requirement check is SUPPORTED; its ruling exists in the Marja, is current and is the version
 * the revision cites; every cited source and passage, and every passage, translation and source
 * the ruling (or its findings) cites, is VERIFIED (translations REVIEWED); and the ruling's
 * provenance and evidence pass the rule-pack reference rules.
 *
 * A verification binds the rule id, revision and content hash (and the ruling content it was made
 * against): a later revision or a changed ruling is unverified until verified again. Pure.
 */

export type VerificationBlockerCode =
  /** A scholar rejected the rule with this revision (Phase 4); revise it to replace it. */
  | 'RULE_REJECTED'
  /** The revision lacks required fields (ruling, sources, rate or entries). */
  | 'RULE_INCOMPLETE'
  /** The revision's content is inconsistent. */
  | 'RULE_INVALID'
  /** A field needs an engine capability that does not exist yet. */
  | 'DEVELOPER_IMPLEMENTATION_REQUIRED'
  /** The ruling is unknown or of another Marja. */
  | 'RULING_NOT_FOUND'
  /** The ruling was withdrawn, superseded or deleted. */
  | 'RULING_NOT_CURRENT'
  /** The ruling has another version now than the one the revision cites (revise the rule). */
  | 'RULING_VERSION_CHANGED'
  /** A cited source or passage is unknown or of another Marja. */
  | 'SOURCE_NOT_FOUND'
  /** A source in the evidence is not VERIFIED. */
  | 'SOURCE_NOT_VERIFIED'
  /** A passage in the evidence is not VERIFIED. */
  | 'PASSAGE_NOT_VERIFIED'
  /** A translation the ruling cites is not REVIEWED. */
  | 'TRANSLATION_NOT_REVIEWED'
  /** The ruling cites no finding or passage, or a cited record cannot be resolved. */
  | 'RULING_PROVENANCE_INCOMPLETE'
  /** A pinned passage or source revision of the ruling's evidence is not verified. */
  | 'RULING_EVIDENCE_UNVERIFIED'
  /** A finding the ruling cites was deleted, withdrawn or superseded (audit BLD-02). */
  | 'FINDING_NOT_CURRENT'
  /**
   * A finding the ruling cites is not VERIFIED or APPROVED (e.g. still a draft, or revised back to
   * a draft after verification). Coordinator decision 2026-11-24 (decision 69, fail-safe),
   * pending the owner's confirmation.
   */
  | 'FINDING_NOT_VERIFIED';

export interface VerificationBlocker {
  readonly code: VerificationBlockerCode;
  /** The research record concerned, if any (ids only; never content). */
  readonly entityType: ResearchEntityType | null;
  readonly entityId: string | null;
  /** Its current lifecycle state, if it exists. */
  readonly state: ResearchState | null;
}

const RETIRED: ReadonlySet<ResearchState> = new Set(['DELETED', 'WITHDRAWN', 'SUPERSEDED']);
/** Finding states that may back a source-verified rule (decision 69). */
const FINDING_USABLE: ReadonlySet<ResearchState> = new Set(['VERIFIED', 'APPROVED']);

/** SHA-256 (khums-jcs-1) of a revision's verified identity and content. */
export function ruleRevisionContentHash(revision: ScholarRuleRevision): string {
  const digest = canonicalDigest({
    ruleId: revision.ruleId,
    revision: revision.revision,
    marjaId: revision.marjaId,
    content: revision.content,
    rulingVersion: revision.rulingVersion,
  });
  // The schema-validated revision is plain JSON: canonicalization cannot fail.
  return digest.ok ? digest.value : '';
}

/** `<ruling id>@<version>` of a revision, or null without a ruling. */
export const rulingRefOf = (revision: ScholarRuleRevision): string | null =>
  revision.content.rulingId === null || revision.rulingVersion === null
    ? null
    : `${revision.content.rulingId}@${String(revision.rulingVersion)}`;

const blocker = (
  code: VerificationBlockerCode,
  entityType: ResearchEntityType | null = null,
  entityId: string | null = null,
  state: ResearchState | null = null,
): VerificationBlocker => ({ code, entityType, entityId, state });

interface Viewed {
  readonly state: ResearchState;
  readonly marjaId: string;
  readonly references: readonly {
    readonly entityType: ResearchEntityType;
    readonly entityId: string;
  }[];
}

function view(load: ResearchChainLoader, type: ResearchEntityType, id: string): Viewed | null {
  const chain = load(type, id);
  if (chain === null) return null;
  const replayed = replayResearchChain(chain);
  if (!replayed.ok || replayed.value.entityType !== type) return null;
  return {
    state: replayed.value.state,
    marjaId: replayed.value.marjaId,
    references: replayed.value.content.references,
  };
}

/** The research a rule (revision or published pack rule) rests on: ids only. */
export interface RuleResearchBasis {
  readonly marjaId: string;
  readonly rulingId: string | null;
  /** The ruling version the rule cites (null without a ruling). */
  readonly rulingVersion: number | null;
  /** The rule's own cited research sources and passages. */
  readonly sourceRefs: readonly string[];
}

/**
 * Everything in the RESEARCH a rule rests on that blocks (or, for a live pack, suspends) it now:
 * every cited source and passage, and every passage, translation and source the ruling (or its
 * findings) cites, is VERIFIED (translations REVIEWED); every finding the ruling cites is current
 * and VERIFIED or APPROVED (decision 69); the ruling exists in the Marja, is current and is the
 * cited version; and its provenance and pinned evidence pass the rule-pack reference rules under
 * the `SOURCE_VERIFIED` policy. Shared by verification (`checkVerificationPreconditions`) and the
 * public re-check of a live builder pack on every serve (`checkLiveBuilderPack`; audit BLD-01).
 */
export function checkRuleResearch(
  basis: RuleResearchBasis,
  load: ResearchChainLoader,
): readonly VerificationBlocker[] {
  const { marjaId } = basis;
  const blockers: VerificationBlocker[] = [];
  const seen = new Set<string>();
  /** A passage (VERIFIED) and its source (VERIFIED). */
  const passage = (id: string) => {
    if (seen.has(`PASSAGE:${id}`)) return;
    seen.add(`PASSAGE:${id}`);
    const found = view(load, 'PASSAGE', id);
    if (found?.marjaId !== marjaId) {
      blockers.push(blocker('SOURCE_NOT_FOUND', 'PASSAGE', id));
      return;
    }
    if (found.state !== 'VERIFIED') {
      blockers.push(blocker('PASSAGE_NOT_VERIFIED', 'PASSAGE', id, found.state));
    }
    for (const ref of found.references) if (ref.entityType === 'SOURCE') source(ref.entityId);
  };
  const source = (id: string) => {
    if (seen.has(`SOURCE:${id}`)) return;
    seen.add(`SOURCE:${id}`);
    const found = view(load, 'SOURCE', id);
    if (found?.marjaId !== marjaId) {
      blockers.push(blocker('SOURCE_NOT_FOUND', 'SOURCE', id));
      return;
    }
    if (found.state !== 'VERIFIED') {
      blockers.push(blocker('SOURCE_NOT_VERIFIED', 'SOURCE', id, found.state));
    }
  };
  const translation = (id: string) => {
    if (seen.has(`TRANSLATION:${id}`)) return;
    seen.add(`TRANSLATION:${id}`);
    const found = view(load, 'TRANSLATION', id);
    if (found?.marjaId !== marjaId) {
      blockers.push(blocker('SOURCE_NOT_FOUND', 'TRANSLATION', id));
      return;
    }
    if (found.state !== 'REVIEWED') {
      blockers.push(blocker('TRANSLATION_NOT_REVIEWED', 'TRANSLATION', id, found.state));
    }
    for (const ref of found.references) if (ref.entityType === 'PASSAGE') passage(ref.entityId);
  };
  const finding = (id: string) => {
    if (seen.has(`FINDING:${id}`)) return;
    seen.add(`FINDING:${id}`);
    const found = view(load, 'FINDING', id);
    if (found?.marjaId !== marjaId) {
      blockers.push(blocker('RULING_PROVENANCE_INCOMPLETE', 'FINDING', id));
      return;
    }
    if (RETIRED.has(found.state)) {
      blockers.push(blocker('FINDING_NOT_CURRENT', 'FINDING', id, found.state));
    } else if (!FINDING_USABLE.has(found.state)) {
      blockers.push(blocker('FINDING_NOT_VERIFIED', 'FINDING', id, found.state));
    }
    for (const cited of found.references) {
      if (cited.entityType === 'PASSAGE') passage(cited.entityId);
      else if (cited.entityType === 'TRANSLATION') translation(cited.entityId);
    }
  };

  // The rule's own cited sources and passages.
  for (const id of basis.sourceRefs) {
    if (load('SOURCE', id) !== null) source(id);
    else passage(id);
  }

  // The ruling and everything it (and its findings) cites.
  const { rulingId } = basis;
  if (rulingId !== null) {
    const chain = load('RULING', rulingId);
    const replayed = chain === null ? null : replayResearchChain(chain);
    const ruling = replayed?.ok === true ? replayed.value : null;
    if (ruling?.entityType !== 'RULING' || ruling.marjaId !== marjaId) {
      blockers.push(blocker('RULING_NOT_FOUND', 'RULING', rulingId));
    } else if (RETIRED.has(ruling.state)) {
      blockers.push(blocker('RULING_NOT_CURRENT', 'RULING', rulingId, ruling.state));
    } else if (ruling.rulingVersion !== basis.rulingVersion) {
      blockers.push(blocker('RULING_VERSION_CHANGED', 'RULING', rulingId, ruling.state));
    } else {
      for (const ref of ruling.content.references) {
        if (ref.entityType === 'PASSAGE') passage(ref.entityId);
        else if (ref.entityType === 'TRANSLATION') translation(ref.entityId);
        else if (ref.entityType === 'FINDING') finding(ref.entityId);
      }
      const ref =
        basis.rulingVersion === null ? null : `${rulingId}@${String(basis.rulingVersion)}`;
      // The pinned evidence and provenance rules shared with rule-pack snapshots (decision 67).
      const issue =
        ref === null ? null : rulingReferenceIssue(ref, marjaId, load, 'SOURCE_VERIFIED');
      if (issue !== null) {
        blockers.push(blocker(rulingBlockerCode(issue), 'RULING', rulingId, ruling.state));
      }
    }
  }
  return deepFreeze(blockers);
}

/**
 * The blocker code of a ruling reference issue (audit BLD-08: each issue keeps its own meaning
 * instead of being reported as RULING_NOT_FOUND).
 */
function rulingBlockerCode(issue: RulingReferenceIssueCode): VerificationBlockerCode {
  switch (issue) {
    case 'RULING_PROVENANCE_INCOMPLETE':
    case 'RULING_EVIDENCE_UNVERIFIED':
    case 'RULING_NOT_CURRENT':
      return issue;
    case 'RULING_REFERENCE_INVALID':
    case 'RULING_REFERENCE_UNRESOLVED':
    case 'RULING_REFERENCE_REQUIRED':
      return 'RULING_NOT_FOUND';
    case 'RULING_NOT_APPROVED':
      // Not reachable under SOURCE_VERIFIED (a draft is allowed); kept fail-closed.
      return 'RULING_NOT_CURRENT';
    case 'RULING_SNAPSHOT_MISMATCH':
    case 'RULING_SNAPSHOT_MISSING':
    case 'RULING_SNAPSHOT_STALE':
      return 'RULING_VERSION_CHANGED';
    default:
      return assertNever(issue);
  }
}

/**
 * Everything that blocks verifying `revision` now (empty: it may be verified): its own content
 * (complete, consistent, no Developer Implementation Required) and its research
 * (`checkRuleResearch`). `load` resolves research chains by type and id (the API loads the
 * ruling's provenance and the cited sources).
 */
export function checkVerificationPreconditions(
  revision: ScholarRuleRevision,
  load: ResearchChainLoader,
): readonly VerificationBlocker[] {
  const { marjaId, content } = revision;
  const blockers: VerificationBlocker[] = [];
  const check = validateBuilderRule(content);
  if (revision.rejected === true) blockers.push(blocker('RULE_REJECTED'));
  if (check.errors.length > 0) blockers.push(blocker('RULE_INVALID'));
  if (check.requirement.status !== 'SUPPORTED') {
    blockers.push(blocker('DEVELOPER_IMPLEMENTATION_REQUIRED'));
  }
  if (check.missing.length > 0) blockers.push(blocker('RULE_INCOMPLETE'));
  blockers.push(
    ...checkRuleResearch(
      {
        marjaId,
        rulingId: content.rulingId,
        rulingVersion: revision.rulingVersion,
        sourceRefs: content.sourceRefs,
      },
      load,
    ),
  );
  return deepFreeze(blockers);
}

export interface RecordVerificationInput {
  /** A principal returned by `establishPrincipal` (never a system or AI actor). */
  readonly principal: unknown;
  readonly context: {
    readonly decisionId: unknown;
    readonly evaluatedAt: unknown;
    readonly session: unknown;
  };
  /** Every revision of the rule, oldest first (replayed by the caller's store). */
  readonly history: readonly ScholarRuleRevision[];
  /** The revision number the verifier saw (must be the current one). */
  readonly expectedRevision: unknown;
  readonly attestations: unknown;
  readonly notes: unknown;
  readonly reason: unknown;
  /** A fresh id for the record (UUIDv7, from the server). */
  readonly verificationId: string;
  readonly load: ResearchChainLoader;
  /** Every stored verification of the rule (to refuse a repeat: audit SEC-03). */
  readonly verifications?: readonly PendingRuleVerification[];
  /**
   * Whether a stored verification still counts (its verifier still holds `builder.rule.verify`
   * for the Marja; audit BLD-07). A verification that no longer counts does not make the
   * revision verified, so it may be verified again. Default: every verification counts.
   */
  readonly counts?: (verification: PendingRuleVerification) => boolean;
  /**
   * The revision of this rule in the ACTIVE (public) builder version, or null when no active
   * version contains it (e.g. after a withdrawal). A repeat verification is refused only while
   * the verified revision is the live one; republishing a verified revision that is not live
   * stays possible. Default (undefined): treated as live, so every repeat is refused.
   */
  readonly activeRevision?: number | null;
}

/** A verification before its builder pack version is compiled (see `completeVerification`). */
export type PendingRuleVerification = Omit<RuleVerificationRecord, 'publication'>;

export type RecordVerificationRefusal =
  | { readonly code: 'DENIED'; readonly decision: AuthorizationDecision }
  /** The rule changed since the verifier read it. */
  | { readonly code: 'REVISION_CONFLICT' }
  /** An attestation is missing or not `true`, or the notes or reason are invalid. */
  | { readonly code: 'ATTESTATIONS_INVALID' }
  | { readonly code: 'PRECONDITIONS_FAILED'; readonly blockers: readonly VerificationBlocker[] }
  /**
   * The current revision already has a counting verification against the same ruling content
   * and is the live revision: a repeat would only publish another identical version (SEC-03).
   */
  | { readonly code: 'ALREADY_VERIFIED'; readonly verificationId: string }
  | { readonly code: 'RECORD_INVALID' };

/** Authorizes `builder.rule.verify` on the Marja for a trusted staff principal. */
export function authorizeVerification(
  principal: unknown,
  marjaId: string,
  context: RecordVerificationInput['context'],
): AuthorizationDecision {
  return authorize({
    principal,
    permission: 'builder.rule.verify',
    resource: { type: 'MARJA_RESEARCH', marjaId },
    context: {
      decisionId: context.decisionId,
      evaluatedAt: context.evaluatedAt,
      session: context.session,
      governance: null,
    },
  });
}

/**
 * Records one source verification of the CURRENT revision of a rule (see the module comment).
 * Returns the pending record (completed with the pack version it produces by
 * `completeVerification`); nothing is persisted here.
 */
export function recordRuleVerification(
  input: RecordVerificationInput,
): Result<PendingRuleVerification, RecordVerificationRefusal> {
  const current = input.history.at(-1);
  if (current === undefined) return err({ code: 'RECORD_INVALID' });
  const decision = authorizeVerification(input.principal, current.marjaId, input.context);
  if (!decision.allowed || !isTrustedPrincipal(input.principal)) {
    return err(deepFreeze({ code: 'DENIED', decision }));
  }
  if (input.expectedRevision !== current.revision) return err({ code: 'REVISION_CONFLICT' });
  const attestations = ruleVerificationAttestationsSchema.safeParse(input.attestations);
  const notes = ruleVerificationNotesSchema.safeParse(input.notes);
  const reason = builderReasonSchema.safeParse(input.reason);
  if (!attestations.success || !notes.success || !reason.success) {
    return err({ code: 'ATTESTATIONS_INVALID' });
  }
  const existing = currentVerification(
    current,
    input.verifications ?? [],
    input.load,
    input.counts,
  );
  const live = input.activeRevision === undefined || input.activeRevision === current.revision;
  if (existing !== null && live) {
    return err({ code: 'ALREADY_VERIFIED', verificationId: existing.verificationId });
  }
  const blockers = checkVerificationPreconditions(current, input.load);
  if (blockers.length > 0) return err(deepFreeze({ code: 'PRECONDITIONS_FAILED', blockers }));
  const rulingRef = rulingRefOf(current);
  const rulingChain =
    current.content.rulingId === null ? null : input.load('RULING', current.content.rulingId);
  const rulingContentDigest = rulingChain === null ? null : rulingContentRecordDigest(rulingChain);
  const record = ruleVerificationRecordSchema.omit({ publication: true }).safeParse({
    verificationId: input.verificationId,
    ruleId: current.ruleId,
    revision: current.revision,
    marjaId: current.marjaId,
    contentHash: ruleRevisionContentHash(current),
    rulingRef,
    rulingContentDigest,
    attestations: attestations.data,
    notes: notes.data,
    actor: input.principal.principalId,
    at: decision.evaluatedAt,
    reason: reason.data,
    decisionId: decision.decisionId,
  });
  return record.success ? ok(deepFreeze(record.data)) : err({ code: 'RECORD_INVALID' });
}

/** The stored record: the pending verification plus the builder pack version it produced. */
export function completeVerification(
  pending: PendingRuleVerification,
  publication: RuleVerificationRecord['publication'],
): Result<RuleVerificationRecord, { readonly code: 'RECORD_INVALID' }> {
  const record = ruleVerificationRecordSchema.safeParse({ ...pending, publication });
  return record.success ? ok(deepFreeze(record.data)) : err({ code: 'RECORD_INVALID' });
}

/**
 * The verification that covers a rule's CURRENT revision, or null: the latest record with the same
 * rule id, revision and content hash, made against the ruling content the ruling still has, among
 * the records that still count (`counts`: the verifier still holds `builder.rule.verify` for the
 * Marja; audit BLD-07).
 */
export function currentVerification<V extends PendingRuleVerification>(
  current: ScholarRuleRevision,
  verifications: readonly V[],
  load: ResearchChainLoader | null = null,
  counts: (verification: V) => boolean = () => true,
): V | null {
  const hash = ruleRevisionContentHash(current);
  const matching = verifications.filter(
    (v) =>
      v.ruleId === current.ruleId &&
      v.marjaId === current.marjaId &&
      v.revision === current.revision &&
      v.contentHash === hash &&
      v.rulingRef === rulingRefOf(current) &&
      counts(v),
  );
  const latest = matching.at(-1) ?? null;
  if (latest === null || load === null || current.content.rulingId === null) return latest;
  const chain = load('RULING', current.content.rulingId);
  return chain !== null && rulingContentRecordDigest(chain) === latest.rulingContentDigest
    ? latest
    : null;
}
