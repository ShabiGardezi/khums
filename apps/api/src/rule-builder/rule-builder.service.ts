import { randomUUID } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import {
  cpiInflation,
  INITIAL_RESEARCH_MARJAS,
  isResearchMarja,
  newRuleRequest,
  resolveRuleRequest,
  type RuleRequestView,
  nextRuleRevision,
  replayResearchChain,
  runBuilderTest,
  validateBuilderRule,
  type BuilderSourceInfo,
} from '@khums/core';
import type {
  AuditDetailValue,
  AuditEventDraft,
  GovernancePermission,
  ResearchChain,
} from '@khums/shared-types';
import {
  API_ERROR_CODES,
  PROVISIONAL_RESULT_LABEL,
  type BuilderAiPreparation,
  type BuilderRuleContent,
  type CheckScholarRuleRequest,
  type CreateRuleRequestRequest,
  type CreateScholarRuleRequest,
  type ResolveRuleRequestRequest,
  type RuleInflationQuery,
  type RuleInflationResponse,
  type RuleRequestListResponse,
  type RuleRequestResponse,
  type ReviseScholarRuleRequest,
  type ScholarRuleCheckResponse,
  type ScholarRuleListResponse,
  type ScholarRuleResponse,
  type ScholarRuleRevision,
  type ScholarRuleRevisionResponse,
  type ScholarRuleTestResponse,
  type TestScholarRulesRequest,
} from '@khums/validation';

import { CLOCK, type Clock } from '../auth/auth.tokens';
import { CPI_SERIES, CPI_SOURCE } from '../inflation/cpi-data';
import { StaffNamesService } from '../auth/staff-names.service';
import { problemForDenial, StaffAuthorizationService } from '../auth/staff-authorization.service';
import { ApiProblemException } from '../common/errors/api-problem.exception';
import { InjectAppConfig, type AppConfig } from '../config';
import { Rollback } from '../persistence/unit-of-work';
import { RESEARCH_STORE, type ResearchStore } from '../research/research-store';
import { RESEARCH_ID_SOURCE, type ResearchIdSource } from '../research/research-common';
import {
  RULE_BUILDER_STORE,
  type RuleBuilderStore,
  type RuleBuilderStores,
} from './rule-builder-store';

/**
 * The scholar rule builder use cases (Phase 2 steps 3–4). Every decision is `@khums/core`'s
 * (authorization, content validation, the developer-requirement check, compilation and the test
 * run); this service adds storage, atomicity, research-reference resolution, audit and the HTTP
 * mapping:
 *
 * - A rule stores only what the scholar entered; every save is a new append-only revision with
 *   actor, time and reason, committed together with its audit event.
 * - Rulings and sources are resolved from the research store: they must exist in the rule's Marja.
 * - Reads outside the caller's scope answer 404 (nothing reveals a rule exists).
 * - Test calculations are staff-only and PROVISIONAL — FOR SCHOLAR REVIEW ONLY; the test pack is
 *   never stored, registered or served publicly, and no figure is logged or audited.
 */

const problem = (status: number, code: keyof typeof API_ERROR_CODES, detail: string) =>
  new ApiProblemException(status, API_ERROR_CODES[code], detail);
const unavailable = () =>
  problem(503, 'SERVICE_UNAVAILABLE', 'The rule builder is currently unavailable.');
const notFound = () => problem(404, 'RULE_NOT_FOUND', 'No rule with this id is available to you.');
const conflict = () =>
  problem(409, 'RULE_CONFLICT', 'The rule changed meanwhile. Reload and try again.');
/** Codes are fixed identifiers (never content or submitted values). */
const refused = (codes: readonly string[]) =>
  problem(422, 'RULE_REFUSED', `The rule was refused (${[...new Set(codes)].sort().join(', ')}).`);
const stateForbids = () =>
  problem(
    403,
    'OPERATIONAL_STATE_FORBIDS',
    'This deployment’s operational state does not allow test calculations.',
  );

const UNBOUND = 'unbound-marja';
/** Research states a builder rule may never cite. */
const RETIRED = new Set(['DELETED', 'WITHDRAWN', 'SUPERSEDED']);

