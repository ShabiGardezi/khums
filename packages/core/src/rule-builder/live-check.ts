import type { GovernanceLedger, RulePack } from '@khums/shared-types';

import { isReservedBuilderPackId } from '../governance/authorized';
import { replayLedger } from '../governance/ledger';
import { selectPublicVerifiedPack, type VerifiedPackBundle } from '../governance/public-pack';
import {
  checkRulingSnapshots,
  parseRulingRef,
  type ResearchChainLoader,
} from '../research/rule-pack-references';
import { checkRuleResearch } from './verification';

/**
 * Re-check of a LIVE (published, activated) pack against the CURRENT research records on every
 * public serve (audit BLD-01, BLD-02; decision 69). A pack that passed every gate when it was
 * published stops being served as soon as research it rests on changes:
 *
 * - every cited ruling is still usable under the pack's reference policy (`SOURCE_VERIFIED` for
 *   builder packs bound to `SOURCE_VERIFIED_AUTO_V1`, otherwise `PRODUCTION`), carries its
 *   snapshot and still has exactly the snapshotted content, with its evidence verified
 *   (`checkRulingSnapshots`); and
 * - for builder packs, every rule's research still meets the verification preconditions
 *   (`checkRuleResearch`): cited sources and passages VERIFIED, translations REVIEWED, findings
 *   current and VERIFIED or APPROVED, ruling current and the cited version.
 *
 * Nothing is changed or stored: the pack is simply not served while it fails (computed on read),
 * and staff see the affected rules as suspended with the codes. Pure.
 */

export interface LivePackIssue {
  /** The pack rule id (`builder:<rule id>` for builder packs). */
  readonly ruleId: string;
  /** Stable codes, sorted and unique (ids and codes only; never content). */
  readonly codes: readonly string[];
}

/** The ruling reference policy a governed pack was published under. */
const policyOf = (
  pack: RulePack,
  ledger: GovernanceLedger | null,
): 'SOURCE_VERIFIED' | 'PRODUCTION' => {
  if (!isReservedBuilderPackId(pack.metadata.packId)) return 'PRODUCTION';
  if (ledger === null) return 'SOURCE_VERIFIED';
  const view = replayLedger(ledger);
  return view.ok && view.value.policy !== 'SOURCE_VERIFIED_AUTO_V1'
    ? 'PRODUCTION'
    : 'SOURCE_VERIFIED';
};

/** Every research id a live pack rests on (the starting points for the API's loader). */
export function liveResearchStartsOf(pack: RulePack): {
  readonly rulingIds: readonly string[];
  readonly sourceRefs: readonly string[];
} {
  const rulingIds = new Set<string>();
  const sourceRefs = new Set<string>();
  for (const rule of pack.rules) {
    for (const ref of rule.rulingRefs) {
      const parsed = parseRulingRef(ref);
      if (parsed !== null) rulingIds.add(parsed.entityId);
    }
    if (isReservedBuilderPackId(pack.metadata.packId)) {
      for (const id of rule.sourceRefs) sourceRefs.add(id);
    }
  }
  return { rulingIds: [...rulingIds].sort(), sourceRefs: [...sourceRefs].sort() };
}

/** Every rule of a live pack whose research no longer holds (empty: the pack may be served). */
export function checkLivePackResearch(
  pack: RulePack,
  ledger: GovernanceLedger | null,
  load: ResearchChainLoader,
): readonly LivePackIssue[] {
  const builder = isReservedBuilderPackId(pack.metadata.packId);
  const byRule = new Map<string, Set<string>>();
  const add = (ruleId: string, code: string) => {
    const codes = byRule.get(ruleId) ?? new Set<string>();
    codes.add(code);
    byRule.set(ruleId, codes);
  };
  for (const issue of checkRulingSnapshots(pack, load, policyOf(pack, ledger), {
    // Builder packs cite one ruling per rule; hand packs were checked in full at activation.
    requireEveryRule: builder,
  })) {
    add(issue.ruleId, issue.code);
  }
  if (builder) {
    for (const rule of pack.rules) {
      const parsed = rule.rulingRefs.length === 1 ? parseRulingRef(rule.rulingRefs[0] ?? '') : null;
      if (parsed === null) {
        add(rule.id, 'RULING_NOT_FOUND');
        continue;
      }
      const blockers = checkRuleResearch(
        {
          marjaId: pack.metadata.marjaId,
          rulingId: parsed.entityId,
          rulingVersion: parsed.version,
          sourceRefs: rule.sourceRefs,
        },
        load,
      );
      for (const b of blockers) add(rule.id, b.code);
    }
  }
  return Object.freeze(
    [...byRule.entries()]
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([ruleId, codes]) => Object.freeze({ ruleId, codes: Object.freeze([...codes].sort()) })),
  );
}

/** A candidate the public selection skipped because its research changed. */
export interface SuspendedLivePack {
  readonly packId: string;
  readonly version: string;
  readonly marjaId: string;
  readonly issues: readonly LivePackIssue[];
}

/**
 * The verified pack the public calculator may serve for `marjaId` (`selectPublicVerifiedPack`)
 * after the research re-check: a candidate whose research no longer holds is skipped and
 * reported in `suspended`. Fail closed: when the newest verified version is suspended, an older
 * one is never served instead (the Marja then has no public pack until it is corrected).
 */
export function selectLivePublicPack(
  marjaId: string,
  candidates: readonly { readonly pack: unknown; readonly ledger: unknown }[],
  load: ResearchChainLoader,
): { readonly bundle: VerifiedPackBundle | null; readonly suspended: SuspendedLivePack | null } {
  const bundle = selectPublicVerifiedPack(marjaId, candidates);
  if (bundle === null) return { bundle: null, suspended: null };
  const issues = checkLivePackResearch(bundle.pack, bundle.ledger, load);
  if (issues.length === 0) return { bundle, suspended: null };
  return {
    bundle: null,
    suspended: Object.freeze({
      packId: bundle.pack.metadata.packId,
      version: bundle.pack.metadata.version,
      marjaId,
      issues,
    }),
  };
}
