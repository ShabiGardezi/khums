import { randomUUID } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import {
  buildRulingSnapshots,
  checkRulingSnapshots,
  createLedger,
  rulingIdsOf,
  withRulingSnapshots,
  type ResearchChainLoader,
  verifyAuditChain,
  executeGovernanceCommand,
  GOVERNANCE_COMMAND_PERMISSIONS,
  preparePackForPublication,
  replayLedger,
  type AuthorizedGovernanceOutcome,
  type GovernanceCommandType,
  type GovernanceIssue,
  type GovernanceView,
} from '@khums/core';
import type {
  AuditDetailValue,
  AuditEventDraft,
  AuthorizationDecision,
  GovernanceLedger,
  GovernanceRecord,
  RulePack,
  WithdrawalReason,
} from '@khums/shared-types';
import {
  API_ERROR_CODES,
  auditEventSchema,
  rulePackSchema,
  type AuditEventListResponse,
  type GovernancePackVersion,
  type GovernancePackVersionSummary,
  type GovernanceRecordSummary,
} from '@khums/validation';

import { readAuditChain } from '../audit/audit-event.store';
import { CLOCK, type Clock } from '../auth/auth.tokens';
import { problemForDenial, StaffAuthorizationService } from '../auth/staff-authorization.service';
import { ApiProblemException } from '../common/errors/api-problem.exception';
import { Rollback } from '../persistence/unit-of-work';
import {
  loadRulingProvenance,
  RESEARCH_STORE,
  type ResearchStore,
} from '../research/research-store';
import { PublicPackCache } from '../public/public-pack-cache';
import { GOVERNANCE_STORE, type GovernanceStore, type GovernanceStores } from './governance-store';
import { StaffNamesService } from '../auth/staff-names.service';
import type { PackContentKind, PackContentLookup } from './pack-content.store';

/**
 * The governance API's use cases (M4.6.4a; docs/AUTH_ARCHITECTURE.md §5, ARCHITECTURE D1–D3).
 *
 * Every state change goes through `@khums/core` `executeGovernanceCommand`, which authorizes the
 * command's permission for the principal on the pack version (Marja scope, separation of duties,
 * the version's bound policy) and then applies the domain's lifecycle, integrity and publication
 * rules. This service adds only what core cannot know:
 *
 * - **Identity from the session.** The principal is the one the staff guard established; the
 *   ledger actor is that principal (`STAFF_PRINCIPAL`), never a request value.
 * - **Content from storage (D2).** Only SUBMIT carries content; every later command loads the
 *   content the ledger bound and re-verifies its digest, so replacement content is impossible.
 * - **Marja binding.** Every version of a pack id belongs to the Marja of its first stored
 *   content; a submission naming another Marja is refused (the ledger itself records no Marja).
 * - **Optimistic concurrency.** `expectedSequence` must equal the stored ledger length.
 * - **Atomicity.** The ledger record, its content and its audit event are written in one unit of
 *   work (one MongoDB transaction): all or nothing. Refusals and denials write nothing but a
 *   separate audit event.
 *
 * Out-of-scope reads answer 404 (nothing reveals that a pack version exists). Nothing here makes a
 * pack available to calculations: activation only appends a ledger record, and production use
 * stays behind the governed readiness gate.
 */

const problem = (status: number, code: keyof typeof API_ERROR_CODES, detail: string) =>
  new ApiProblemException(status, API_ERROR_CODES[code], detail);
const unavailable = () =>
  problem(503, 'SERVICE_UNAVAILABLE', 'Governance is currently unavailable.');
const notFound = () =>
  problem(404, 'PACK_VERSION_NOT_FOUND', 'No pack version with this id is available to you.');
/**
 * Placeholder scope for a pack id with no stored content: authorization still runs (so 401s stay
 * 401s), and the answer is always 404 because nothing exists to read.
 */