interface ResolvedReferences {
  readonly rulingVersion: number | null;
  readonly sources: Readonly<Record<string, BuilderSourceInfo>>;
}

const locatorText = (locator: unknown): string | null => {
  if (typeof locator !== 'object' || locator === null) return null;
  const l = locator as Record<string, unknown>;
  const words = {
    volume: 'vol.',
    page: 'p.',
    masalah: 'masalah',
    istiftaId: 'question',
    section: 'section',
    paragraph: 'para.',
  } as const;
  const parts = (['volume', 'page', 'masalah', 'istiftaId', 'section', 'paragraph'] as const)
    .filter((k) => l[k] !== null && l[k] !== undefined)
    .map((k) => `${words[k]} ${String(l[k])}`);
  return parts.length === 0 ? null : parts.join(', ').slice(0, 300);
};

const httpsUrl = (value: unknown): string | null =>
  typeof value === 'string' && value.startsWith('https://') ? value : null;

function revisionResponse(
  r: ScholarRuleRevision,
  names: ReadonlyMap<string, string> = new Map(),
): ScholarRuleRevisionResponse {
  return {
    revision: r.revision,
    content: r.content,
    rulingVersion: r.rulingVersion,
    actor: r.actor,
    // Decision 79: shown by username, never by internal id.
    actorName: names.get(r.actor) ?? null,
    at: r.at,
    reason: r.reason,
    aiPreparation: r.aiPreparation === undefined ? null : { ...r.aiPreparation },
    rejected: r.rejected === true,
  };
}

function checkResponse(content: BuilderRuleContent): ScholarRuleCheckResponse {
  const check = validateBuilderRule(content);
  return {
    status: check.status,
    errors: check.errors.map((e) => ({ code: e.code, field: e.field })),
    missing: check.missing.map((m) => ({ code: m.code, field: m.field })),
    requirement: {
      status: check.requirement.status,
      capabilities: check.requirement.capabilities.map((g) => ({ code: g.code, field: g.field })),
    },
  };
}

@Injectable()
export class RuleBuilderService {
  constructor(
    @InjectAppConfig() private readonly config: AppConfig,
    @Inject(RULE_BUILDER_STORE) private readonly store: RuleBuilderStore,
    @Inject(RESEARCH_STORE) private readonly research: ResearchStore,
    @Inject(RESEARCH_ID_SOURCE) private readonly ids: ResearchIdSource,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly authz: StaffAuthorizationService,
    @InjectPinoLogger(RuleBuilderService.name) private readonly logger: PinoLogger,
    private readonly staffNames: StaffNamesService,
  ) {}

  // ── Authorization helpers (decisions are core's) ─────────────────────────────────────────

  private decide(request: object, permission: GovernancePermission, marjaId: string) {
    return this.authz.decide(request, permission, { type: 'MARJA_RESEARCH', marjaId });
  }

  private requireAuthenticated(request: object): void {
    const decision = this.decide(request, 'builder.rule.read', UNBOUND);
    if (decision.allowed) return;
    if (decision.reason === 'MISSING_PERMISSION' || decision.reason === 'OUT_OF_SCOPE') return;
    throw problemForDenial(decision.reason);
  }

  /**
   * Decision 83: official monthly-CPI inflation between two dates (a suggestion for the staff test
   * panel; any signed-in staff member). Reference data only: nothing is stored or audited.
   */
  inflation(request: object, query: RuleInflationQuery): RuleInflationResponse {
    this.requireAuthenticated(request);
    const series = CPI_SERIES[query.currency];
    const result = series === undefined ? null : cpiInflation(series, query.from, query.to);
    if (result?.ok !== true) {
      return {
        available: false,
        percent: null,
        fromMonth: null,
        toMonth: null,
        latestPublished: false,
        economy: series?.economy ?? null,
        source: CPI_SOURCE,
      };
    }
    return {
      available: true,
      ...result.value,
      economy: series?.economy ?? null,
      source: CPI_SOURCE,
    };
  }

