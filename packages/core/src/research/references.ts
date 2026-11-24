import type { ResearchChain, ResearchReference, ResearchState } from '@khums/shared-types';

import { replayResearchChain } from './chain';
import { REQUIRED_REFERENCE_STATE } from './lifecycle';

/**
 * Reference resolution (M5.3.2; docs/SCHOLAR_RESEARCH_ARCHITECTURE.md §2.1, the pinned-revision
 * policy). Every reference points at an exact revision (or ruling version) of a record of the SAME
 * Marja.
 *
 * - DRAFT (CREATE, REVISE): the target exists, replays, matches its entity type, id and ruling
 *   version, has that exact revision, belongs to the same Marja, and is not deleted (at that
 *   revision or since). A disputed, withdrawn or superseded target may still be cited in a draft.
 * - APPROVAL (VERIFIED, REVIEWED, APPROVED): additionally, the pinned revision is in the required
 *   state (sources and passages VERIFIED, translations REVIEWED, findings and rulings APPROVED) and
 *   the target has not been withdrawn or disputed at any point since that revision.
 * - A newer revision or a superseding record does not invalidate a pin: SUPERSEDED alone passes.
 *   The check is not transitive (a cited finding's own citations are checked when that finding is
 *   verified and approved, not again here).
 */

export type ReferenceIssueCode =
  | 'REFERENCE_NOT_FOUND'
  | 'REFERENCE_INVALID'
  | 'REFERENCE_OTHER_MARJA'
  | 'REFERENCE_REVISION_INVALID'
  | 'REFERENCE_DELETED'
  | 'REFERENCE_STATE_INVALID'
  /** The target was withdrawn after the pinned revision. */
  | 'REFERENCE_WITHDRAWN'
  /** The target was disputed after the pinned revision (even if later superseded). */
  | 'REFERENCE_DISPUTED';

export interface ReferenceIssue {
  readonly code: ReferenceIssueCode;
  readonly entityId: string;
}

/** Loads the chain a reference points at (the API's stores; tests' fixtures). */
export type ReferenceResolver = (reference: ResearchReference) => ResearchChain | null;

export function checkResearchReferences(
  marjaId: string,
  references: readonly ResearchReference[],
  resolve: ReferenceResolver,
  phase: 'DRAFT' | 'APPROVAL',
): readonly ReferenceIssue[] {
  const issues: ReferenceIssue[] = [];
  for (const reference of references) {
    const fail = (code: ReferenceIssueCode) => issues.push({ code, entityId: reference.entityId });
    if (reference.marjaId !== marjaId) {
      fail('REFERENCE_OTHER_MARJA');
      continue;
    }
    const chain = resolve(reference);
    if (chain === null) {
      fail('REFERENCE_NOT_FOUND');
      continue;
    }
    const view = replayResearchChain(chain);
    if (!view.ok) {
      fail('REFERENCE_INVALID');
      continue;
    }
    const target = view.value;
    if (
      target.entityId !== reference.entityId ||
      target.entityType !== reference.entityType ||
      target.rulingVersion !== reference.rulingVersion
    ) {
      fail('REFERENCE_INVALID');
      continue;
    }
    if (target.marjaId !== marjaId) {
      fail('REFERENCE_OTHER_MARJA');
      continue;
    }
    const at = target.states[reference.revision];
    if (at === undefined) {
      fail('REFERENCE_REVISION_INVALID');
      continue;
    }
    if (at === 'DELETED' || target.state === 'DELETED') {
      fail('REFERENCE_DELETED');
      continue;
    }
    if (phase === 'APPROVAL') {
      // Everything that happened to the target AFTER the pinned revision. A dispute or withdrawal
      // at any point since blocks verification and approval, even if the target was later
      // superseded; supersession alone (a newer record replaced it) never invalidates the pin.
      const since: readonly ResearchState[] = target.states.slice(reference.revision + 1);
      if (at !== REQUIRED_REFERENCE_STATE[reference.entityType]) fail('REFERENCE_STATE_INVALID');
      else if (since.includes('WITHDRAWN')) fail('REFERENCE_WITHDRAWN');
      else if (since.includes('DISPUTED')) fail('REFERENCE_DISPUTED');
    }
  }
  return issues;
}