const UNBOUND_MARJA = 'unbound-pack';
const conflict = () =>
  problem(409, 'GOVERNANCE_CONFLICT', 'The ledger changed meanwhile. Reload and try again.');

/** Issue codes that mean the content itself is not acceptable (rather than the transition). */
const CONTENT_ISSUES = new Set(['PACK_MALFORMED', 'NOT_ELIGIBLE']);
const refused = (issues: readonly GovernanceIssue[]) => {
  const codes = [...new Set(issues.map((i) => i.code))].sort();
  const status = codes.some((c) => CONTENT_ISSUES.has(c)) ? 422 : 409;
  // Issue codes are fixed identifiers from @khums/core (never content or submitted values).
  return problem(status, 'GOVERNANCE_REFUSED', `The command was refused (${codes.join(', ')}).`);
};

export type GovernanceCommandInput =
  /** `pack` is untrusted JSON: validated with the strict rule-pack schema before anything else. */
  | { readonly type: 'SUBMIT'; readonly expectedSequence: number; readonly pack: unknown }
  | {
      readonly type: 'START_REVIEW' | 'PUBLISH' | 'ACTIVATE';
      readonly expectedSequence: number;
    }
  | {
      readonly type: 'REQUEST_CHANGES' | 'COMPLETE_REVIEW' | 'APPROVE';
      readonly expectedSequence: number;
      readonly evidence: { readonly reference: string };
    }
  | {
      readonly type: 'WITHDRAW';
      readonly expectedSequence: number;
      readonly reason: WithdrawalReason;
    }
  | {
      readonly type: 'SUPERSEDE';
      readonly expectedSequence: number;
      readonly successorVersion: string;
    }
  /** M5.2.1: administrative emergency withdrawal of a PUBLISHED version (reason required). */
  | {
      readonly type: 'EMERGENCY_WITHDRAW';
      readonly expectedSequence: number;
      readonly reason: WithdrawalReason;
      readonly note: string;
    }
  /** M5.2.1: binds a legacy version to its Marja's current registry policy (never a client value). */
  | { readonly type: 'BIND_POLICY'; readonly expectedSequence: number; readonly reason: string };

const AUDIT_TYPES: Readonly<Record<GovernanceCommandType, string>> = {
  SUBMIT: 'governance.pack.submitted',
  START_REVIEW: 'governance.pack.reviewStarted',
  REQUEST_CHANGES: 'governance.pack.changesRequested',
  COMPLETE_REVIEW: 'governance.pack.reviewCompleted',
  APPROVE: 'governance.pack.approved',
  PUBLISH: 'governance.pack.published',
  ACTIVATE: 'governance.pack.activated',
  WITHDRAW: 'governance.pack.withdrawn',
  SUPERSEDE: 'governance.pack.superseded',
  EMERGENCY_WITHDRAW: 'governance.pack.emergencyWithdrawn',
  BIND_POLICY: 'governance.pack.policyBound',
};

/** The content digest a record binds, if any. */
const contentDigestOf = (record: GovernanceRecord): string | null =>
  'integrity' in record ? record.integrity.digest : null;

function recordSummary(record: GovernanceRecord): GovernanceRecordSummary {
  return {
    sequence: record.sequence,
    recordId: record.recordId,
    type: record.type,
    recordedAt: record.recordedAt,
    actor: { kind: record.actor.kind, subject: record.actor.subject },
    recordDigest: record.recordDigest,
    previousRecordDigest: record.previousRecordDigest,
    contentDigest: contentDigestOf(record),
    evidenceReference: 'evidence' in record ? record.evidence.reference : null,
    withdrawalReason: record.type === 'WITHDRAWN' ? record.reason : null,
    boundPolicy: record.type === 'POLICY_BOUND' ? record.governancePolicy : null,
  };
}

