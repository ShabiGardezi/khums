import { randomUUID } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import {
  builderPackId,
  builderPackRuleId,
  checkVerificationPreconditions,
  compileVerifiedBuilderPack,
  completeVerification,
  currentVerification,
  INITIAL_RESEARCH_MARJAS,
  nextBuilderVersion,
  previewBuilderPublication,
  recordRuleVerification,
  replayLedger,
  runAutomaticBuilderGovernance,
  validateBuilderRule,
  type AutomaticGovernanceStep,
  type BuilderSourceInfo,
  type GovernanceCommandType,
  type LivePackIssue,
  type PendingRuleVerification,
  type ResearchChainLoader,
} from '@khums/core';
import type {
  AuditDetailValue,
  AuditEventDraft,
  GovernanceLedger,
  ResearchEntityType,
  RulePack,
} from '@khums/shared-types';
import {
  API_ERROR_CODES,
  type BuilderPublication,
  type BuilderPublicationListResponse,
  type RuleVerificationRecord,
  type RuleVerificationResponse,
  type RuleVerificationStatusResponse,
  type RuleVerificationView,
  type ScholarRuleRevision,
  type VerifyScholarRuleRequest,
} from '@khums/validation';

import { CLOCK, type Clock } from '../auth/auth.tokens';
import { StaffAuthService } from '../auth/staff-auth.service';
import { problemForDenial, StaffAuthorizationService } from '../auth/staff-authorization.service';
import { ApiProblemException } from '../common/errors/api-problem.exception';
import type { GovernanceStores } from '../governance/governance-store';
import { Rollback } from '../persistence/unit-of-work';
import { LivePackResearch } from '../public/live-pack-research.service';
import { PublicPackCache } from '../public/public-pack-cache';
import {
  loadResearchProvenance,
  RESEARCH_STORE,
  type ResearchStore,
} from '../research/research-store';
import { RESEARCH_ID_SOURCE, type ResearchIdSource } from '../research/research-common';
import {
  RULE_BUILDER_STORE,
  type RuleBuilderStore,
  type RuleBuilderStores,
} from './rule-builder-store';
import { RuleBuilderService } from './rule-builder.service';

/**
 * Source verification, automatic approval and publication of builder rules (Phase 2 step 5;
 * docs/PHASE2_PLAN.md; REVIEW_PROCESS §17; decisions 63 and 67).
 *
 * Every decision is `@khums/core`'s: who may verify (`builder.rule.verify`: the Marja's own
 * scholars or a SUPER_ADMIN; never a system actor), the preconditions, the binding to the exact
 * revision, the compilation of ONLY source-verified rules into a new PRODUCTION builder pack
 * version, and the automatic governance ledger (each command re-authorized for the verifier under
 * `SOURCE_VERIFIED_AUTO_V1`). This service adds storage, atomicity, research loading, audit and
 * the HTTP mapping: the verification record, every ledger record, the pack content and every
 * audit event commit in ONE unit of work, or nothing does.
 */

const problem = (status: number, code: keyof typeof API_ERROR_CODES, detail: string) =>
  new ApiProblemException(status, API_ERROR_CODES[code], detail);
const unavailable = () =>
  problem(503, 'SERVICE_UNAVAILABLE', 'Source verification is currently unavailable.');
const notFound = () => problem(404, 'RULE_NOT_FOUND', 'No rule with this id is available to you.');
const conflict = () =>
  problem(409, 'RULE_CONFLICT', 'The rule changed meanwhile. Reload and try again.');
/** Codes are fixed identifiers (never content or submitted values). */
const refused = (codes: readonly string[]) =>
  problem(
    422,
    'RULE_VERIFICATION_REFUSED',
    `The verification was refused (${[...new Set(codes)].sort().join(', ')}).`,
  );
const alreadyVerified = () =>
  problem(
    422,
    'ALREADY_VERIFIED',
    'This revision is already source-verified; nothing was recorded or published.',
  );

/** A refusal decided inside the unit of work, audited after its rollback (audit BLD-09). */
class VerificationRefusal {
  constructor(
    readonly problem: ApiProblemException,
    readonly codes: readonly string[],
  ) {}
}

const UNBOUND = 'unbound-marja';

