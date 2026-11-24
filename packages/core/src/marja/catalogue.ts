import { findMarja, isCalculationAvailable, PROVISIONAL_MARJA_CATALOGUE } from '@khums/marja-rules';
import type { MarjaCatalogueEntry } from '@khums/shared-types';

/**
 * Read-only Marja catalogue for applications (web, mobile, api).
 *
 * Apps use this module instead of importing `@khums/marja-rules` directly, so the rule package
 * stays an implementation detail of `core`. The data is not copied: these functions read the
 * single catalogue in `@khums/marja-rules`.
 */

/** Selection value for "My Marja is not listed". Never collides with catalogue ids. */
export const NOT_LISTED_SELECTION = 'not-listed';

/** All catalogue entries in their recorded order (order carries no meaning). */
export function listMarjaCatalogue(): readonly MarjaCatalogueEntry[] {
  return PROVISIONAL_MARJA_CATALOGUE;
}

/** Exact-id lookup. */
export function findMarjaCatalogueEntry(id: string): MarjaCatalogueEntry | undefined {
  return findMarja(id);
}

/** Calculation availability under the release evidence policy (never inferred from status). */
export function isMarjaCalculationAvailable(entry: MarjaCatalogueEntry): boolean {
  return isCalculationAvailable(entry);
}

export type MarjaSelection =
  | { readonly kind: 'marja'; readonly entry: MarjaCatalogueEntry }
  | { readonly kind: 'not-listed' }
  | { readonly kind: 'missing' }
  | { readonly kind: 'invalid' };

const MAX_ID_LENGTH = 100;
const ID_PATTERN = /^[a-z0-9-]+$/;

/**
 * Validates an untrusted submitted selection against the catalogue. Never substitutes, defaults
 * or recommends a Marja: anything that is not an exact catalogue id or "not listed" is invalid.
 */
export function resolveMarjaSelection(raw: unknown): MarjaSelection {
  if (raw === undefined || raw === null || (typeof raw === 'string' && raw.trim() === '')) {
    return { kind: 'missing' };
  }
  if (typeof raw !== 'string') return { kind: 'invalid' };
  const id = raw.trim();
  if (id.length > MAX_ID_LENGTH || !ID_PATTERN.test(id)) return { kind: 'invalid' };
  if (id === NOT_LISTED_SELECTION) return { kind: 'not-listed' };
  const entry = findMarja(id);
  return entry === undefined ? { kind: 'invalid' } : { kind: 'marja', entry };
}
