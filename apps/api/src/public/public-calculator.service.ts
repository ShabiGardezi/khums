import { Inject, Injectable } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import {
  findMarjaCatalogueEntry,
  listMarjaCatalogue,
  publicBundleOf,
  replayLedger,
  type VerifiedPackBundle,
} from '@khums/core';
import type { GovernanceLedger, RulePack } from '@khums/shared-types';
import {
  API_ERROR_CODES,
  type PublicMarjaListResponse,
  type PublicVerifiedPackResponse,
  type PublicVerifiedPackSummary,
} from '@khums/validation';

import { ApiProblemException } from '../common/errors/api-problem.exception';
import { InjectAppConfig, type AppConfig } from '../config';
import { GOVERNANCE_STORE, type GovernanceStore } from '../governance/governance-store';
import type { PackVersionRef } from '../governance/pack-content.store';
import { LivePackResearch } from './live-pack-research.service';
import { PublicPackCache } from './public-pack-cache';

const unavailable = () =>
  new ApiProblemException(
    503,
    API_ERROR_CODES.SERVICE_UNAVAILABLE,
    'Verified rules are currently unavailable.',
  );

/**
 * The public calculator's read side (decision 65; docs/PHASE2_PLAN.md step 6). Unauthenticated,
 * read-only. Serves, per catalogue Marja, ONLY the pack that the governance ledger shows
 * PUBLISHED and ACTIVATED and that passes the governed production readiness check
 * (`selectPublicVerifiedPack` in `@khums/core`), and only in the `PRODUCTION_APPROVED` operational
 * state; otherwise "no verified rules available yet". Provisional (scholar-review) packs live in
 * another store with no governance ledger and can never be served here; the core check also
 * refuses their channel outright.
 *
 * Nothing about the visitor is read, stored or logged; the visitor's facts never reach the API.
 * Privacy (Phase 2 step 5): the governance ledger is never sent (it names staff principals); the
 * server runs the governed check and serves the pack with approval person ids redacted plus a
 * minimal public verification summary (`publicBundleOf`).
 *
 * Research re-check (audit BLD-01, decision 69): on every serve the selected pack is checked
 * against the CURRENT research records (`LivePackResearch`); a version whose cited ruling,
 * finding, passage, translation or source changed is not served (NOT_AVAILABLE) until it is
 * corrected and verified again. Selections are cached briefly (`PublicPackCache`, at most 30 s,
 * invalidated in this process by every publication, withdrawal and research change).
 */
@Injectable()
export class PublicCalculatorService {
  constructor(
    @Inject(GOVERNANCE_STORE) private readonly store: GovernanceStore,
    @InjectAppConfig() private readonly config: AppConfig,
    @InjectPinoLogger(PublicCalculatorService.name) private readonly logger: PinoLogger,
    private readonly live: LivePackResearch,
    private readonly cache: PublicPackCache,
  ) {}

  /** Every catalogue Marja with the trace of its verified pack, or null. */
  async list(): Promise<PublicMarjaListResponse> {
    const ids = listMarjaCatalogue().map((entry) => entry.id);
    if (!this.servesPublicPacks()) {
      return { marjas: ids.map((marjaId) => ({ marjaId, verifiedPack: null })) };
    }
    const refs = await this.versions();
    const marjas = [];
    for (const marjaId of ids) {
      const bundle = await this.cachedFor(marjaId, refs);
      marjas.push({ marjaId, verifiedPack: bundle === null ? null : summaryOf(bundle) });
    }
    return { marjas };
  }

  /** The verified pack (redacted content and public summary; no ledger) of one Marja. */
  async pack(marjaId: string): Promise<PublicVerifiedPackResponse> {
    const none = { status: 'NOT_AVAILABLE' as const, marjaId };
    if (!this.servesPublicPacks() || findMarjaCatalogueEntry(marjaId) === undefined) return none;
    const bundle = await this.cachedFor(marjaId, await this.versions(marjaId));
    if (bundle === null) return none;
    const published = publicBundleOf(bundle);
    return {
      status: 'AVAILABLE',
      marjaId,
      summary: published.summary,
      pack: published.pack as unknown as Record<string, unknown>,
    };
  }

  /** Only the public deployment serves verified packs (never DEVELOPMENT or SCHOLAR_REVIEW). */
  private servesPublicPacks(): boolean {
    return this.config.operationalState === 'PRODUCTION_APPROVED';
  }

  private async versions(marjaId?: string): Promise<readonly PackVersionRef[]> {
    const versions = await this.store.stores.contents.versions(marjaId);
    if (!versions.ok) throw unavailable();
    return versions.value;
  }

  /** `verifiedFor`, cached briefly and keyed by the Marja's version list (see the class comment). */
  private cachedFor(
    marjaId: string,
    refs: readonly PackVersionRef[],
  ): Promise<VerifiedPackBundle | null> {
    const own = refs
      .filter((r) => r.marjaId === marjaId)
      .map((r) => `${r.packId}@${r.version}`)
      .sort();
    return this.cache.getOrCompute(`verified:${marjaId}`, own.join(','), () =>
      this.verifiedFor(marjaId, refs),
    );
  }

  /**
   * Loads every governed version of the Marja that its ledger shows PUBLISHED and ACTIVATED, with
   * the content its publication record bound, and lets core choose the verified one. Content that
   * fails verification is skipped (fail closed) and reported to the operators.
   */
  private async verifiedFor(
    marjaId: string,
    refs: readonly PackVersionRef[],
  ): Promise<VerifiedPackBundle | null> {
    const { ledgers, contents } = this.store.stores;
    const candidates: { pack: RulePack; ledger: GovernanceLedger }[] = [];
    for (const ref of refs) {
      if (ref.marjaId !== marjaId) continue;
      const loaded = await ledgers.load(ref.packId, ref.version);
      if (loaded.kind === 'UNAVAILABLE') throw unavailable();
      if (loaded.kind === 'NOT_FOUND') continue;
      const view = replayLedger(loaded.value);
      if (!view.ok) {
        this.integrityFailure(ref, 'LEDGER_INVALID');
        continue;
      }
      const { state, publication, activation } = view.value;
      if (state !== 'PUBLISHED' || publication === null || activation === null) continue;
      const content = await contents.load(
        publication.recordId,
        'PUBLISHED',
        publication.integrity.digest,
      );
      if (content.kind === 'UNAVAILABLE') throw unavailable();
      if (content.kind !== 'FOUND') {
        this.integrityFailure(ref, `CONTENT_${content.kind}`);
        continue;
      }
      candidates.push({ pack: content.value.pack, ledger: loaded.value });
    }
    // Governed checks, then the research re-check (BLD-01): a suspended version is not served.
    const selected = await this.live.select(marjaId, candidates);
    if (!selected.ok) throw unavailable();
    return selected.value;
  }

  private integrityFailure(ref: PackVersionRef, code: string): void {
    this.logger.error(
      { event: 'public.pack.integrity.failure', packId: ref.packId, version: ref.version, code },
      'A governed pack version failed verification and is not served',
    );
  }
}

const summaryOf = (bundle: VerifiedPackBundle): PublicVerifiedPackSummary =>
  publicBundleOf(bundle).summary;
