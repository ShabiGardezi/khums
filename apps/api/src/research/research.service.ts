import { randomUUID } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import {
  executeEvidenceCommand,
  INITIAL_RESEARCH_MARJAS,
  replayResearchChain,
  replayRulingSeries,
  researchAiProvenance,
  type EvidenceCommandOutcome,
  type ResearchView,
  type RulingSeriesInput,
} from '@khums/core';
import type {
  AuditEventDraft,
  GovernancePermission,
  ResearchChain,
  ResearchEntityType,
  ResearchReference,
  ResearchRevisionRecord,
} from '@khums/shared-types';
import type {
  CreateResearchRecordRequest,
  CreateRulingVersionRequest,
  RulingVersionsResponse,
  ResearchListItem,
  ResearchMarjasResponse,
  ResearchMetadataItem,
  ResearchRecordResponse,
  ResearchRecordSummary,
  ResearchRecordType,
  ResearchRevisionResponse,
  ReviseResearchRecordRequest,
  ResearchTransitionRequest,
} from '@khums/validation';

import { CLOCK, type Clock } from '../auth/auth.tokens';
import { problemForDenial, StaffAuthorizationService } from '../auth/staff-authorization.service';
import { ApiProblemException } from '../common/errors/api-problem.exception';
import { pageOf, type Page } from '../common/paging';
import { Rollback } from '../persistence/unit-of-work';
import { PublicPackCache } from '../public/public-pack-cache';
import {
  CREATE_ATTEMPTS,
  problem,
  RESEARCH_ID_SOURCE,
  researchConflict,
  researchNotFound,
  researchRefused,
  researchUnavailable,
  type ResearchIdSource,
} from './research-common';
import {
  RESEARCH_STORE,
  type ResearchAnchors,
  type ResearchChainStore,
  type ResearchStore,
  type ResearchStores,
} from './research-store';

/**
 * Scholar research use cases: the evidence layer (M5.3.3: sources, passages, translations),
 * findings and first-version rulings (M5.3.4).
 * Every decision is `@khums/core`'s (`executeEvidenceCommand`: authorization on `MARJA_RESEARCH`,
 * lifecycle, revision chain, AI provenance and correction rules, exact reference checks, entity
 * payloads); this service adds storage, atomicity, audit and the HTTP mapping:
 *
 * - Identity, time, actor and ids are the server's; the Marja of an existing record comes from its
 *   stored chain, never from the request.
 * - Records you may not read (unknown, or outside your Marjas) answer 404; nothing reveals them.
 * - Every new revision and its audit event commit in one unit of work (MongoDB transaction). A
 *   stale `expectedRevision` is refused by core; a concurrent writer of the same revision loses on
 *   the unique `{entityId, revision}` index (the unit of work retries, re-reads and then refuses).
 * - Refusals and denials change nothing and are audited separately.
 * - Research content is never logged or audited (ids, kinds and codes only).
 */

/** Research chains loaded at once by a list (each is still verified on its own). */
const VIEW_LOAD_CONCURRENCY = 25;

const ENTITY_TYPE: Readonly<Record<ResearchRecordType, ResearchEntityType>> = {
  sources: 'SOURCE',
  passages: 'PASSAGE',
  translations: 'TRANSLATION',
  findings: 'FINDING',
  rulings: 'RULING',
};

export type ResearchTransitionAction =
  'verify' | 'review' | 'dispute' | 'supersede' | 'delete-draft' | 'approve' | 'withdraw';

const KIND_OF: Readonly<
  Record<
    ResearchTransitionAction,
    'VERIFIED' | 'REVIEWED' | 'DISPUTED' | 'SUPERSEDED' | 'DRAFT_DELETED' | 'APPROVED' | 'WITHDRAWN'
  >
> = {
  verify: 'VERIFIED',
  review: 'REVIEWED',
  dispute: 'DISPUTED',
  supersede: 'SUPERSEDED',
  'delete-draft': 'DRAFT_DELETED',
  approve: 'APPROVED',
  withdraw: 'WITHDRAWN',
};