  /** Content access to an existing rule: `builder.rule.read` in its Marja, otherwise 404. */
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

  /** A denied command: audited (outside any unit of work), then the matching problem. */
  private async deny(
    request: object,
    permission: GovernancePermission,
    marjaId: string,
    target: { kind: string; id: string },
    requestId: string | null,
  ): Promise<never> {
    const decision = this.decide(request, permission, marjaId);
    if (decision.allowed) throw new Error('deny() called for an allowed decision');
    const draft = this.draft(
      request,
      'builder.action.denied',
      target,
      marjaId,
      { permission, decisionId: decision.decisionId, denyReason: decision.reason },
      requestId,
    );
    const recorded = await this.store.atomically((s) => s.audit(draft));
    if (!recorded.ok) this.logger.warn({ code: recorded.error }, 'Denial not audited');
    throw problemForDenial(decision.reason);
  }

  private static async audited(s: RuleBuilderStores, draft: AuditEventDraft): Promise<void> {
    const recorded = await s.audit(draft);
    if (!recorded.ok) throw new Rollback(unavailable());
  }

  private async run<T>(work: (s: RuleBuilderStores) => Promise<T>): Promise<T> {
    const result = await this.store.atomically(async (s): Promise<T | ApiProblemException> =>
      work(s),
    );
    if (result instanceof ApiProblemException) throw result;
    return result;
  }

  // ── Research references ──────────────────────────────────────────────────────────────────

  private async chain(
    load: (
      id: string,
    ) => Promise<
      { kind: 'FOUND'; value: ResearchChain } | { kind: 'NOT_FOUND' } | { kind: 'UNAVAILABLE' }
    >,
    id: string,
  ) {
    const found = await load(id);
    if (found.kind === 'UNAVAILABLE') throw unavailable();
    if (found.kind === 'NOT_FOUND') return null;
    const view = replayResearchChain(found.value);
    if (!view.ok) throw unavailable();
    return view.value;
  }

  /**
   * Resolves the ruling (its version) and the cited sources/passages in the rule's Marja. Unknown
   * ids, records of another Marja and retired records are refused with fixed codes.
   */
  async resolve(
    marjaId: string,
    content: Pick<BuilderRuleContent, 'rulingId' | 'sourceRefs'>,
  ): Promise<{ ok: true; value: ResolvedReferences } | { ok: false; codes: string[] }> {
    const { stores } = this.research;
    const codes: string[] = [];
    let rulingVersion: number | null = null;
    if (content.rulingId !== null) {
      const ruling = await this.chain((id) => stores.rulings.load(id), content.rulingId);
      if (ruling?.entityType !== 'RULING' || ruling.marjaId !== marjaId) {
        codes.push('RULING_NOT_FOUND');
      } else if (RETIRED.has(ruling.state)) {
        codes.push('RULING_NOT_CURRENT');
      } else {
        rulingVersion = ruling.rulingVersion;
      }
    }
    const sources: Record<string, BuilderSourceInfo> = {};
    for (const id of new Set(content.sourceRefs)) {
      const source = await this.chain((x) => stores.sources.load(x), id);
      const passage = source === null ? await this.chain((x) => stores.passages.load(x), id) : null;
      const view = source ?? passage;
      if (view?.marjaId !== marjaId) {
        codes.push('SOURCE_NOT_FOUND');
        continue;
      }
      if (RETIRED.has(view.state)) {
        codes.push('SOURCE_NOT_CURRENT');
        continue;
      }
      const payload = view.content.payload as Record<string, unknown>;
      if (view.entityType === 'SOURCE') {
        const title = (payload.title as { original?: unknown } | undefined)?.original;
        // Decision 79: titles only (internal record references are never shown).
        sources[id] = {
          title: (typeof title === 'string' ? title : view.displayRef).slice(0, 500),
          url: httpsUrl(payload.url),
          locator: null,
        };
      } else {
        const sourceRef = view.content.references.find((r) => r.entityType === 'SOURCE');
        const parent =
          sourceRef === undefined
            ? null
            : await this.chain((x) => stores.sources.load(x), sourceRef.entityId);
        const title = (parent?.content.payload as { title?: { original?: unknown } } | undefined)
          ?.title?.original;
        sources[id] = {
          title: (typeof title === 'string' ? title : view.displayRef).slice(0, 500),
          url: httpsUrl((payload.locator as Record<string, unknown> | undefined)?.url),
          locator: locatorText(payload.locator),
        };
      }
    }
    return codes.length > 0
      ? { ok: false, codes }
      : { ok: true, value: { rulingVersion, sources } };
  }

