import type { OperationalState } from '@khums/shared-types';

/**
 * SERVER-ONLY operational state (owner decision 2026-11-21; docs/DEVELOPMENT_ROADMAP.md "Revised
 * launch strategy"). Never import from a Client Component.
 *
 * - `DEVELOPMENT`: local machines and CI only; non-religious mock packs may be used.
 * - `SCHOLAR_REVIEW`: the private scholar deployment; provisional calculations run only on the
 *   API, which enforces the same state server-side (`KHUMS_OPERATIONAL_STATE`, M4.5a).
 * - `PRODUCTION_APPROVED`: public; only approved, governed production packs.
 *
 * Read from `KHUMS_OPERATIONAL_STATE` at request time. Unset: `DEVELOPMENT` only under `next dev`
 * (NODE_ENV=development), otherwise unconfigured, which allows no calculation at all. An invalid
 * value is unconfigured too. `DEVELOPMENT` is refused on any hosted (Vercel) deployment.
 */

export type { OperationalState } from '@khums/shared-types';

/** Keyed by the shared type, so a missing or unknown state fails to compile. */
const STATES: Readonly<Record<OperationalState, true>> = {
  DEVELOPMENT: true,
  SCHOLAR_REVIEW: true,
  PRODUCTION_APPROVED: true,
};
export const OPERATIONAL_STATES = Object.keys(STATES) as readonly OperationalState[];

export type OperationalStateResult =
  | { readonly ok: true; readonly state: OperationalState }
  | {
      readonly ok: false;
      readonly reason: 'UNCONFIGURED' | 'INVALID' | 'DEVELOPMENT_ON_HOSTED_DEPLOYMENT';
    };

const isState = (value: string): value is OperationalState =>
  (OPERATIONAL_STATES as readonly string[]).includes(value);

export function resolveOperationalState(
  env: Readonly<Record<string, string | undefined>>,
): OperationalStateResult {
  const raw = env.KHUMS_OPERATIONAL_STATE;
  const hosted = env.VERCEL === '1';
  if (raw === undefined || raw === '') {
    return env.NODE_ENV === 'development' && !hosted
      ? { ok: true, state: 'DEVELOPMENT' }
      : { ok: false, reason: 'UNCONFIGURED' };
  }
  if (!isState(raw)) return { ok: false, reason: 'INVALID' };
  if (raw === 'DEVELOPMENT' && hosted) {
    return { ok: false, reason: 'DEVELOPMENT_ON_HOSTED_DEPLOYMENT' };
  }
  return { ok: true, state: raw };
}

/** The current process's state (request time). */
export const operationalState = (): OperationalStateResult => resolveOperationalState(process.env);