const RESEARCH_PERMISSIONS: readonly GovernancePermission[] = [
  'research.read',
  'research.audit.read',
  'research.source.record',
  'research.source.verify',
  'research.translation.edit',
  'research.translation.review',
  'research.finding.edit',
  'research.finding.verify',
  'research.finding.approve',
  'research.ruling.edit',
  'research.ruling.approve',
  'research.ruling.withdraw',
];

/** A refusal decided inside a unit of work (which then wrote nothing), audited afterwards. */
/** `pageOf` needs the items in cursor-key order (several records may share a timestamp). */
function sortedBy<T>(items: readonly T[], keyOf: (item: T) => string): T[] {
  return [...items].sort((a, b) => (keyOf(a) < keyOf(b) ? -1 : keyOf(a) > keyOf(b) ? 1 : 0));
}

class ResearchRefusal {
  constructor(
    readonly problem: ApiProblemException,
    readonly action: string,
    readonly outcome: Exclude<EvidenceCommandOutcome, { status: 'APPLIED' }>,
    /** The Marja of the stored record (or of a creation), for the audit event; null if unknown. */
    readonly marjaId: string | null,
  ) {}
}

/** Revision-0 collision: draw a new id and try again. */
class IdCollision extends Error {
  constructor() {
    super('research id collision');
  }
}

const summaryOf = (r: ResearchRevisionRecord): ResearchRecordSummary => ({
  revision: r.revision,
  recordId: r.recordId,
  kind: r.kind,
  actor: { kind: r.actor.kind, subject: r.actor.subject },
  recordedAt: r.recordedAt,
  reason: r.reason,
  payloadDigest: r.payloadDigest,
  recordDigest: r.recordDigest,
});

const contentOf = (r: ResearchRevisionRecord) => ({
  revision: r.revision,
  payload: r.payload ?? {},
  payloadDigest: r.payloadDigest ?? '',
  references: [...r.references],
  aiInvolvement: [...r.aiInvolvement],
});

/** The immutable index copies of a passage or translation (from its latest content). */
function anchorsOf(view: ResearchView): ResearchAnchors {
  const reference = view.content.references[0];
  switch (view.entityType) {
    case 'PASSAGE':
      return reference === undefined ? {} : { sourceId: reference.entityId };
    case 'TRANSLATION': {
      const language = (view.content.payload as { language?: unknown } | null)?.language;
      return reference === undefined || typeof language !== 'string'
        ? {}
        : { passageId: reference.entityId, language };
    }
    case 'FINDING':
      return view.question === null ? {} : { questionId: view.question.id };
    case 'RULING':
      return view.rulingVersion === null || view.rulingSeriesId === null
        ? {}
        : { rulingVersion: view.rulingVersion, rulingSeriesId: view.rulingSeriesId };
    case 'SOURCE':
      return {};
  }
}

/** A short, non-sensitive label for lists (never the excerpt or translation text). */
function labelOf(view: ResearchView): string {
  const payload = (view.content.payload ?? {}) as Record<string, unknown>;
  switch (view.entityType) {
    case 'SOURCE': {
      const title = (payload.title as { original?: unknown } | undefined)?.original;
      return typeof title === 'string' ? title.slice(0, 200) : view.displayRef;
    }
    case 'PASSAGE': {
      const l = (payload.locator ?? {}) as Record<string, unknown>;
      const parts = [
        typeof l.volume === 'number' ? `vol. ${String(l.volume)}` : null,
        typeof l.page === 'string' ? `p. ${l.page}` : null,
        typeof l.masalah === 'string' ? `masalah ${l.masalah}` : null,
        typeof l.istiftaId === 'string' ? `istifta ${l.istiftaId}` : null,
      ].filter((part): part is string => part !== null);
      return parts.length > 0 ? parts.join(', ') : view.displayRef;
    }
    case 'TRANSLATION':
      return typeof payload.language === 'string' ? payload.language : view.displayRef;
    case 'FINDING':
    case 'RULING':
      return view.displayRef;
  }
}

@Injectable()
export class ResearchService {
  constructor(
    @Inject(RESEARCH_STORE) private readonly store: ResearchStore,
    @Inject(RESEARCH_ID_SOURCE) private readonly ids: ResearchIdSource,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly authz: StaffAuthorizationService,
    @InjectPinoLogger(ResearchService.name) private readonly logger: PinoLogger,
    private readonly publicPacks: PublicPackCache,
  ) {}