  // ── Reads ────────────────────────────────────────────────────────────────────────────────

  async list(request: object, marjaId: string): Promise<ScholarRuleListResponse> {
    this.requireAuthenticated(request);
    const decision = this.decide(request, 'builder.rule.read', marjaId);
    if (!decision.allowed) throw problemForDenial(decision.reason);
    const rules = await this.store.stores.revisions.ofMarja(marjaId);
    if (!rules.ok) throw unavailable();
    return {
      marjaId,
      canEdit: this.decide(request, 'builder.rule.edit', marjaId).allowed,
      canTest: this.decide(request, 'builder.rule.test', marjaId).allowed,
      rules: rules.value.flatMap((history) => {
        const latest = history.at(-1);
        return latest === undefined
          ? []
          : [
              {
                ruleId: latest.ruleId,
                marjaId: latest.marjaId,
                category: latest.content.category,
                revisions: history.length,
                status: validateBuilderRule(latest.content).status,
                updatedAt: latest.at,
                updatedBy: latest.actor,
                aiStage: latest.aiPreparation?.stage ?? null,
                rejected: latest.rejected === true,
              },
            ];
      }),
    };
  }

  private response(
    request: object,
    history: readonly ScholarRuleRevision[],
    readable: {
      readonly names: ReadonlyMap<string, string>;
      readonly sources: ScholarRuleResponse['sources'];
      readonly ruling: ScholarRuleResponse['ruling'];
    } = { names: new Map(), sources: [], ruling: null },
  ): ScholarRuleResponse {
    const current = history.at(-1);
    if (current === undefined) throw unavailable();
    return {
      ruleId: current.ruleId,
      marjaId: current.marjaId,
      revisions: history.length,
      current: revisionResponse(current, readable.names),
      check: checkResponse(current.content),
      history: history.map((r) => revisionResponse(r, readable.names)),
      canEdit: this.decide(request, 'builder.rule.edit', current.marjaId).allowed,
      sources: readable.sources,
      ruling: readable.ruling,
    };
  }

  /**
   * Decision 79: what the console shows instead of ids: the current revision's sources by title
   * and location, its research ruling's summary, and people by username.
   */
  private async readable(current: ScholarRuleRevision) {
    const names = await this.staffNames.names();
    const resolved = await this.resolve(current.marjaId, {
      rulingId: null,
      sourceRefs: current.content.sourceRefs,
    });
    const sources = resolved.ok
      ? current.content.sourceRefs.flatMap((refId) => {
          const info = resolved.value.sources[refId];
          return info === undefined ? [] : [{ refId, ...info }];
        })
      : [];
    let ruling: ScholarRuleResponse['ruling'] = null;
    if (current.content.rulingId !== null) {
      const view = await this.chain(
        (id) => this.research.stores.rulings.load(id),
        current.content.rulingId,
      );
      const conclusion = (view?.content.payload as { conclusion?: unknown } | undefined)
        ?.conclusion;
      if (typeof conclusion === 'string') ruling = { summary: conclusion.slice(0, 4000) };
    }
    return { names, sources, ruling };
  }

  async get(request: object, ruleId: string): Promise<ScholarRuleResponse> {
    this.requireAuthenticated(request);
    const history = await this.store.stores.revisions.history(ruleId);
    if (history.kind === 'UNAVAILABLE') throw unavailable();
    if (history.kind === 'NOT_FOUND') throw notFound();
    const marjaId = history.value[0]?.marjaId ?? UNBOUND;
    this.requireRead(request, marjaId);
    const current = history.value.at(-1);
    if (current === undefined) throw unavailable();
    return this.response(request, history.value, await this.readable(current));
  }