function summaryOf(
  ledger: GovernanceLedger,
  view: GovernanceView,
  marjaId: string,
): GovernancePackVersionSummary {
  const bound =
    view.publication ??
    view.approval ??
    view.reviewCompleted ??
    view.reviewStart ??
    view.submission;
  return {
    packId: ledger.packId,
    version: ledger.version,
    marjaId,
    state: view.state,
    policy: view.policy,
    policySource: view.policySource,
    activated: view.activation !== null,
    contentDigest: bound?.integrity.digest ?? null,
    expectedSequence: ledger.records.length,
    lastRecordedAt: view.lastRecordedAt,
  };
}

/** A verified view of a ledger (core replays every record), or an integrity failure. */
function verifiedView(ledger: GovernanceLedger): GovernanceView | null {
  const replayed = replayLedger(ledger);
  return replayed.ok ? replayed.value : null;
}

@Injectable()
export class GovernanceService {
  constructor(
    @Inject(GOVERNANCE_STORE) private readonly store: GovernanceStore,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly authz: StaffAuthorizationService,
    @InjectPinoLogger(GovernanceService.name) private readonly logger: PinoLogger,
    /** Ruling versions, to resolve rule-pack `rulingRefs` (M5.3.6, D13). */
    @Inject(RESEARCH_STORE) private readonly research: ResearchStore,
    private readonly publicPacks: PublicPackCache,
    private readonly staffNames: StaffNamesService,
  ) {}

  /**
   * The research records a pack's ruling references depend on (M5.3.6, D13), for core to check.
   * Read from the research store (its own unit of work); activation re-checks at the point of use,
   * so a ruling withdrawn or superseded after submission can never be activated.
   */
  private async provenanceOf(pack: RulePack): Promise<ResearchChainLoader> {
    const loaded = await loadRulingProvenance(this.research.stores, rulingIdsOf(pack));
    if (!loaded.ok) throw new Rollback(unavailable());
    return (type, id) => {
      const chain = loaded.value.get(id);
      return chain?.entityType === type ? chain : null;
    };
  }

  /** Logs an integrity incident by code and ids only (never content). */
  private integrityFailure(packId: string, version: string, code: string): ApiProblemException {
    this.logger.error(
      { event: 'governance.integrity.failure', packId, version, code },
      'Governance data failed verification',
    );
    return unavailable();
  }

  /**
   * Read access to one pack version (`governance.ledger.read` in the bound Marja's scope).
   * Authentication problems keep their 401/403; a missing permission or scope is a 404.
   */
  private requireRead(request: object, packId: string, version: string, marjaId: string): void {
    const decision = this.authz.decide(request, 'governance.ledger.read', {
      type: 'RULE_PACK_VERSION',
      packId,
      version,
      marjaId,
      contentDigest: null,
    });
    if (decision.allowed) return;
    if (decision.reason === 'MISSING_PERMISSION' || decision.reason === 'OUT_OF_SCOPE') {
      throw notFound();
    }
    throw problemForDenial(decision.reason);
  }

  /**
   * One page of the audit log (`audit.log.read`), with the verification result of the whole chain
   * as read. Events hold opaque ids and codes only (no content, no personal data, no amounts).
   */
  async auditEvents(
    request: object,
    afterSequence = -1,
    limit = 50,
  ): Promise<AuditEventListResponse> {
    this.authz.require(request, 'audit.log.read', { type: 'AUDIT_LOG' });
    const raw = await readAuditChain(this.store.audit);
    if (!raw.ok) throw unavailable();
    const chainVerified = verifyAuditChain(raw.value).ok;
    const events = [];
    for (const doc of raw.value) {
      const parsed = auditEventSchema.safeParse(doc);
      if (!parsed.success) {
        this.logger.error({ event: 'audit.integrity.failure' }, 'Audit event failed validation');
        throw unavailable();
      }
      if (parsed.data.sequence > afterSequence) events.push(parsed.data);
    }
    const page = events.slice(0, limit);
    const last = page.at(-1);
    // Decision 79: people are shown by username, never by internal id.
    const names = await this.staffNames.names();
    return {
      events: page.map((e) => ({
        ...e,
        actorName: e.actor === null ? null : (names.get(e.actor) ?? null),
        targets: e.targets.map((t) => ({ kind: t.kind, id: t.id })),
        marjaIds: [...e.marjaIds],
        details: Object.fromEntries(
          Object.entries(e.details).map(([k, v]) => [
            k,
            typeof v === 'object' && v !== null ? v.slice() : v,
          ]),
        ),
      })),
      chainVerified,
      nextAfterSequence: events.length > limit && last !== undefined ? last.sequence : null,
    };
  }