  // ── Helpers ────────────────────────────────────────────────────────────────────────────

  private chains(s: ResearchStores, type: ResearchEntityType): ResearchChainStore {
    switch (type) {
      case 'SOURCE':
        return s.sources;
      case 'PASSAGE':
        return s.passages;
      case 'TRANSLATION':
        return s.translations;
      case 'FINDING':
        return s.findings;
      case 'RULING':
        return s.rulings;
    }
  }

  private integrityFailure(entityId: string, code: string): ApiProblemException {
    this.logger.error(
      { event: 'research.integrity.failure', entityId, code },
      'Research data failed verification',
    );
    return researchUnavailable();
  }

  private allowed(request: object, permission: GovernancePermission, marjaId: string): boolean {
    return this.authz.decide(request, permission, { type: 'MARJA_RESEARCH', marjaId }).allowed;
  }

  /** Untrusted principals (401s, inactive accounts) are refused before anything is read. */
  private requireAuthenticated(request: object): void {
    const decision = this.authz.decide(request, 'research.read', {
      type: 'MARJA_RESEARCH',
      marjaId: 'unbound-marja',
    });
    if (decision.allowed) return;
    if (decision.reason === 'MISSING_PERMISSION' || decision.reason === 'OUT_OF_SCOPE') return;
    throw problemForDenial(decision.reason);
  }

  /** Content access to an existing record: `research.read` in its Marja, otherwise 404. */
  private requireContentAccess(request: object, marjaId: string): void {
    const decision = this.authz.decide(request, 'research.read', {
      type: 'MARJA_RESEARCH',
      marjaId,
    });
    if (decision.allowed) return;
    if (decision.reason === 'MISSING_PERMISSION' || decision.reason === 'OUT_OF_SCOPE') {
      throw researchNotFound();
    }
    throw problemForDenial(decision.reason);
  }

  /** Any research access to a record's Marja (content or audit history), otherwise 404. */
  private requireAnyAccess(request: object, marjaId: string): void {
    if (this.allowed(request, 'research.audit.read', marjaId)) return;
    this.requireContentAccess(request, marjaId);
  }

  /** Loads and verifies a chain; unknown, unreadable or wrong-type records are 404. */
  private async loadVerified(
    s: ResearchStores,
    type: ResearchEntityType,
    entityId: string,
  ): Promise<{ chain: ResearchChain; view: ResearchView } | null> {
    const store = this.chains(s, type);
    const loaded = await store.load(entityId);
    if (loaded.kind === 'UNAVAILABLE') throw researchUnavailable();
    if (loaded.kind === 'NOT_FOUND') return null;
    const view = replayResearchChain(loaded.value);
    if (!view.ok) throw this.integrityFailure(entityId, 'CHAIN_INVALID');
    return { chain: loaded.value, view: view.value };
  }

  /** Every chain a set of references points at (the resolver core needs is synchronous). */
  private async preload(
    s: ResearchStores,
    references: readonly ResearchReference[],
  ): Promise<Map<string, ResearchChain>> {
    const chains = new Map<string, ResearchChain>();
    for (const reference of references) {
      const store = this.chains(s, reference.entityType);
      if (chains.has(reference.entityId)) continue;
      const loaded = await store.load(reference.entityId);
      if (loaded.kind === 'UNAVAILABLE') throw new Rollback(researchUnavailable());
      if (loaded.kind === 'FOUND') chains.set(reference.entityId, loaded.value);
    }
    return chains;
  }

  private draft(
    request: object,
    type: string,
    entityId: string,
    marjaId: string | null,
    details: AuditEventDraft['details'],
    requestId: string | null,
  ): AuditEventDraft {
    return {
      eventId: randomUUID(),
      type,
      actor: this.authz.contextFor(request).principal?.principalId ?? null,
      targets: [{ kind: 'researchRecord', id: entityId }],
      marjaIds: marjaId === null ? [] : [marjaId],
      details,
      requestId,
      occurredAt: new Date(this.clock.now()).toISOString(),
    };
  }