  check(request: object, body: CheckScholarRuleRequest): ScholarRuleCheckResponse {
    this.requireAuthenticated(request);
    const decision = this.decide(request, 'builder.rule.read', body.marjaId);
    if (!decision.allowed) throw problemForDenial(decision.reason);
    return checkResponse(body.content);
  }

  // ── Commands ─────────────────────────────────────────────────────────────────────────────

  private async save(
    request: object,
    s: RuleBuilderStores,
    input: {
      readonly ruleId: string;
      readonly marjaId: string;
      readonly history: readonly ScholarRuleRevision[];
      readonly expectedRevision: number;
      readonly content: BuilderRuleContent;
      readonly reason: string;
      readonly aiPreparation?: BuilderAiPreparation | undefined;
      readonly rejected?: boolean | undefined;
    },
    requestId: string | null,
  ): Promise<ScholarRuleResponse> {
    const references = await this.resolve(input.marjaId, input.content);
    if (!references.ok) throw new Rollback(refused(references.codes));
    const principalId = this.authz.contextFor(request).principal?.principalId;
    if (principalId === undefined) throw new Rollback(unavailable());
    const next = nextRuleRevision({
      ruleId: input.ruleId,
      marjaId: input.marjaId,
      history: input.history,
      expectedRevision: input.expectedRevision,
      content: input.content,
      rulingVersion: references.value.rulingVersion,
      actor: principalId,
      at: new Date(this.clock.now()).toISOString(),
      reason: input.reason,
      ...(input.aiPreparation === undefined ? {} : { aiPreparation: input.aiPreparation }),
      ...(input.rejected === true ? { rejected: true } : {}),
    });
    if (!next.ok) {
      switch (next.error.code) {
        case 'REVISION_CONFLICT':
          throw new Rollback(conflict());
        case 'CONTENT_INVALID':
          throw new Rollback(refused(next.error.errors.map((e) => e.code)));
        case 'RECORD_INVALID':
          throw new Rollback(refused(['RECORD_INVALID']));
        case 'AI_APPROVAL_INVALID':
          throw new Rollback(refused(['AI_APPROVAL_INVALID']));
        case 'HISTORY_INVALID':
          throw new Rollback(unavailable());
      }
    }
    const appended = await s.revisions.append(next.value);
    if (appended === 'CONFLICT') throw new Rollback(conflict());
    if (appended === 'UNAVAILABLE') throw new Rollback(unavailable());
    const check = validateBuilderRule(next.value.content);
    await RuleBuilderService.audited(
      s,
      this.draft(
        request,
        next.value.revision === 0
          ? 'builder.rule.created'
          : next.value.rejected === true
            ? 'builder.rule.rejected'
            : 'builder.rule.revised',
        { kind: 'scholarRule', id: input.ruleId },
        input.marjaId,
        {
          revision: String(next.value.revision),
          category: next.value.content.category,
          status: check.status,
          requirement: check.requirement.status,
          capabilities: check.requirement.capabilities.map((g) => g.code),
          rulingRef:
            next.value.content.rulingId === null
              ? null
              : `${next.value.content.rulingId}@${String(next.value.rulingVersion)}`,
          reason: input.reason,
          aiStage: next.value.aiPreparation?.stage ?? null,
          rejected: next.value.rejected === true,
        },
        requestId,
      ),
    );
    return this.response(request, [...input.history, next.value]);
  }

  async create(
    request: object,
    body: CreateScholarRuleRequest,
    requestId: string | null,
  ): Promise<ScholarRuleResponse> {
    this.requireAuthenticated(request);
    const target = { kind: 'scholarRule', id: 'new' };
    if (!this.decide(request, 'builder.rule.edit', body.marjaId).allowed) {
      return this.deny(request, 'builder.rule.edit', body.marjaId, target, requestId);
    }
    if (!isResearchMarja(body.marjaId)) throw refused(['MARJA_NOT_SUPPORTED']);
    const ruleId = this.ids.next();
    return this.run((s) =>
      this.save(
        request,
        s,
        {
          ruleId,
          marjaId: body.marjaId,
          history: [],
          expectedRevision: 0,
          content: body.content,
          reason: body.reason,
          aiPreparation: body.aiPreparation,
        },
        requestId,
      ),
    );
  }

