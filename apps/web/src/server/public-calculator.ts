import { checkPublicPackBundle } from '@khums/core';

import type { CalculationSource, VerifiedPackSource } from '@/results/calculation-source';

import { operationalState } from './operational-state';
import { serverApiClient } from './staff-api';

/**
 * SERVER-ONLY. The verified packs the public calculator may use (decision 65), loaded when the
 * page is rendered, for EVERY Marja that has one, so no request ever names the visitor's choice
 * (decision 23: the Marja choice is never sent anywhere or stored). Only bundles that pass the
 * governed check on the API (which keeps the governance records: they name staff) and pass the
 * check here that needs no governance records are passed on, and the browser checks each again
 * before calculating.
 * The visitor's facts are never sent: they stay in the browser (decision 27).
 */
export type VerifiedPacksLoad =
  | { readonly kind: 'READY'; readonly packs: Readonly<Record<string, VerifiedPackSource>> }
  /** The API could not be reached or answered unexpectedly: no figures are offered. */
  | { readonly kind: 'UNAVAILABLE' };

export async function loadVerifiedPacks(): Promise<VerifiedPacksLoad> {
  const api = await serverApiClient(null);
  if (api === null) return { kind: 'UNAVAILABLE' };
  const list = await api.public.marjas();
  if (!list.ok) return { kind: 'UNAVAILABLE' };
  const packs: Record<string, VerifiedPackSource> = {};
  for (const marja of list.value.marjas) {
    if (marja.verifiedPack === null) continue;
    const answer = await api.public.verifiedPack(marja.marjaId);
    if (!answer.ok) return { kind: 'UNAVAILABLE' };
    if (answer.value.status !== 'AVAILABLE' || answer.value.marjaId !== marja.marjaId) continue;
    const { pack, summary } = answer.value;
    const checked = checkPublicPackBundle(pack, summary);
    if (!checked.ok || checked.value.pack.metadata.marjaId !== marja.marjaId) continue;
    packs[marja.marjaId] = { pack, summary };
  }
  return { kind: 'READY', packs };
}

/**
 * SERVER-ONLY. The public state's calculation source (decision 65): in PRODUCTION_APPROVED, each
 * Marja's verified pack, loaded from the API for every Marja at once (never naming the visitor's
 * choice); in any other state null. Used to render the assessment flow (after the development
 * mock check, which stays in the start page) and, in its Server Function, to refuse an assessment
 * type the selected Marja's verified pack does not define (Phase 3 step 1).
 */
export async function loadVerifiedCalculationSource(): Promise<CalculationSource | null> {
  const state = operationalState();
  if (!state.ok || state.state !== 'PRODUCTION_APPROVED') return null;
  const loaded = await loadVerifiedPacks();
  return loaded.kind === 'READY'
    ? { kind: 'VERIFIED', status: 'READY', packs: loaded.packs }
    : { kind: 'VERIFIED', status: 'UNAVAILABLE', packs: {} };
}