  private refusalProblem(
    outcome: Exclude<EvidenceCommandOutcome, { status: 'APPLIED' }>,
  ): ApiProblemException {
    if (outcome.status === 'DENIED') {
      return problemForDenial(
        outcome.decision.allowed ? 'UNVERIFIED_PRINCIPAL' : outcome.decision.reason,
      );
    }
    if (outcome.issues.includes('REVISION_CONFLICT')) return researchConflict();
    if (outcome.issues.includes('RESEARCH_CHAIN_INVALID')) return researchUnavailable();
    return researchRefused(outcome.issues);
  }

  /** Runs a unit of work; refusals are audited outside it (the unit of work wrote nothing). */
  private async run<T>(
    request: object,
    entityId: () => string,
    requestId: string | null,
    work: (s: ResearchStores) => Promise<T>,
  ): Promise<T> {
    const result = await this.store.atomically(
      async (s): Promise<T | ApiProblemException | ResearchRefusal | IdCollision> => work(s),
    );
    if (result instanceof ApiProblemException) throw result;
    if (result instanceof IdCollision) throw result;
    if (result instanceof ResearchRefusal) {
      const { outcome } = result;
      const draft = this.draft(
        request,
        outcome.status === 'DENIED' ? 'research.action.denied' : 'research.action.refused',
        entityId(),
        result.marjaId,
        {
          action: result.action,
          decisionId: outcome.decision.decisionId ?? null,
          denyReason:
            outcome.status === 'DENIED' && !outcome.decision.allowed
              ? outcome.decision.reason
              : null,
          issues: outcome.status === 'REFUSED' ? [...outcome.issues] : [],
        },
        requestId,
      );
      const recorded = await this.store.atomically((s) => s.audit(draft));
      if (!recorded.ok) this.logger.warn({ code: recorded.error }, 'Refusal not audited');
      throw result.problem;
    }
    // A research change may suspend a live builder pack (BLD-01): no stale public selection.
    this.publicPacks.invalidate();
    return result;
  }

  /**
   * Applies one command inside the unit of work: core decides, then the revision and its audit
   * event are stored together. `existing` is null for a creation.
   */
  private async apply(
    s: ResearchStores,
    request: object,
    entityType: ResearchEntityType,
    existing: { chain: ResearchChain; view: ResearchView } | null,
    command: Record<string, unknown>,
    action: string,
    references: readonly ResearchReference[],
    requestId: string,
    rulingSeries?: RulingSeriesInput,
  ): Promise<ResearchRecordResponse> {
    const store = this.chains(s, entityType);
    const preloaded = await this.preload(s, references);
    const { principal, ...context } = this.authz.contextFor(request);
    const marjaId =
      existing?.view.marjaId ?? (typeof command.marjaId === 'string' ? command.marjaId : null);
    const outcome = executeEvidenceCommand({
      principal,
      chain: existing?.chain ?? null,
      command,
      context: { ...context, requestId },
      // Only chains of the record's own Marja resolve: a record in another Marja answers exactly
      // like an unknown id (REFERENCE_NOT_FOUND), so refusals never reveal that it exists.
      resolve: (reference) => {
        const chain = preloaded.get(reference.entityId);
        return chain !== undefined && chain.records[0]?.marjaId === marjaId ? chain : null;
      },
      ...(rulingSeries === undefined ? {} : { rulingSeries }),
    });
    if (outcome.status !== 'APPLIED') {
      throw new Rollback(
        new ResearchRefusal(this.refusalProblem(outcome), action, outcome, marjaId),
      );
    }
    const next = replayResearchChain(outcome.chain);
    if (!next.ok) throw new Rollback(researchUnavailable());
    const expectedLength = existing?.chain.records.length ?? 0;
    const stored = await store.append(expectedLength, outcome.chain, anchorsOf(next.value));
    if (stored === 'COLLISION') throw new Rollback(new IdCollision());
    if (stored === 'CONFLICT') throw new Rollback(researchConflict());
    if (stored === 'UNAVAILABLE') throw new Rollback(researchUnavailable());
    const { record } = outcome;
    const recorded = await s.audit(
      this.draft(
        request,
        'research.record.appended',
        record.entityId,
        record.marjaId,
        {
          entityType: record.entityType,
          kind: record.kind,
          revision: String(record.revision),
          displayRef: record.displayRef,
          decisionId: outcome.decision.decisionId,
        },
        requestId,
      ),
    );
    if (!recorded.ok) throw new Rollback(researchUnavailable());
    // Approving a ruling version supersedes the previously current version in the same unit of work.
    if (outcome.superseded) {
      const previous = outcome.superseded;
      const previousView = replayResearchChain(previous.chain);
      if (!previousView.ok) throw new Rollback(researchUnavailable());
      const appended = await store.append(
        previous.chain.records.length - 1,
        previous.chain,
        anchorsOf(previousView.value),
      );
      if (appended === 'UNAVAILABLE') throw new Rollback(researchUnavailable());
      if (appended !== 'APPLIED') throw new Rollback(researchConflict());
      const audited = await s.audit(
        this.draft(
          request,
          'research.record.appended',
          previous.record.entityId,
          previous.record.marjaId,
          {
            entityType: previous.record.entityType,
            kind: previous.record.kind,
            revision: String(previous.record.revision),
            displayRef: previous.record.displayRef,
            decisionId: outcome.decision.decisionId,
          },
          requestId,
        ),
      );
      if (!audited.ok) throw new Rollback(researchUnavailable());
    }
    return this.response(outcome.chain, next.value);
  }