  /**
   * Refuses requests whose principal cannot be trusted at all (401s, inactive accounts), before
   * anything is read. Missing permissions are decided per pack version afterwards.
   */
  private requireAuthenticated(request: object): void {
    const decision = this.authz.decide(request, 'governance.ledger.read', {
      type: 'RULE_PACK_VERSION',
      packId: UNBOUND_MARJA,
      version: '0.0.0',
      marjaId: UNBOUND_MARJA,
      contentDigest: null,
    });
    if (
      !decision.allowed &&
      decision.reason !== 'MISSING_PERMISSION' &&
      decision.reason !== 'OUT_OF_SCOPE'
    ) {
      throw problemForDenial(decision.reason);
    }
  }

  /** Pack versions the caller may read, optionally for one Marja. */
  async list(request: object, marjaId?: string): Promise<GovernancePackVersionSummary[]> {
    this.requireAuthenticated(request);
    const { stores } = this.store;
    const versions = await stores.contents.versions(marjaId);
    if (!versions.ok) throw unavailable();
    const result: GovernancePackVersionSummary[] = [];
    for (const ref of versions.value) {
      const decision = this.authz.decide(request, 'governance.ledger.read', {
        type: 'RULE_PACK_VERSION',
        packId: ref.packId,
        version: ref.version,
        marjaId: ref.marjaId,
        contentDigest: null,
      });
      if (!decision.allowed) {
        if (decision.reason === 'MISSING_PERMISSION' || decision.reason === 'OUT_OF_SCOPE')
          continue;
        throw problemForDenial(decision.reason);
      }
      const loaded = await stores.ledgers.load(ref.packId, ref.version);
      // Content without a ledger record is left over from an in-memory failure; not listed.
      if (loaded.kind === 'NOT_FOUND') continue;
      if (loaded.kind !== 'FOUND') throw unavailable();
      const view = verifiedView(loaded.value);
      if (view === null) throw this.integrityFailure(ref.packId, ref.version, 'LEDGER_INVALID');
      result.push(summaryOf(loaded.value, view, ref.marjaId));
    }
    return result;
  }

  /** One pack version with its verified ledger records. */
  async get(request: object, packId: string, version: string): Promise<GovernancePackVersion> {
    const { stores } = this.store;
    const marja = await stores.contents.marjaOfPack(packId);
    if (!marja.ok) {
      throw marja.error === 'UNAVAILABLE'
        ? unavailable()
        : this.integrityFailure(packId, version, 'CONTENT_INVALID');
    }
    if (marja.value === null) {
      // Same answer as out of scope, after authentication is checked.
      this.requireRead(request, packId, version, UNBOUND_MARJA);
      throw notFound();
    }
    this.requireRead(request, packId, version, marja.value);
    const loaded = await stores.ledgers.load(packId, version);
    if (loaded.kind === 'NOT_FOUND') throw notFound();
    if (loaded.kind !== 'FOUND') throw unavailable();
    const view = verifiedView(loaded.value);
    if (view === null) throw this.integrityFailure(packId, version, 'LEDGER_INVALID');
    return {
      ...summaryOf(loaded.value, view, marja.value),
      records: loaded.value.records.map(recordSummary),
    };
  }

