import type { OperationalState } from '@khums/shared-types';

/**
 * Where the scholar-testing calculator may run (decision 65, kept by decision 80): only on a
 * staff-only deployment state (`SCHOLAR_REVIEW`, or `PRODUCTION_APPROVED` where it stays a staff
 * action), never in `DEVELOPMENT`. Provisional results never reach the public calculator.
 */
export function scholarTestingAllowed(state: OperationalState): boolean {
  return state === 'SCHOLAR_REVIEW' || state === 'PRODUCTION_APPROVED';
}

/** The authorization context of one scholar-testing decision (opaque values from the API). */
export interface BuilderDecisionContext {
  readonly decisionId: unknown;
  readonly evaluatedAt: unknown;
  readonly session: unknown;
  readonly requestId: unknown;
}