  async revise(
    request: object,
    ruleId: string,
    body: ReviseScholarRuleRequest,
    requestId: string | null,
  ): Promise<ScholarRuleResponse> {
    this.requireAuthenticated(request);
    const loaded = await this.store.stores.revisions.history(ruleId);
    if (loaded.kind === 'UNAVAILABLE') throw unavailable();
    if (loaded.kind === 'NOT_FOUND') throw notFound();
    const marjaId = loaded.value[0]?.marjaId ?? UNBOUND;
    this.requireRead(request, marjaId);
    if (!this.decide(request, 'builder.rule.edit', marjaId).allowed) {
      return this.deny(
        request,
        'builder.rule.edit',
        marjaId,
        { kind: 'scholarRule', id: ruleId },
        requestId,
      );
    }
    return this.run(async (s) => {
      // Re-read inside the unit of work: the revision number decides concurrent saves.
      const history = await s.revisions.history(ruleId);
      if (history.kind !== 'FOUND') throw new Rollback(unavailable());
      return this.save(
        request,
        s,
        {
          ruleId,
          marjaId,
          history: history.value,
          expectedRevision: body.expectedRevision,
          content: body.content,
          reason: body.reason,
          aiPreparation: body.aiPreparation,
          rejected: body.rejected,
        },
        requestId,
      );
    });
  }

  // ── Test calculation (staff-only, provisional) ───────────────────────────────────────────