  /**
   * Runs one governance command for the authenticated principal. Throws a problem on any refusal;
   * returns the pack version after the command was applied and committed with its audit event.
   */
  async execute(
    request: object,
    packId: string,
    version: string,
    input: GovernanceCommandInput,
    requestId: string | null,
  ): Promise<GovernancePackVersion> {
    const result = await this.store.atomically(
      async (s): Promise<GovernancePackVersion | CommandRefusal | ApiProblemException> =>
        this.run(s, request, packId, version, input, requestId),
    );
    if (result instanceof ApiProblemException) throw result;
    if (result instanceof CommandRefusal) {
      // Recorded separately: the command's own unit of work wrote nothing.
      await this.recordRefusal(request, packId, version, input.type, result, requestId);
      throw result.problem;
    }
    // Publication, activation, withdrawal…: the public selection is recomputed (SEC-02).
    this.publicPacks.invalidate();
    return result;
  }

  private async run(
    s: GovernanceStores,
    request: object,
    packId: string,
    version: string,
    input: GovernanceCommandInput,
    requestId: string | null,
  ): Promise<GovernancePackVersion> {
    // Every read and write below is sequential: one transaction session, no concurrent operations.
    const loaded = await s.ledgers.load(packId, version);
    if (loaded.kind === 'UNAVAILABLE') throw new Rollback(unavailable());

    const boundMarja = await s.contents.marjaOfPack(packId);
    if (!boundMarja.ok) {
      throw new Rollback(
        boundMarja.error === 'UNAVAILABLE'
          ? unavailable()
          : this.integrityFailure(packId, version, 'CONTENT_INVALID'),
      );
    }

    let ledger: GovernanceLedger;
    if (loaded.kind === 'FOUND') {
      ledger = loaded.value;
    } else if (input.type === 'SUBMIT') {
      ledger = createLedger(packId, version);
    } else {
      // Not found, or not visible: the same answer either way (after authentication).
      this.requireRead(request, packId, version, boundMarja.value ?? UNBOUND_MARJA);
      throw new Rollback(notFound());
    }

    // Every command except a submission acts on an existing version: the caller must at least be
    // able to read it, so state-dependent answers (conflicts, refusals) reveal nothing to others.
    if (input.type !== 'SUBMIT') {
      if (boundMarja.value === null) {
        throw new Rollback(this.integrityFailure(packId, version, 'CONTENT_MISSING'));
      }
      this.requireRead(request, packId, version, boundMarja.value);
    }

    if (ledger.records.length !== input.expectedSequence) throw new Rollback(conflict());
    const view = verifiedView(ledger);
    if (view === null) {
      throw new Rollback(this.integrityFailure(packId, version, 'LEDGER_INVALID'));
    }

    let command = await this.commandFor(s, ledger, view, input);
    // M5.3.6 (D13): a submission's rulings must be currently APPROVED versions of the pack's Marja;
    // their snapshots (ruling → findings → passages → sources) become part of the stored content.
    // Issues are refused only after core has authorized the command (nothing is revealed first).
    let rulingIssues: readonly string[] = [];
    if (command.type === 'SUBMIT') {
      const built = buildRulingSnapshots(
        command.pack,
        await this.provenanceOf(command.pack),
        'PRODUCTION',
      );
      const attached =
        built.issues.length === 0 ? withRulingSnapshots(command.pack, built.snapshots) : null;
      if (attached === null) rulingIssues = built.issues.map((i) => i.code);
      else if (!attached.ok) rulingIssues = [attached.code];
      else command = { type: 'SUBMIT', pack: attached.pack };
    }
    const policyRegistry =
      input.type === 'SUBMIT' || input.type === 'BIND_POLICY' ? await s.policies.load() : null;
    if (policyRegistry !== null && policyRegistry.kind !== 'FOUND') {
      throw new Rollback(unavailable());
    }

    const { principal, ...context } = this.authz.contextFor(request);
    const outcome = executeGovernanceCommand({
      principal,
      ledger,
      command,
      context: { ...context, policyRegistry: policyRegistry?.value ?? null },
    });
    if (outcome.status === 'DENIED') {
      const reason = outcome.decision.allowed ? 'UNVERIFIED_PRINCIPAL' : outcome.decision.reason;
      throw new Rollback(new CommandRefusal(problemForDenial(reason), outcome));
    }
    if (outcome.status === 'REFUSED') {
      throw new Rollback(new CommandRefusal(refused(outcome.issues), outcome));
    }

    // The content's Marja (core derived the authorization scope from it) must be the pack's.
    const marjaId = command.pack.metadata.marjaId;
    if (boundMarja.value !== null && boundMarja.value !== marjaId) {
      throw new Rollback(
        new CommandRefusal(
          problem(409, 'PACK_MARJA_MISMATCH', 'This pack id belongs to another Marja.'),
          outcome,
        ),
      );
    }

    // Activation: every rule cites a currently APPROVED ruling, unchanged since its snapshot.
    if (input.type === 'ACTIVATE') {
      rulingIssues = checkRulingSnapshots(
        command.pack,
        await this.provenanceOf(command.pack),
        'PRODUCTION',
        { requireEveryRule: true },
      ).map((i) => i.code);
    }
    if (rulingIssues.length > 0) {
      const codes = [...new Set(rulingIssues)].sort();
      throw new Rollback(
        new CommandRefusal(
          problem(422, 'GOVERNANCE_REFUSED', `The command was refused (${codes.join(', ')}).`),
          outcome,
        ),
      );
    }
    // `<rulingId>@<version>:<state at snapshot>:<content record digest>` per in-pack snapshot.
    const rulingProvenance =
      input.type === 'SUBMIT' || input.type === 'ACTIVATE'
        ? (command.pack.rulingSnapshots ?? []).map(
            (r) => `${r.ref}:${r.state}:${r.contentRecordDigest}`,
          )
        : null;

    await this.write(
      s,
      input,
      outcome,
      marjaId,
      command.pack,
      request,
      requestId,
      rulingProvenance,
    );
    const after = verifiedView(outcome.ledger);
    if (after === null)
      throw new Rollback(this.integrityFailure(packId, version, 'LEDGER_INVALID'));
    return {
      ...summaryOf(outcome.ledger, after, marjaId),
      records: outcome.ledger.records.map(recordSummary),
    };
  }

