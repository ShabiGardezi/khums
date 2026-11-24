import type { SavedCalculation } from '@khums/core';

/**
 * Hand-over of a saved calculation from the history page to the calculator (decision 71), in this
 * page's memory only: a module variable that survives the client-side navigation to `/start` and
 * nothing else. The entries are never put in a URL, cookie, form submission or Server Function,
 * and a reload simply starts a fresh calculation.
 */
export interface ReopenRequest {
  readonly saved: SavedCalculation;
  /** `edit`: the saved dates and entries; `copy`: the entries for a new year (dates cleared). */
  readonly mode: 'edit' | 'copy';
}

let pending: ReopenRequest | null = null;

export function requestReopen(request: ReopenRequest): void {
  pending = request;
}

/** The pending request, if any (read during render; cleared with `clearReopenRequest`). */
export const peekReopenRequest = (): ReopenRequest | null => pending;

export function clearReopenRequest(): void {
  pending = null;
}