  /** Every stored version chain of a ruling's series (inside a unit of work). */
  private async seriesOf(s: ResearchStores, view: ResearchView): Promise<readonly ResearchChain[]> {
    const versions = await s.rulings.seriesVersions(view.rulingSeriesId ?? view.entityId);
    if (!versions.ok) throw new Rollback(researchUnavailable());
    return versions.value;
  }

  private response(chain: ResearchChain, view: ResearchView): ResearchRecordResponse {
    const provenance = researchAiProvenance(chain);
    if (!provenance.ok) throw this.integrityFailure(view.entityId, 'PROVENANCE_INVALID');
    return {
      entityType: view.entityType,
      entityId: view.entityId,
      displayRef: view.displayRef,
      marjaId: view.marjaId,
      state: view.state,
      questionId: view.question?.id ?? null,
      rulingVersion: view.rulingVersion,
      rulingSeriesId: view.rulingSeriesId,
      expectedRevision: view.length,
      content: contentOf(view.content),
      records: chain.records.map(summaryOf),
      aiProvenance: provenance.value.map((entry) => ({
        ...entry,
        declaration: { ...entry.declaration },
        correctedBy: entry.correctedBy === null ? null : { ...entry.correctedBy },
      })),
    };
  }

  // ── Reads ──────────────────────────────────────────────────────────────────────────────

  /** The initial-scope Marjas the caller holds any research permission for, with those permissions. */
  marjas(request: object): ResearchMarjasResponse {
    this.requireAuthenticated(request);
    const marjas = INITIAL_RESEARCH_MARJAS.map((marjaId) => ({
      marjaId,
      permissions: RESEARCH_PERMISSIONS.filter((p) => this.allowed(request, p, marjaId)),
    })).filter((m) => m.permissions.length > 0);
    return { marjas };
  }

  private async views(
    request: object,
    type: ResearchRecordType,
    permission: 'research.read' | 'research.audit.read',
    marjaId: string | undefined,
  ): Promise<{ chain: ResearchChain; view: ResearchView }[]> {
    this.requireAuthenticated(request);
    const store = this.chains(this.store.stores, ENTITY_TYPE[type]);
    const refs = await store.entities(marjaId);
    if (!refs.ok) throw researchUnavailable();
    const visible = refs.value.filter((ref) => this.allowed(request, permission, ref.marjaId));
    // Bounded parallel loads: one sequential round trip per chain made lists of a few hundred
    // records exceed the web tier's timeout against a remote database. Order is kept.
    const result: { chain: ResearchChain; view: ResearchView }[] = [];
    for (let start = 0; start < visible.length; start += VIEW_LOAD_CONCURRENCY) {
      const batch = await Promise.all(
        visible
          .slice(start, start + VIEW_LOAD_CONCURRENCY)
          .map((ref) => this.loadVerified(this.store.stores, ENTITY_TYPE[type], ref.entityId)),
      );
      for (const loaded of batch) {
        if (loaded === null) throw researchUnavailable();
        result.push(loaded);
      }
    }
    return result;
  }