  /**
   * Loads the verified content bound by `record`, or rolls back. When the ledger has no such record
   * yet (for example ACTIVATE before publication), the bound submission is used instead, so that
   * core still authorizes first (on the real Marja) and then refuses the transition: callers who may
   * not act learn nothing about the state.
   */
  private async content(
    s: GovernanceStores,
    ledger: GovernanceLedger,
    view: GovernanceView,
    record: { readonly recordId: string; readonly integrity: { readonly digest: string } } | null,
    kind: PackContentKind,
  ): Promise<RulePack> {
    const [target, targetKind] =
      record === null ? [view.submission, 'SUBMITTED' as const] : [record, kind];
    if (target === null) {
      throw new Rollback(
        this.integrityFailure(ledger.packId, ledger.version, 'SUBMISSION_MISSING'),
      );
    }
    const found: PackContentLookup = await s.contents.load(
      target.recordId,
      targetKind,
      target.integrity.digest,
    );
    switch (found.kind) {
      case 'FOUND':
        return found.value.pack;
      case 'UNAVAILABLE':
        throw new Rollback(unavailable());
      case 'NOT_FOUND':
      case 'INTEGRITY_FAILURE':
        throw new Rollback(
          this.integrityFailure(ledger.packId, ledger.version, `CONTENT_${found.kind}`),
        );
    }
  }