  async test(
    request: object,
    body: TestScholarRulesRequest,
    requestId: string | null,
  ): Promise<ScholarRuleTestResponse> {
    this.requireAuthenticated(request);
    const operationalState = this.config.operationalState;
    if (operationalState === null) throw stateForbids();
    const target = { kind: 'scholarRuleSet', id: body.marjaId };
    if (!this.decide(request, 'builder.rule.test', body.marjaId).allowed) {
      return this.deny(request, 'builder.rule.test', body.marjaId, target, requestId);
    }
    const rules = await this.store.stores.revisions.ofMarja(body.marjaId);
    if (!rules.ok) throw unavailable();
    const latest = rules.value.flatMap((history) => history.slice(-1));
    // Sources of every rule that can compile; a source that no longer resolves refuses the test.
    const sources: Record<string, BuilderSourceInfo> = {};
    for (const revision of latest) {
      const check = validateBuilderRule(revision.content);
      if (check.errors.length > 0 || check.missing.length > 0) continue;
      const resolved = await this.resolve(body.marjaId, {
        rulingId: null,
        sourceRefs: revision.content.sourceRefs,
      });
      if (!resolved.ok) throw refused(resolved.codes);
      Object.assign(sources, resolved.value.sources);
    }
    const { principal, ...context } = this.authz.contextFor(request);
    const outcome = runBuilderTest({
      principal,
      operationalState,
      marjaId: body.marjaId,
      revisions: latest,
      sources,
      test: body,
      context: { ...context, requestId: requestId ?? `server:${randomUUID()}` },
    });
    switch (outcome.status) {
      case 'REFUSED':
        throw stateForbids();
      case 'DENIED':
        throw problemForDenial(
          outcome.decision.allowed ? 'INVALID_REQUEST' : outcome.decision.reason,
        );
      case 'COMPILE_FAILED':
        throw refused([outcome.error.code]);
      case 'RAN':
        break;
    }
    const { pack } = outcome.compiled;
    const contentDigest = pack.metadata.integrity?.digest ?? '';
    const recorded = await this.store.atomically((s) =>
      s.audit(
        this.draft(
          request,
          'builder.rules.tested',
          target,
          body.marjaId,
          {
            packVersion: `${pack.metadata.packId}@${pack.metadata.version}`,
            contentDigest,
            rules: outcome.compiled.compiled.map((c) => `${c.ruleId}@${String(c.revision)}`),
            outcome: outcome.outcome,
            guidance: 'PROVISIONAL_SCHOLAR_REVIEW',
            decisionId: outcome.decision.decisionId,
          },
          requestId,
        ),
      ),
    );
    // A provisional test result is never returned unless its audit event was committed.
    if (!recorded.ok) throw unavailable();
    return {
      label: PROVISIONAL_RESULT_LABEL,
      operationalState,
      guidance: 'PROVISIONAL_SCHOLAR_REVIEW',
      disclaimer: outcome.disclaimer,
      pack: {
        packId: pack.metadata.packId,
        version: pack.metadata.version,
        marjaId: pack.metadata.marjaId,
        contentDigest,
      },
      compiled: outcome.compiled.compiled.map((c) => {
        const revision = latest.find((r) => r.ruleId === c.ruleId);
        return {
          ruleId: c.ruleId,
          revision: c.revision,
          category: c.category,
          outputId: `${c.packRuleId}:result`,
          developerRequired: c.developerRequired,
          aiStage: revision?.aiPreparation?.stage ?? null,
          rulingId: revision?.content.rulingId ?? null,
          sources: (revision?.content.sourceRefs ?? []).flatMap((refId) => {
            const info = sources[refId];
            return info === undefined ? [] : [{ refId, ...info }];
          }),
        };
      }),
      skipped: outcome.compiled.skipped.map((c) => ({
        ruleId: c.ruleId,
        revision: c.revision,
        reason: c.reason,
      })),
      questions: outcome.compiled.questions.map((q) => ({ ...q })),
      outcome: outcome.outcome,
      mapping: {
        status: outcome.mapping.status,
        clarifications: outcome.mapping.clarifications.map((c) => ({
          factId: c.factId,
          reason: c.reason,
          questionId: c.questionId,
        })),
        consultations: outcome.mapping.consultations.map((c) => ({
          factId: c.factId,
          consultationId: c.consultationId,
          label:
            pack.consultations.find((k) => k.id === c.consultationId)?.label ?? c.consultationId,
        })),
        unsupported: outcome.mapping.unsupported.map((u) => ({ factId: u.factId, code: u.code })),
      },
      report:
        outcome.report === null
          ? null
          : (JSON.parse(JSON.stringify(outcome.report)) as Record<string, unknown>),
      refusal:
        outcome.refusal === null
          ? null
          : {
              reason: outcome.refusal.reason,
              issues: outcome.refusal.issues.map((i) => ({
                code: i.code,
                message: i.message,
                path: i.path,
              })),
            },
    };
  }

  // ── Scholar requests (Phase 4): missing rules and calculation changes ────────────────────

  private requestResponse(view: RuleRequestView): RuleRequestResponse {
    const { request: r, resolution } = view;
    return {
      requestId: r.requestId,
      marjaId: r.marjaId,
      kind: r.kind,
      ruleId: r.ruleId,
      message: r.message,
      actor: r.actor,
      at: r.at,
      resolution:
        resolution === null
          ? null
          : { note: resolution.note, actor: resolution.actor, at: resolution.at },
    };
  }

  async listRequests(request: object, marjaId: string): Promise<RuleRequestListResponse> {
    this.requireAuthenticated(request);
    const decision = this.decide(request, 'builder.rule.read', marjaId);
    if (!decision.allowed) throw problemForDenial(decision.reason);
    const views = await this.store.stores.requests.ofMarja(marjaId);
    if (!views.ok) throw unavailable();
    return {
      marjaId,
      canCreate: this.decide(request, 'builder.rule.test', marjaId).allowed,
      canResolve: this.decide(request, 'builder.rule.edit', marjaId).allowed,
      requests: views.value.map((v) => this.requestResponse(v)),
    };
  }