  async list(
    request: object,
    type: ResearchRecordType,
    query: {
      marjaId?: string | undefined;
      state?: string | undefined;
      questionId?: string | undefined;
      limit?: number | undefined;
      cursor?: string | undefined;
    },
  ): Promise<Page<ResearchListItem>> {
    const views = await this.views(request, type, 'research.read', query.marjaId);
    const items = views
      .filter(({ view }) => query.state === undefined || view.state === query.state)
      .filter(
        ({ view }) => query.questionId === undefined || view.question?.id === query.questionId,
      )
      .map(({ chain, view }): ResearchListItem => ({
        entityType: view.entityType,
        entityId: view.entityId,
        displayRef: view.displayRef,
        marjaId: view.marjaId,
        state: view.state,
        questionId: view.question?.id ?? null,
        rulingVersion: view.rulingVersion,
        rulingSeriesId: view.rulingSeriesId,
        revisions: view.length,
        createdAt: chain.records[0]?.recordedAt ?? '',
        updatedAt: view.last.recordedAt,
        label: labelOf(view),
      }));
    const keyOf = (i: ResearchListItem) => `${i.createdAt}|${i.entityId}`;
    const page = pageOf(sortedBy(items, keyOf), keyOf, 'asc', query.limit, query.cursor);
    if (page === null) throw problem(400, 'VALIDATION_FAILED', 'The page cursor is not valid.');
    return page;
  }

  /** Auditor view (D6): history metadata only; no content and no reasons. */
  async metadata(
    request: object,
    type: ResearchRecordType,
    query: {
      marjaId?: string | undefined;
      limit?: number | undefined;
      cursor?: string | undefined;
    },
  ): Promise<Page<ResearchMetadataItem>> {
    const views = await this.views(request, type, 'research.audit.read', query.marjaId);
    const items = views.map(({ chain, view }) => this.metadataItem(chain, view));
    const keyOf = (i: ResearchMetadataItem) => `${i.records[0]?.recordedAt ?? ''}|${i.entityId}`;
    const page = pageOf(sortedBy(items, keyOf), keyOf, 'asc', query.limit, query.cursor);
    if (page === null) throw problem(400, 'VALIDATION_FAILED', 'The page cursor is not valid.');
    return page;
  }

  private metadataItem(chain: ResearchChain, view: ResearchView): ResearchMetadataItem {
    return {
      entityType: view.entityType,
      entityId: view.entityId,
      displayRef: view.displayRef,
      marjaId: view.marjaId,
      state: view.state,
      records: chain.records.map((r) => ({
        revision: r.revision,
        kind: r.kind,
        actor: { kind: r.actor.kind, subject: r.actor.subject },
        recordedAt: r.recordedAt,
        hasReason: r.reason !== null,
        recordDigest: r.recordDigest,
      })),
    };
  }

  async recordMetadata(
    request: object,
    type: ResearchRecordType,
    entityId: string,
  ): Promise<ResearchMetadataItem> {
    this.requireAuthenticated(request);
    const loaded = await this.loadVerified(this.store.stores, ENTITY_TYPE[type], entityId);
    if (loaded === null) throw researchNotFound();
    this.requireAnyAccess(request, loaded.view.marjaId);
    return this.metadataItem(loaded.chain, loaded.view);
  }

  async get(
    request: object,
    type: ResearchRecordType,
    entityId: string,
  ): Promise<ResearchRecordResponse> {
    this.requireAuthenticated(request);
    const loaded = await this.loadVerified(this.store.stores, ENTITY_TYPE[type], entityId);
    if (loaded === null) throw researchNotFound();
    this.requireContentAccess(request, loaded.view.marjaId);
    return this.response(loaded.chain, loaded.view);
  }