  /** The core command, with content and successor ledgers from storage (never the client). */
  private async commandFor(
    s: GovernanceStores,
    ledger: GovernanceLedger,
    view: GovernanceView,
    input: GovernanceCommandInput,
  ) {
    switch (input.type) {
      case 'SUBMIT': {
        const parsed = rulePackSchema.safeParse(input.pack);
        if (!parsed.success) {
          throw new Rollback(refused([{ code: 'PACK_MALFORMED', recordId: null }]));
        }
        if (parsed.data.metadata.isMock) {
          throw new Rollback(
            problem(422, 'MOCK_PACK_REFUSED', 'Mock packs are never governed or stored.'),
          );
        }
        return { type: 'SUBMIT' as const, pack: parsed.data };
      }
      case 'START_REVIEW':
        return {
          type: input.type,
          pack: await this.content(s, ledger, view, view.submission, 'SUBMITTED'),
        };
      case 'REQUEST_CHANGES':
      case 'COMPLETE_REVIEW':
      case 'APPROVE':
        return {
          type: input.type,
          pack: await this.content(s, ledger, view, view.submission, 'SUBMITTED'),
          evidence: { reference: input.evidence.reference },
        };
      case 'PUBLISH': {
        const submitted = await this.content(s, ledger, view, view.submission, 'SUBMITTED');
        // The approvals come from the verified ledger only (core re-checks them on publish). Before
        // approval there are none: core then authorizes first and refuses the transition.
        const prepared = preparePackForPublication(submitted, ledger);
        return { type: input.type, pack: prepared.ok ? prepared.value : submitted };
      }
      case 'ACTIVATE':
        return {
          type: input.type,
          pack: await this.content(s, ledger, view, view.publication, 'PUBLISHED'),
        };
      case 'WITHDRAW':
        return {
          type: input.type,
          pack: await this.content(s, ledger, view, view.submission, 'SUBMITTED'),
          reason: input.reason,
        };
      case 'EMERGENCY_WITHDRAW':
        return {
          type: input.type,
          // Before publication the submission is loaded: core authorizes, then refuses.
          pack: await this.content(s, ledger, view, view.publication, 'PUBLISHED'),
          reason: input.reason,
          note: input.note,
        };
      case 'BIND_POLICY':
        return {
          type: input.type,
          pack: await this.content(s, ledger, view, view.submission, 'SUBMITTED'),
        };
      case 'SUPERSEDE': {
        const pack = await this.content(s, ledger, view, view.publication, 'PUBLISHED');
        const successor = await s.ledgers.load(ledger.packId, input.successorVersion);
        if (successor.kind === 'UNAVAILABLE') throw new Rollback(unavailable());
        // A missing successor is an empty ledger: core authorizes first, then refuses it.
        const successorLedger =
          successor.kind === 'FOUND'
            ? successor.value
            : createLedger(ledger.packId, input.successorVersion);
        return { type: input.type, pack, successor: successorLedger };
      }
    }
  }

