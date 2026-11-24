import type { ResearchChain } from '@khums/shared-types';
import { err, ok, type Result } from '@khums/utils';

import { replayResearchChain, type ResearchView } from './chain';

/**
 * Ruling series (M5.3.5; docs/SCHOLAR_RESEARCH_ARCHITECTURE.md §2, §5). Every version of one ruling
 * is its own revision chain; all versions share `rulingSeriesId` (version 1's entity id), are
 * numbered 1..n without gaps, belong to one Marja, and at most one of them is `APPROVED` — the
 * current, applicable version. A correction is a new DRAFT version n+1 of a series whose current
 * version is APPROVED and that has no other draft; approving it supersedes the current version in
 * the same unit of work, so two versions are never current together. If the current version is
 * withdrawn while a correction is pending, the correction can never be approved: a new ruling is
 * required. Superseded and withdrawn
 * versions keep their whole history and are never current.
 */

export interface RulingSeriesInput {
  /** CREATE of a correction: the entity id of the current version being corrected; else null. */
  readonly correcting: string | null;
  /** Every stored version chain of the series (untrusted; replayed and verified here). */
  readonly versions: readonly unknown[];
}

export interface RulingVersion {
  readonly chain: ResearchChain;
  readonly view: ResearchView;
}

export interface RulingSeries {
  readonly seriesId: string;
  readonly marjaId: string;
  /** Ordered by version, 1..n. */
  readonly versions: readonly RulingVersion[];
  /** The APPROVED version, if any (never more than one). */
  readonly current: RulingVersion | null;
  /** The DRAFT version, if any (never more than one). */
  readonly draft: RulingVersion | null;
}

export type RulingSeriesIssueCode =
  /** The stored versions do not form one valid series of one Marja. */
  | 'RULING_SERIES_INVALID'
  /**
   * A correction needs an APPROVED current version (the one named) and no other draft; it is
   * approved only while that version is still current (not after a withdrawal).
   */
  | 'RULING_CORRECTION_NOT_ALLOWED'
  /** The version number is not the next one (or a correction is created as version 1). */
  | 'RULING_VERSION_INVALID'
  /** Supersession happens only by approving the next version, never directly. */
  | 'RULING_SUPERSEDED_BY_APPROVAL';

/** Replays and checks a series. Fails closed on anything inconsistent. */
export function replayRulingSeries(
  versions: readonly unknown[],
  marjaId: string,
): Result<RulingSeries, 'RULING_SERIES_INVALID'> {
  const replayed: RulingVersion[] = [];
  for (const raw of versions) {
    const view = replayResearchChain(raw);
    if (!view.ok || view.value.entityType !== 'RULING' || view.value.marjaId !== marjaId) {
      return err('RULING_SERIES_INVALID');
    }
    replayed.push({ chain: raw as ResearchChain, view: view.value });
  }
  replayed.sort((a, b) => (a.view.rulingVersion ?? 0) - (b.view.rulingVersion ?? 0));
  const seriesId = replayed[0]?.view.entityId;
  if (seriesId === undefined) return err('RULING_SERIES_INVALID');
  const contiguous = replayed.every(
    (v, i) => v.view.rulingVersion === i + 1 && v.view.rulingSeriesId === seriesId,
  );
  const approved = replayed.filter((v) => v.view.state === 'APPROVED');
  const drafts = replayed.filter((v) => v.view.state === 'DRAFT');
  if (!contiguous || approved.length > 1 || drafts.length > 1) return err('RULING_SERIES_INVALID');
  return ok({
    seriesId,
    marjaId,
    versions: replayed,
    current: approved[0] ?? null,
    draft: drafts[0] ?? null,
  });
}

/**
 * The binding of a new ruling version: version 1 starts its own series; version n+1 corrects the
 * series' current APPROVED version (named in `series.correcting`) when no draft exists.
 */
export function rulingSeriesForCreate(
  entityId: string,
  marjaId: string,
  rulingVersion: number,
  series: RulingSeriesInput | undefined,
): Result<string, RulingSeriesIssueCode> {
  if (rulingVersion === 1) {
    return series === undefined || series.versions.length === 0
      ? ok(entityId)
      : err('RULING_VERSION_INVALID');
  }
  if (series === undefined) return err('RULING_SERIES_INVALID');
  const replayed = replayRulingSeries(series.versions, marjaId);
  if (!replayed.ok) return replayed;
  const { current, draft, versions } = replayed.value;
  if (draft !== null || current?.view.entityId !== series.correcting) {
    return err('RULING_CORRECTION_NOT_ALLOWED');
  }
  if (rulingVersion !== versions.length + 1) return err('RULING_VERSION_INVALID');
  return ok(replayed.value.seriesId);
}