const AUDIT_TYPES: Readonly<Partial<Record<GovernanceCommandType, string>>> = {
  SUBMIT: 'governance.pack.submitted',
  START_REVIEW: 'governance.pack.reviewStarted',
  COMPLETE_REVIEW: 'governance.pack.reviewCompleted',
  APPROVE: 'governance.pack.approved',
  PUBLISH: 'governance.pack.published',
  ACTIVATE: 'governance.pack.activated',
  SUPERSEDE: 'governance.pack.superseded',
};

function verificationView(record: RuleVerificationRecord): RuleVerificationView {
  return {
    verificationId: record.verificationId,
    revision: record.revision,
    contentHash: record.contentHash,
    rulingRef: record.rulingRef,
    attestations: { ...record.attestations },
    notes: record.notes,
    actor: record.actor,
    at: record.at,
    reason: record.reason,
    publication: { ...record.publication },
  };
}

interface ActiveBuilderVersion {
  readonly version: string;
  readonly ledger: GovernanceLedger;
  readonly contentDigest: string;
  readonly activatedAt: string;
  readonly pack: RulePack;
}

interface BuilderVersions {
  readonly versions: readonly {
    readonly version: string;
    readonly ledger: GovernanceLedger;
    readonly state: string;
    readonly activated: boolean;
  }[];
  /** PUBLISHED versions with their published content (superseded by the next publication). */
  readonly published: readonly { readonly ledger: GovernanceLedger; readonly pack: RulePack }[];
  /** The ACTIVATED, still published version (at most one; the highest when several). */
  readonly active: ActiveBuilderVersion | null;
}

