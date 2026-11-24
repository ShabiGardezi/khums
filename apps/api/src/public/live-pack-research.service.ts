import { Inject, Injectable } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import {
  checkLivePackResearch,
  liveResearchStartsOf,
  selectLivePublicPack,
  type LivePackIssue,
  type ResearchChainLoader,
  type SuspendedLivePack,
  type VerifiedPackBundle,
} from '@khums/core';
import type { GovernanceLedger, RulePack } from '@khums/shared-types';
import { err, ok, type Result } from '@khums/utils';

import { AuditService } from '../audit/audit.service';
import {
  loadResearchProvenance,
  RESEARCH_STORE,
  type ResearchStore,
} from '../research/research-store';
import { PublicPackCache } from './public-pack-cache';

/**
 * The re-check of a live pack against the CURRENT research records (audit BLD-01, BLD-02;
 * decision 69), shared by the public calculator (every serve) and the staff views (status of a
 * rule, builder publications). The decision is core's (`checkLivePackResearch`,
 * `selectLivePublicPack`); this service loads the research chains the pack rests on and reports a
 * suspension.
 *
 * Nothing is written to the pack, its ledger or the research records: a suspended version is
 * simply not served while its research fails (computed on read). The first time this process
 * sees a version suspended for a given set of codes it logs `public.pack.research.changed` and
 * appends one `builder.pack.suspended` audit event (ids and codes only; never content, never
 * visitor data). Other processes report it once each.
 */
@Injectable()
export class LivePackResearch {
  constructor(
    @Inject(RESEARCH_STORE) private readonly research: ResearchStore,
    private readonly audit: AuditService,
    private readonly cache: PublicPackCache,
    @InjectPinoLogger(LivePackResearch.name) private readonly logger: PinoLogger,
  ) {}

  /** A loader over every research chain the packs rest on, or UNAVAILABLE. */
  async loaderFor(packs: readonly RulePack[]): Promise<Result<ResearchChainLoader, 'UNAVAILABLE'>> {
    const starts = packs.flatMap((pack) => {
      const { rulingIds, sourceRefs } = liveResearchStartsOf(pack);
      return [
        ...rulingIds.map((id) => ({ types: ['RULING'] as const, id })),
        ...sourceRefs.map((id) => ({ types: ['SOURCE', 'PASSAGE'] as const, id })),
      ];
    });
    const loaded = await loadResearchProvenance(this.research.stores, starts);
    if (!loaded.ok) return err('UNAVAILABLE');
    return ok((type, id) => {
      const chain = loaded.value.get(id);
      return chain?.entityType === type ? chain : null;
    });
  }

  /** Every rule of a live pack whose research no longer holds, or UNAVAILABLE. */
  async check(
    pack: RulePack,
    ledger: GovernanceLedger | null,
  ): Promise<Result<readonly LivePackIssue[], 'UNAVAILABLE'>> {
    const load = await this.loaderFor([pack]);
    if (!load.ok) return load;
    const issues = checkLivePackResearch(pack, ledger, load.value);
    if (issues.length > 0) {
      await this.reportSuspension({
        packId: pack.metadata.packId,
        version: pack.metadata.version,
        marjaId: pack.metadata.marjaId,
        issues,
      });
    }
    return ok(issues);
  }

  /** The public pack of a Marja after the research re-check (a suspended one is not served). */
  async select(
    marjaId: string,
    candidates: readonly { readonly pack: RulePack; readonly ledger: GovernanceLedger }[],
  ): Promise<Result<VerifiedPackBundle | null, 'UNAVAILABLE'>> {
    const load = await this.loaderFor(candidates.map((c) => c.pack));
    if (!load.ok) return load;
    const selected = selectLivePublicPack(marjaId, candidates, load.value);
    if (selected.suspended !== null) await this.reportSuspension(selected.suspended);
    return ok(selected.bundle);
  }

  private async reportSuspension(suspended: SuspendedLivePack): Promise<void> {
    const codes = [...new Set(suspended.issues.flatMap((i) => i.codes))].sort();
    const ruleIds = suspended.issues.map((i) => i.ruleId);
    const key = `${suspended.packId}@${suspended.version}:${ruleIds.join(',')}:${codes.join(',')}`;
    if (!this.cache.firstReport(key)) return;
    this.logger.warn(
      {
        event: 'public.pack.research.changed',
        packId: suspended.packId,
        version: suspended.version,
        codes,
      },
      'A live pack version rests on research that changed; it is not served until corrected',
    );
    const recorded = await this.audit.record({
      type: 'builder.pack.suspended',
      actor: null,
      targets: [{ kind: 'rulePackVersion', id: `${suspended.packId}@${suspended.version}` }],
      marjaIds: [suspended.marjaId],
      details: {
        // Computed on read (decision 69): nothing was changed; the version is not served.
        automatic: true,
        ruleIds,
        codes,
      },
      requestId: null,
    });
    // Recorded again by the next serve if the audit store was unavailable.
    if (!recorded.ok) this.cache.forgetReport(key);
  }
}