  /** Writes the record, its content and its audit event; any failure rolls everything back. */
  private async write(
    s: GovernanceStores,
    input: GovernanceCommandInput,
    outcome: Extract<AuthorizedGovernanceOutcome, { status: 'APPLIED' }>,
    marjaId: string,
    commandPack: RulePack,
    request: object,
    requestId: string | null,
    rulingProvenance: readonly string[] | null,
  ): Promise<void> {
    const appended = await s.ledgers.append(input.expectedSequence, outcome.ledger);
    if (appended === 'CONFLICT') throw new Rollback(conflict());
    if (appended === 'UNAVAILABLE') throw new Rollback(unavailable());

    const contentDigest = contentDigestOf(outcome.record);
    const storedAt = outcome.record.recordedAt;
    if (input.type === 'SUBMIT' || input.type === 'PUBLISH') {
      const pack = input.type === 'PUBLISH' ? outcome.pack : commandPack;
      if (pack === null || contentDigest === null) throw new Rollback(unavailable());
      const stored = await s.contents.store({
        recordId: outcome.record.recordId,
        kind: input.type === 'PUBLISH' ? 'PUBLISHED' : 'SUBMITTED',
        marjaId,
        digest: contentDigest,
        pack,
        storedAt,
      });
      if (stored === 'CONFLICT') throw new Rollback(conflict());
      if (stored === 'UNAVAILABLE') throw new Rollback(unavailable());
    }

    const view = verifiedView(outcome.ledger);
    const details: Record<string, AuditDetailValue> = {
      command: input.type,
      recordId: outcome.record.recordId,
      recordDigest: outcome.record.recordDigest,
      contentDigest,
      state: view?.state ?? null,
      policy: view?.policy ?? null,
      decisionId: outcome.decision.decisionId,
    };
    if ('evidence' in input) details.evidenceReference = input.evidence.reference;
    // `<ruleId>:<rulingId>@<version>:<approved record digest>` per resolved ruling reference.
    if (rulingProvenance !== null) details.rulingProvenance = rulingProvenance;
    if (input.type === 'WITHDRAW') details.withdrawalReason = input.reason;
    if (input.type === 'SUPERSEDE') details.successorVersion = input.successorVersion;
    if (input.type === 'EMERGENCY_WITHDRAW') {
      details.withdrawalReason = input.reason;
      details.emergency = true;
      details.emergencyNote = input.note;
    }
    if (input.type === 'BIND_POLICY') {
      details.bindingReason = input.reason;
      details.boundPolicy =
        outcome.record.type === 'POLICY_BOUND' ? outcome.record.governancePolicy : null;
    }
    const audited = await s.audit(
      this.auditDraft(
        request,
        AUDIT_TYPES[input.type],
        outcome.ledger,
        marjaId,
        details,
        requestId,
      ),
    );
    if (!audited.ok) throw new Rollback(unavailable());
  }

  private auditDraft(
    request: object,
    type: string,
    target: { readonly packId: string; readonly version: string },
    marjaId: string | null,
    details: Record<string, AuditDetailValue>,
    requestId: string | null,
  ): AuditEventDraft {
    return {
      eventId: randomUUID(),
      type,
      actor: this.authz.contextFor(request).principal?.principalId ?? null,
      targets: [{ kind: 'rulePackVersion', id: `${target.packId}@${target.version}` }],
      marjaIds: marjaId === null ? [] : [marjaId],
      details,
      requestId,
      occurredAt: new Date(this.clock.now()).toISOString(),
    };
  }

  /**
   * Audits a denied or refused command in its own unit of work (the command wrote nothing). The
   * event names the command, the permission, the decision and the issue codes; never content.
   */
  private async recordRefusal(
    request: object,
    packId: string,
    version: string,
    type: GovernanceCommandType,
    refusal: CommandRefusal,
    requestId: string | null,
  ): Promise<void> {
    const { outcome } = refusal;
    const decision: AuthorizationDecision = outcome.decision;
    const draft = this.auditDraft(
      request,
      outcome.status === 'DENIED' ? 'governance.command.denied' : 'governance.command.refused',
      { packId, version },
      null,
      {
        command: type,
        permission: GOVERNANCE_COMMAND_PERMISSIONS[type],
        decisionId: decision.decisionId,
        denyReason: decision.allowed ? null : decision.reason,
        issues:
          outcome.status === 'REFUSED' ? outcome.issues.map((i) => i.code) : [refusal.problem.code],
      },
      requestId,
    );
    const recorded = await this.store.atomically((s) => s.audit(draft));
    if (!recorded.ok) {
      this.logger.warn({ code: recorded.error }, 'Governance refusal not audited');
    }
  }
}

/** A denial or refusal decided by core (or the Marja binding), audited outside the rollback. */
class CommandRefusal {
  constructor(
    readonly problem: ApiProblemException,
    readonly outcome: Exclude<AuthorizedGovernanceOutcome, { status: 'APPLIED' }> | AppliedOutcome,
  ) {}
}

type AppliedOutcome = Extract<AuthorizedGovernanceOutcome, { status: 'APPLIED' }>;
