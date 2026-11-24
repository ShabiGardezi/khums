import type { ResearchState, RuleReviewStatus } from '@khums/shared-types';
import { assertNever } from '@khums/utils';

/**
 * The review status a research ruling's state stands for (M5.4; kept by decision 80 for the
 * research pages). Pure and derived: it never changes, approves or authors anything.
 */
export function rulingReviewStatus(
  state: ResearchState,
  pendingCorrection: boolean,
): RuleReviewStatus | null {
  switch (state) {
    case 'DRAFT':
    case 'VERIFIED':
    case 'REVIEWED':
      return 'SOURCE_VERIFIED_AWAITING_SCHOLAR_REVIEW';
    case 'APPROVED':
      return pendingCorrection ? 'NEEDS_CORRECTION' : 'SCHOLAR_APPROVED';
    case 'DISPUTED':
      return 'NEEDS_CORRECTION';
    case 'WITHDRAWN':
      return 'SCHOLAR_REJECTED';
    case 'SUPERSEDED':
    case 'DELETED':
      return null;
    default:
      return assertNever(state, 'Unknown research state');
  }
}