  /** Anyone who may test a Marja's rules may ask for a missing rule or a calculation change. */
  async createRequest(
    request: object,
    body: CreateRuleRequestRequest,
    requestId: string | null,
  ): Promise<RuleRequestResponse> {
    this.requireAuthenticated(request);
    const target = { kind: 'scholarRuleRequest', id: 'new' };
    if (!this.decide(request, 'builder.rule.test', body.marjaId).allowed) {
      return this.deny(request, 'builder.rule.test', body.marjaId, target, requestId);
    }
    if (!isResearchMarja(body.marjaId)) throw refused(['MARJA_NOT_SUPPORTED']);
    if (body.ruleId !== null) {
      const rule = await this.store.stores.revisions.history(body.ruleId);
      if (rule.kind === 'UNAVAILABLE') throw unavailable();
      if (rule.kind === 'NOT_FOUND' || rule.value[0]?.marjaId !== body.marjaId) throw notFound();
    }
    const principalId = this.authz.contextFor(request).principal?.principalId;
    if (principalId === undefined) throw unavailable();
    const record = newRuleRequest({
      requestId: this.ids.next(),
      marjaId: body.marjaId,
      kind: body.kind,
      ruleId: body.ruleId,
      message: body.message,
      actor: principalId,
      at: new Date(this.clock.now()).toISOString(),
    });
    if (record === 'RECORD_INVALID') throw refused(['RECORD_INVALID']);
    return this.run(async (s) => {
      const appended = await s.requests.append(record);
      if (appended !== 'APPLIED') throw new Rollback(unavailable());
      // The request text is never audited or logged: ids and the kind only.
      await RuleBuilderService.audited(
        s,
        this.draft(
          request,
          'builder.request.created',
          { kind: 'scholarRuleRequest', id: record.requestId },
          body.marjaId,
          { kind: record.kind, ruleId: record.ruleId },
          requestId,
        ),
      );
      return this.requestResponse({ request: record, resolution: null });
    });
  }

  /** The Marja's scholars (builder.rule.edit) resolve a request once, with a note. */
  async resolveRequest(
    request: object,
    requestKey: string,
    body: ResolveRuleRequestRequest,
    requestId: string | null,
  ): Promise<RuleRequestResponse> {
    this.requireAuthenticated(request);
    const principalId = this.authz.contextFor(request).principal?.principalId;
    if (principalId === undefined) throw unavailable();
    // The request's Marja comes from the stored records of the Marjas the caller may read.
    for (const marjaId of INITIAL_RESEARCH_MARJAS) {
      if (!this.decide(request, 'builder.rule.read', marjaId).allowed) continue;
      const views = await this.store.stores.requests.ofMarja(marjaId);
      if (!views.ok) throw unavailable();
      if (!views.value.some((v) => v.request.requestId === requestKey)) continue;
      const target = { kind: 'scholarRuleRequest', id: requestKey };
      if (!this.decide(request, 'builder.rule.edit', marjaId).allowed) {
        return this.deny(request, 'builder.rule.edit', marjaId, target, requestId);
      }
      return this.run(async (s) => {
        const current = await s.requests.ofMarja(marjaId);
        if (!current.ok) throw new Rollback(unavailable());
        const resolution = resolveRuleRequest(current.value, {
          requestId: requestKey,
          note: body.note,
          actor: principalId,
          at: new Date(this.clock.now()).toISOString(),
        });
        if (resolution === 'ALREADY_RESOLVED') throw new Rollback(conflict());
        if (resolution === 'REQUEST_NOT_FOUND') throw new Rollback(notFound());
        if (resolution === 'RECORD_INVALID') throw new Rollback(refused(['RECORD_INVALID']));
        const appended = await s.requests.append(resolution);
        if (appended === 'CONFLICT') throw new Rollback(conflict());
        if (appended === 'UNAVAILABLE') throw new Rollback(unavailable());
        await RuleBuilderService.audited(
          s,
          this.draft(request, 'builder.request.resolved', target, marjaId, {}, requestId),
        );
        const view = current.value.find((v) => v.request.requestId === requestKey);
        if (view === undefined) throw new Rollback(notFound());
        return this.requestResponse({ request: view.request, resolution });
      });
    }
    throw notFound();
  }
}