const versionKey = (v: string) => v.split('.').map((p) => Number.parseInt(p, 10) || 0);
const byVersion = (a: string, b: string) => {
  const [x, y] = [versionKey(a), versionKey(b)];
  for (let i = 0; i < 3; i += 1) {
    const d = (x[i] ?? 0) - (y[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
};

/**
 * The revision of `ruleId` the active builder version contains (null when it contains none): the
 * latest verification of the rule made for that version or an earlier one (a rule is included
 * only at its verified revision).
 */
function liveRevisionOf(
  ruleId: string,
  verifications: readonly RuleVerificationRecord[],
  active: ActiveBuilderVersion | null,
): number | null {
  if (active?.pack.rules.some((r) => r.id === builderPackRuleId(ruleId)) !== true) return null;
  return (
    verifications
      .filter((v) => v.ruleId === ruleId && byVersion(v.publication.version, active.version) <= 0)
      .at(-1)?.revision ?? null
  );
}

@Injectable()
export class RuleVerificationService {
  constructor(
    @Inject(RULE_BUILDER_STORE) private readonly store: RuleBuilderStore,
    @Inject(RESEARCH_STORE) private readonly research: ResearchStore,
    @Inject(RESEARCH_ID_SOURCE) private readonly ids: ResearchIdSource,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly authz: StaffAuthorizationService,
    private readonly rules: RuleBuilderService,
    @InjectPinoLogger(RuleVerificationService.name) private readonly logger: PinoLogger,
    private readonly staff: StaffAuthService,
    private readonly live: LivePackResearch,
    private readonly publicPacks: PublicPackCache,
  ) {}

  // ── Authorization helpers (decisions are core's) ─────────────────────────────────────────

  private decide(
    request: object,
    permission: 'builder.rule.read' | 'builder.rule.verify',
    marjaId: string,
  ) {
    return this.authz.decide(request, permission, { type: 'MARJA_RESEARCH', marjaId });
  }

  private requireAuthenticated(request: object): void {
    const decision = this.decide(request, 'builder.rule.read', UNBOUND);
    if (decision.allowed) return;
    if (decision.reason === 'MISSING_PERMISSION' || decision.reason === 'OUT_OF_SCOPE') return;
    throw problemForDenial(decision.reason);
  }

  private requireRead(request: object, marjaId: string): void {
    const decision = this.decide(request, 'builder.rule.read', marjaId);
    if (decision.allowed) return;
    if (decision.reason === 'MISSING_PERMISSION' || decision.reason === 'OUT_OF_SCOPE') {
      throw notFound();
    }
    throw problemForDenial(decision.reason);
  }

  private draft(
    request: object,
    type: string,
    target: { kind: string; id: string },
    marjaId: string,
    details: Record<string, AuditDetailValue>,
    requestId: string | null,
  ): AuditEventDraft {
    return {
      eventId: randomUUID(),
      type,
      actor: this.authz.contextFor(request).principal?.principalId ?? null,
      targets: [target],
      marjaIds: [marjaId],
      details,
      requestId,
      occurredAt: new Date(this.clock.now()).toISOString(),
    };
  }

  private async audited(s: RuleBuilderStores, draft: AuditEventDraft): Promise<void> {
    const recorded = await s.audit(draft);
    if (!recorded.ok) throw new Rollback(unavailable());
  }

  // ── Research loading ─────────────────────────────────────────────────────────────────────

  /**
   * Loads every research chain the revisions depend on: their rulings with the complete
   * provenance (findings, passages, translations, sources) and their cited sources/passages with
   * the passages' sources. Returned as a loader for core; throws 503 (as a Rollback inside a unit
   * of work) when the research store is unavailable.
   */
  private async loader(
    revisions: readonly ScholarRuleRevision[],
    insideUnitOfWork = true,
  ): Promise<ResearchChainLoader> {
    const starts: { types: readonly ResearchEntityType[]; id: string }[] = [];
    for (const r of revisions) {
      if (r.content.rulingId !== null) starts.push({ types: ['RULING'], id: r.content.rulingId });
      for (const id of r.content.sourceRefs) starts.push({ types: ['SOURCE', 'PASSAGE'], id });
    }
    const loaded = await loadResearchProvenance(this.research.stores, starts);
    if (!loaded.ok) {
      throw insideUnitOfWork ? new Rollback(unavailable()) : unavailable();
    }
    return (type, id) => {
      const chain = loaded.value.get(id);
      return chain?.entityType === type ? chain : null;
    };
  }

  /**
   * Which verifications still count: their verifier holds `builder.rule.verify` for the Marja
   * NOW (audit BLD-07). `alsoHolding` is the verifier being authorized in this request.
   */
  private async counting(
    marjaId: string,
    verifications: readonly PendingRuleVerification[],
    alsoHolding: string | null = null,
  ): Promise<((v: PendingRuleVerification) => boolean) | null> {
    const holders = await this.staff.principalsHolding(
      'builder.rule.verify',
      marjaId,
      verifications.map((v) => v.actor),
    );
    if (!holders.ok) return null;
    return (v) => v.actor === alsoHolding || holders.value.has(v.actor);
  }

  /** Resolved source information of every rule that cites resolvable sources. */
  private async sourcesOf(
    marjaId: string,
    revisions: readonly ScholarRuleRevision[],
  ): Promise<Record<string, BuilderSourceInfo>> {
    const sources: Record<string, BuilderSourceInfo> = {};
    for (const revision of revisions) {
      const check = validateBuilderRule(revision.content);
      if (check.errors.length > 0 || check.missing.length > 0) continue;
      const resolved = await this.rules.resolve(marjaId, {
        rulingId: null,
        sourceRefs: revision.content.sourceRefs,
      });
      if (resolved.ok) Object.assign(sources, resolved.value.sources);
    }
    return sources;
  }

  // ── Builder pack versions (governance store) ─────────────────────────────────────────────

  private async builderVersions(g: GovernanceStores, marjaId: string): Promise<BuilderVersions> {
    const packId = builderPackId(marjaId);
    const refs = await g.contents.versions(marjaId);
    if (!refs.ok) throw new Rollback(unavailable());
    const versions: BuilderVersions['versions'][number][] = [];
    const published: { ledger: GovernanceLedger; pack: RulePack }[] = [];
    let active: ActiveBuilderVersion | null = null;
    const seen = new Set<string>();
    for (const ref of refs.value) {
      if (ref.packId !== packId || seen.has(ref.version)) continue;
      seen.add(ref.version);
      const loaded = await g.ledgers.load(packId, ref.version);
      if (loaded.kind === 'UNAVAILABLE') throw new Rollback(unavailable());
      if (loaded.kind === 'NOT_FOUND') continue;
      const view = replayLedger(loaded.value);
      if (!view.ok) {
        this.logger.error(
          { event: 'builder.ledger.integrity.failure', packId, version: ref.version },
          'A builder pack ledger failed verification',
        );
        throw new Rollback(unavailable());
      }
      const { state, publication, activation } = view.value;
      versions.push({
        version: ref.version,
        ledger: loaded.value,
        state,
        activated: activation !== null,
      });
      if (state !== 'PUBLISHED' || publication === null) continue;
      const content = await g.contents.load(
        publication.recordId,
        'PUBLISHED',
        publication.integrity.digest,
      );
      if (content.kind === 'UNAVAILABLE') throw new Rollback(unavailable());
      if (content.kind !== 'FOUND') throw new Rollback(unavailable());
      published.push({ ledger: loaded.value, pack: content.value.pack });
      if (activation !== null && (active === null || byVersion(ref.version, active.version) > 0)) {
        active = {
          version: ref.version,
          ledger: loaded.value,
          contentDigest: publication.integrity.digest,
          activatedAt: activation.recordedAt.slice(0, 10),
          pack: content.value.pack,
        };
      }
    }
    versions.sort((a, b) => byVersion(a.version, b.version));
    return { versions, published, active };
  }

  // ── Reads ────────────────────────────────────────────────────────────────────────────────

  private statusOf(input: {
    readonly request: object;
    readonly history: readonly ScholarRuleRevision[];
    readonly all: readonly (readonly ScholarRuleRevision[])[];
    readonly verifications: readonly RuleVerificationRecord[];
    readonly load: ResearchChainLoader;
    readonly builder: BuilderVersions;
    readonly counts: (v: PendingRuleVerification) => boolean;
    readonly suspended: readonly LivePackIssue[];
  }): RuleVerificationStatusResponse {
    const { request, history, load, builder, counts } = input;
    const { active } = builder;
    const current = history.at(-1);
    if (current === undefined) throw unavailable();
    const own = input.verifications.filter((v) => v.ruleId === current.ruleId);
    const liveRevision = liveRevisionOf(current.ruleId, own, active);
    const currentVerified = currentVerification(current, own, load, counts) !== null;
    const blockers = checkVerificationPreconditions(current, load).map((b) => ({
      code: b.code,
      entityType: b.entityType,
      entityId: b.entityId,
      state: b.state,
    }));
    const suspendedRules = input.suspended.map((i) => ({
      ruleId: i.ruleId.replace(/^builder:/, ''),
      codes: [...i.codes],
    }));
    const liveRuleIds = (active?.pack.rules ?? []).map((r) => r.id.replace(/^builder:/, ''));
    const preview =
      blockers.length > 0 || currentVerified
        ? null
        : {
            nextVersion: nextBuilderVersion(builder.versions.map((v) => v.version)),
            ...previewBuilderPublication({
              histories: input.all,
              verifications: input.verifications,
              load,
              verifyingRuleId: current.ruleId,
              liveRuleIds,
              counts,
            }),
          };
    return {
      ruleId: current.ruleId,
      marjaId: current.marjaId,
      currentRevision: current.revision,
      currentVerified,
      canVerify: this.decide(request, 'builder.rule.verify', current.marjaId).allowed,
      blockers,
      history: own.map(verificationView),
      publicStatus:
        active !== null && liveRevision !== null
          ? {
              status: suspendedRules.length > 0 ? 'SUSPENDED' : 'LIVE',
              packId: builderPackId(current.marjaId),
              version: active.version,
              activatedAt: active.activatedAt,
              liveRevision,
              suspendedRules,
            }
          : {
              status: 'NOT_PUBLIC',
              packId: null,
              version: null,
              activatedAt: null,
              liveRevision: null,
              suspendedRules: [],
            },
      preview:
        preview === null
          ? null
          : {
              nextVersion: preview.nextVersion,
              included: [...preview.included],
              withheld: [...preview.withheld],
              removedFromPublic: [...preview.removedFromPublic],
            },
    };
  }

  /** The research re-check of the active builder version (BLD-01), or 503. */
  private async suspensionOf(
    active: ActiveBuilderVersion | null,
  ): Promise<readonly LivePackIssue[]> {
    if (active === null) return [];
    const issues = await this.live.check(active.pack, active.ledger);
    if (!issues.ok) throw unavailable();
    return issues.value;
  }

  /** The verification status of one rule (`builder.rule.read` in its Marja, otherwise 404). */
  async status(request: object, ruleId: string): Promise<RuleVerificationStatusResponse> {
    this.requireAuthenticated(request);
    const history = await this.store.stores.revisions.history(ruleId);
    if (history.kind === 'UNAVAILABLE') throw unavailable();
    if (history.kind === 'NOT_FOUND') throw notFound();
    const marjaId = history.value[0]?.marjaId ?? UNBOUND;
    this.requireRead(request, marjaId);
    const data = await this.store.atomically(async (s) => {
      const verifications = await s.verifications.ofMarja(marjaId);
      if (!verifications.ok) throw new Rollback(unavailable());
      const all = await s.revisions.ofMarja(marjaId);
      if (!all.ok) throw new Rollback(unavailable());
      const builder = await this.builderVersions(s.governance, marjaId);
      return { verifications: verifications.value, all: all.value, builder };
    });
    if (data instanceof ApiProblemException) throw data;
    const own = data.all.find((h) => h[0]?.ruleId === ruleId) ?? history.value;
    // Research and staff roles are read after the unit of work (separate stores; reads only).
    const load = await this.loader(
      data.all.flatMap((h) => h.slice(-1)),
      false,
    );
    const counts = await this.counting(marjaId, data.verifications);
    if (counts === null) throw unavailable();
    return this.statusOf({
      request,
      history: own,
      all: data.all,
      verifications: data.verifications,
      load,
      builder: data.builder,
      counts,
      suspended: await this.suspensionOf(data.builder.active),
    });
  }

  /** Each research Marja the caller may read, with its active builder pack version. */
  async publications(request: object): Promise<BuilderPublicationListResponse> {
    this.requireAuthenticated(request);
    const marjas: BuilderPublication[] = [];
    for (const marjaId of INITIAL_RESEARCH_MARJAS) {
      if (!this.decide(request, 'builder.rule.read', marjaId).allowed) continue;
      const result = await this.store.atomically((s) =>
        this.builderVersions(s.governance, marjaId),
      );
      if (result instanceof ApiProblemException) throw result;
      const { active, versions } = result;
      const suspended = await this.suspensionOf(active);
      marjas.push({
        marjaId,
        active:
          active === null
            ? null
            : {
                packId: builderPackId(marjaId),
                version: active.version,
                contentDigest: active.contentDigest,
                activatedAt: active.activatedAt,
                ruleIds: active.pack.rules.map((r) => r.id.replace(/^builder:/, '')).sort(),
                suspended: suspended.length > 0,
                suspendedRules: suspended.map((i) => ({
                  ruleId: i.ruleId.replace(/^builder:/, ''),
                  codes: [...i.codes],
                })),
              },
        versions: versions.map((v) => ({
          version: v.version,
          state: v.state,
          activated: v.activated,
        })),
      });
    }
    return { marjas };
  }

  // ── Command ──────────────────────────────────────────────────────────────────────────────

  /**
   * Records the source verification of the rule's current revision and, in the same unit of
   * work, publishes the Marja's source-verified rules as a new builder pack version through the
   * governance ledger (automatic approval, decision 63). Refusals change nothing.
   */
  async verify(
    request: object,
    ruleId: string,
    body: VerifyScholarRuleRequest,
    requestId: string | null,
  ): Promise<RuleVerificationResponse> {
    this.requireAuthenticated(request);
    const loaded = await this.store.stores.revisions.history(ruleId);
    if (loaded.kind === 'UNAVAILABLE') throw unavailable();
    if (loaded.kind === 'NOT_FOUND') throw notFound();
    const marjaId = loaded.value[0]?.marjaId ?? UNBOUND;
    this.requireRead(request, marjaId);
    const target = { kind: 'scholarRule', id: ruleId };
    const allowed = this.decide(request, 'builder.rule.verify', marjaId);
    if (!allowed.allowed) {
      const recorded = await this.store.atomically((s) =>
        s.audit(
          this.draft(
            request,
            'builder.action.denied',
            target,
            marjaId,
            {
              permission: 'builder.rule.verify',
              decisionId: allowed.decisionId,
              denyReason: allowed.reason,
            },
            requestId,
          ),
        ),
      );
      if (!recorded.ok) this.logger.warn({ code: recorded.error }, 'Denial not audited');
      throw problemForDenial(allowed.reason);
    }

    const refuse = (problem: ApiProblemException, codes: readonly string[]) =>
      new Rollback(new VerificationRefusal(problem, codes));
    const result = await this.store.atomically(
      async (s): Promise<RuleVerificationRecord | ApiProblemException | VerificationRefusal> => {
        const history = await s.revisions.history(ruleId);
        if (history.kind !== 'FOUND') throw new Rollback(unavailable());
        const all = await s.revisions.ofMarja(marjaId);
        if (!all.ok) throw new Rollback(unavailable());
        const stored = await s.verifications.ofMarja(marjaId);
        if (!stored.ok) throw new Rollback(unavailable());
        const latest = all.value.flatMap((h) => h.slice(-1));
        const load = await this.loader(latest);

        const { principal, ...context } = this.authz.contextFor(request);
        const principalId = this.authz.contextFor(request).principal?.principalId ?? null;
        // BLD-07: a verification counts only while its verifier still holds the permission.
        const counts = await this.counting(marjaId, stored.value, principalId);
        if (counts === null) throw new Rollback(unavailable());
        const builder = await this.builderVersions(s.governance, marjaId);
        const pending = recordRuleVerification({
          principal,
          context,
          history: history.value,
          expectedRevision: body.revision,
          attestations: body.attestations,
          notes: body.notes,
          reason: body.reason,
          verificationId: this.ids.next(),
          load,
          verifications: stored.value,
          counts,
          activeRevision: liveRevisionOf(ruleId, stored.value, builder.active),
        });
        if (!pending.ok) {
          switch (pending.error.code) {
            case 'DENIED':
              throw new Rollback(
                problemForDenial(
                  pending.error.decision.allowed
                    ? 'INVALID_REQUEST'
                    : pending.error.decision.reason,
                ),
              );
            case 'REVISION_CONFLICT':
              throw new Rollback(conflict());
            case 'ATTESTATIONS_INVALID':
            case 'RECORD_INVALID':
              throw refuse(refused([pending.error.code]), [pending.error.code]);
            case 'ALREADY_VERIFIED':
              throw refuse(alreadyVerified(), ['ALREADY_VERIFIED']);
            case 'PRECONDITIONS_FAILED': {
              const codes = pending.error.blockers.map((b) => b.code);
              throw refuse(refused(codes), codes);
            }
          }
        }

        const version = nextBuilderVersion(builder.versions.map((v) => v.version));
        const compiled = compileVerifiedBuilderPack({
          marjaId,
          version,
          histories: all.value,
          verifications: [...stored.value, pending.value],
          sources: await this.sourcesOf(marjaId, latest),
          load,
          counts,
        });
        if (!compiled.ok) throw refuse(refused([compiled.error.code]), [compiled.error.code]);
        const { pack } = compiled.value;
        const record = completeVerification(pending.value, {
          packId: pack.metadata.packId,
          version,
          contentDigest: pack.metadata.integrity?.digest ?? '',
        });
        if (!record.ok) throw refuse(refused([record.error.code]), [record.error.code]);

        const governed = runAutomaticBuilderGovernance({
          principal,
          nextContext: () => {
            const { principal: _principal, ...next } = this.authz.contextFor(request);
            return next;
          },
          pack,
          verification: record.value,
          previous: builder.published,
        });
        if (!governed.ok) {
          const { outcome } = governed.error;
          if (outcome.status === 'DENIED') {
            throw new Rollback(
              problemForDenial(
                outcome.decision.allowed ? 'INVALID_REQUEST' : outcome.decision.reason,
              ),
            );
          }
          const codes = [governed.error.command, ...outcome.issues.map((i) => i.code)];
          throw refuse(refused(codes), codes);
        }

        // ── Writes (one unit of work) ──
        const appended = await s.verifications.append(record.value);
        if (appended === 'CONFLICT') throw new Rollback(conflict());
        if (appended === 'UNAVAILABLE') throw new Rollback(unavailable());
        const g = s.governance;
        const writeStep = async (step: AutomaticGovernanceStep) => {
          const outcome = await g.ledgers.append(step.before.records.length, step.after);
          if (outcome === 'CONFLICT') throw new Rollback(conflict());
          if (outcome === 'UNAVAILABLE') throw new Rollback(unavailable());
          const contentKind =
            step.command === 'SUBMIT'
              ? 'SUBMITTED'
              : step.command === 'PUBLISH'
                ? 'PUBLISHED'
                : null;
          const digest = 'integrity' in step.record ? step.record.integrity.digest : null;
          if (contentKind !== null) {
            const content =
              contentKind === 'SUBMITTED'
                ? governed.value.submittedPack
                : governed.value.publishedPack;
            const storedContent = await g.contents.store({
              recordId: step.record.recordId,
              kind: contentKind,
              marjaId,
              digest: digest ?? '',
              pack: content,
              storedAt: step.record.recordedAt,
            });
            if (storedContent === 'CONFLICT') throw new Rollback(conflict());
            if (storedContent === 'UNAVAILABLE') throw new Rollback(unavailable());
          }
          const view = replayLedger(step.after);
          const details: Record<string, AuditDetailValue> = {
            command: step.command,
            recordId: step.record.recordId,
            recordDigest: step.record.recordDigest,
            contentDigest: digest,
            state: view.ok ? view.value.state : null,
            policy: view.ok ? view.value.policy : null,
            decisionId: step.decision.decisionId,
            // Decision 67: run automatically by the source verification below.
            automatic: true,
            sourceVerification: record.value.verificationId,
          };
          if (step.command === 'COMPLETE_REVIEW' || step.command === 'APPROVE') {
            details.evidenceReference = `rule-verification:${record.value.verificationId}`;
          }
          if (step.command === 'SUBMIT' || step.command === 'ACTIVATE') {
            details.rulingProvenance = (pack.rulingSnapshots ?? []).map(
              (r) => `${r.ref}:${r.state}:${r.contentRecordDigest}`,
            );
          }
          if (step.command === 'SUPERSEDE') details.successorVersion = version;
          await this.audited(s, {
            ...this.draft(
              request,
              AUDIT_TYPES[step.command] ?? 'governance.pack.automatic',
              { kind: 'rulePackVersion', id: `${step.after.packId}@${step.after.version}` },
              marjaId,
              details,
              requestId,
            ),
          });
        };
        for (const step of governed.value.steps) await writeStep(step);
        for (const step of governed.value.superseded) await writeStep(step);
        await this.audited(
          s,
          this.draft(
            request,
            'builder.rule.verified',
            target,
            marjaId,
            {
              verificationId: record.value.verificationId,
              revision: String(record.value.revision),
              contentHash: record.value.contentHash,
              rulingRef: record.value.rulingRef,
              attestations: Object.keys(record.value.attestations).sort(),
              reason: record.value.reason,
              decisionId: record.value.decisionId,
              packVersion: `${pack.metadata.packId}@${version}`,
              contentDigest: record.value.publication.contentDigest,
              includedRules: compiled.value.included.map(
                (i) => `${i.ruleId}@${String(i.revision)}`,
              ),
              withheldRules: compiled.value.withheld.map(
                (w) => `${w.ruleId}@${String(w.revision)}:${w.reason}`,
              ),
              superseded: governed.value.superseded.map((st) => st.after.version),
            },
            requestId,
          ),
        );
        return record.value;
      },
    );
    if (result instanceof ApiProblemException) throw result;
    if (result instanceof VerificationRefusal) {
      // BLD-09: refused attempts leave a trail (codes and ids only), outside the rolled-back work.
      const recorded = await this.store.atomically((s) =>
        s.audit(
          this.draft(
            request,
            'builder.rule.verification.refused',
            target,
            marjaId,
            {
              codes: [...new Set(result.codes)].sort(),
              revision: String(body.revision),
              decisionId: allowed.decisionId,
            },
            requestId,
          ),
        ),
      );
      if (!recorded.ok) this.logger.warn({ code: recorded.error }, 'Refusal not audited');
      throw result.problem;
    }
    // A new version is live: the public selection is recomputed on the next request (SEC-02).
    this.publicPacks.invalidate();
    return {
      verification: verificationView(result),
      status: await this.status(request, ruleId),
    };
  }
}