  /** One exact revision and the content a pin to it refers to (the latest content at or before it). */
  async revision(
    request: object,
    type: ResearchRecordType,
    entityId: string,
    revision: number,
  ): Promise<ResearchRevisionResponse> {
    this.requireAuthenticated(request);
    const loaded = await this.loadVerified(this.store.stores, ENTITY_TYPE[type], entityId);
    if (loaded === null) throw researchNotFound();
    this.requireContentAccess(request, loaded.view.marjaId);
    const { chain, view } = loaded;
    const record = chain.records[revision];
    const state = view.states[revision];
    const content = chain.records
      .slice(0, revision + 1)
      .filter((r) => r.kind === 'CREATED' || r.kind === 'REVISED')
      .at(-1);
    if (record === undefined || state === undefined || content === undefined) {
      throw researchNotFound();
    }
    return {
      entityType: view.entityType,
      entityId: view.entityId,
      displayRef: view.displayRef,
      marjaId: view.marjaId,
      record: summaryOf(record),
      stateAtRevision: state,
      content: contentOf(content),
    };
  }

  // ── Commands ───────────────────────────────────────────────────────────────────────────

  async create(
    request: object,
    type: ResearchRecordType,
    input: CreateResearchRecordRequest,
    requestId: string,
  ): Promise<ResearchRecordResponse> {
    this.requireAuthenticated(request);
    const entityType = ENTITY_TYPE[type];
    for (let attempt = 1; ; attempt += 1) {
      // Drawn inside the unit of work: a MongoDB retry after a collision draws a fresh id.
      let entityId = '';
      try {
        return await this.run(
          request,
          () => entityId,
          requestId,
          (s) => {
            entityId = this.ids.next();
            return this.apply(
              s,
              request,
              entityType,
              null,
              {
                type: 'CREATE',
                entityType,
                entityId,
                marjaId: input.marjaId,
                // Only first ruling versions exist before M5.3.5 (correction versions).
                rulingVersion: entityType === 'RULING' ? 1 : null,
                questionId: input.questionId ?? null,
                payload: input.payload,
                references: input.references,
                aiInvolvement: input.aiInvolvement,
              },
              'CREATE',
              input.references,
              requestId,
            );
          },
        );
      } catch (error) {
        if (!(error instanceof IdCollision)) throw error;
        this.logger.warn({ event: 'research.id.collision', attempt }, 'Research id collision');
        if (attempt >= CREATE_ATTEMPTS) throw researchUnavailable();
      }
    }
  }

  /** Loads the record for a command; unreadable records are 404 (nothing is revealed). */
  private async forCommand(
    s: ResearchStores,
    request: object,
    entityType: ResearchEntityType,
    entityId: string,
    action: string,
  ): Promise<{ chain: ResearchChain; view: ResearchView }> {
    let loaded: { chain: ResearchChain; view: ResearchView } | null;
    try {
      loaded = await this.loadVerified(s, entityType, entityId);
      if (loaded === null) throw researchNotFound();
    } catch (error) {
      throw new Rollback(error);
    }
    const { marjaId } = loaded.view;
    const decision = this.authz.decide(request, 'research.read', {
      type: 'MARJA_RESEARCH',
      marjaId,
    });
    if (!decision.allowed) {
      // Still 404 to the caller (nothing revealed), but the attempt is audited as a denial.
      const problem =
        decision.reason === 'MISSING_PERMISSION' || decision.reason === 'OUT_OF_SCOPE'
          ? researchNotFound()
          : problemForDenial(decision.reason);
      throw new Rollback(
        new ResearchRefusal(problem, action, { status: 'DENIED', decision }, marjaId),
      );
    }
    return loaded;
  }

  async revise(
    request: object,
    type: ResearchRecordType,
    entityId: string,
    input: ReviseResearchRecordRequest,
    requestId: string,
  ): Promise<ResearchRecordResponse> {
    this.requireAuthenticated(request);
    const entityType = ENTITY_TYPE[type];
    return this.run(
      request,
      () => entityId,
      requestId,
      async (s) => {
        const existing = await this.forCommand(s, request, entityType, entityId, 'REVISE');
        return this.apply(
          s,
          request,
          entityType,
          existing,
          {
            type: 'REVISE',
            expectedRevision: input.expectedRevision,
            payload: input.payload,
            references: input.references,
            aiInvolvement: input.aiInvolvement,
          },
          'REVISE',
          input.references,
          requestId,
        );
      },
    );
  }

  async transition(
    request: object,
    type: ResearchRecordType,
    entityId: string,
    action: ResearchTransitionAction,
    input: ResearchTransitionRequest,
    requestId: string,
  ): Promise<ResearchRecordResponse> {
    this.requireAuthenticated(request);
    const entityType = ENTITY_TYPE[type];
    const kind = KIND_OF[action];
    return this.run(
      request,
      () => entityId,
      requestId,
      async (s) => {
        const existing = await this.forCommand(s, request, entityType, entityId, kind);
        return this.apply(
          s,
          request,
          entityType,
          existing,
          {
            type: 'TRANSITION',
            expectedRevision: input.expectedRevision,
            kind,
            reason: input.reason,
          },
          kind,
          // Approval-type transitions re-check the content's references (core needs them resolved).
          existing.view.content.references,
          requestId,
          entityType === 'RULING'
            ? { correcting: null, versions: await this.seriesOf(s, existing.view) }
            : undefined,
        );
      },
    );
  }

  // ── Ruling versions (M5.3.5) ───────────────────────────────────────────────────────────

  /**
   * A correction: a new DRAFT version n+1 of the series of the CURRENT version `entityId`. Core
   * refuses unless that version is the series' only APPROVED one and no other draft exists; the
   * corrected version and its history are never changed (it is superseded only when the new
   * version is approved).
   */
  async createVersion(
    request: object,
    entityId: string,
    input: CreateRulingVersionRequest,
    requestId: string,
  ): Promise<ResearchRecordResponse> {
    this.requireAuthenticated(request);
    for (let attempt = 1; ; attempt += 1) {
      let newId = '';
      try {
        return await this.run(
          request,
          // Refusals are recorded against the version being corrected.
          () => entityId,
          requestId,
          async (s) => {
            const current = await this.forCommand(s, request, 'RULING', entityId, 'CREATE');
            if (input.expectedRevision !== current.view.length) {
              throw new Rollback(researchConflict());
            }
            const versions = await this.seriesOf(s, current.view);
            newId = this.ids.next();
            return this.apply(
              s,
              request,
              'RULING',
              null,
              {
                type: 'CREATE',
                entityType: 'RULING',
                entityId: newId,
                marjaId: current.view.marjaId,
                rulingVersion: versions.length + 1,
                questionId: null,
                payload: input.payload,
                references: input.references,
                aiInvolvement: input.aiInvolvement,
              },
              'CREATE',
              input.references,
              requestId,
              { correcting: entityId, versions },
            );
          },
        );
      } catch (error) {
        if (!(error instanceof IdCollision)) throw error;
        this.logger.warn({ event: 'research.id.collision', attempt }, 'Research id collision');
        if (attempt >= CREATE_ATTEMPTS) throw researchUnavailable();
      }
    }
  }

  /** Every version of the ruling's series and the one current (APPROVED) version, if any. */
  async versions(request: object, entityId: string): Promise<RulingVersionsResponse> {
    this.requireAuthenticated(request);
    const loaded = await this.loadVerified(this.store.stores, 'RULING', entityId);
    if (loaded === null) throw researchNotFound();
    this.requireContentAccess(request, loaded.view.marjaId);
    const stored = await this.store.stores.rulings.seriesVersions(
      loaded.view.rulingSeriesId ?? entityId,
    );
    if (!stored.ok) throw researchUnavailable();
    const series = replayRulingSeries(stored.value, loaded.view.marjaId);
    if (!series.ok) throw this.integrityFailure(entityId, 'RULING_SERIES_INVALID');
    const item = (v: { chain: ResearchChain; view: ResearchView }) => ({
      entityId: v.view.entityId,
      displayRef: v.view.displayRef,
      rulingVersion: v.view.rulingVersion ?? 0,
      state: v.view.state,
      current: v.view.entityId === series.value.current?.view.entityId,
      createdAt: v.chain.records[0]?.recordedAt ?? '',
      updatedAt: v.view.last.recordedAt,
    });
    return {
      rulingSeriesId: series.value.seriesId,
      marjaId: series.value.marjaId,
      current: series.value.current === null ? null : item(series.value.current),
      versions: series.value.versions.map(item),
    };
  }
}
