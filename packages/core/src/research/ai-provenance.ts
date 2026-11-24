import type {
  AiDeclarationRef,
  AiInvolvement,
  GovernanceActorRef,
  ResearchRevisionRecord,
} from '@khums/shared-types';
import { err, ok, type Result } from '@khums/utils';

import { deepFreeze } from '../governance/ledger';
import { aiIdentityOf, aiKey } from './ai-involvement';
import { replayResearchChain, type ResearchIssueCode } from './chain';

/**
 * The full AI provenance of a research entity (M5.3.2; docs/SCHOLAR_RESEARCH_ARCHITECTURE.md §4.4),
 * derived from a VERIFIED chain. Who declared, reviewed or corrected a declaration and when are
 * the trusted metadata (actor, server time, revision) of the record that introduced that change;
 * nothing here is client-supplied. Nothing is dropped: corrected declarations stay, marked as
 * corrected, with a link to their correction.
 */

/** The trusted metadata of the record where something happened. */
export interface AiProvenanceEvent {
  readonly revision: number;
  readonly recordId: string;
  readonly actor: GovernanceActorRef;
  readonly recordedAt: string;
}

export interface AiProvenanceEntry {
  /** The declaration as it stands in the latest content revision. */
  readonly declaration: AiInvolvement;
  readonly declaredIn: AiProvenanceEvent;
  /** Where its review was recorded (null while NOT_REVIEWED). */
  readonly reviewedIn: AiProvenanceEvent | null;
  /** The correction that replaced it, if any. */
  readonly correctedBy: AiDeclarationRef | null;
  readonly correctedIn: AiProvenanceEvent | null;
  /** False once corrected: it no longer counts for review. */
  readonly effective: boolean;
}

const eventOf = (record: ResearchRevisionRecord): AiProvenanceEvent => ({
  revision: record.revision,
  recordId: record.recordId,
  actor: record.actor,
  recordedAt: record.recordedAt,
});

/** Replays the chain, then lists every declaration ever made, in the order first declared. */
export function researchAiProvenance(
  raw: unknown,
): Result<readonly AiProvenanceEntry[], ResearchIssueCode> {
  const replayed = replayResearchChain(raw);
  if (!replayed.ok) return err(replayed.error);
  const records = (raw as { readonly records: readonly ResearchRevisionRecord[] }).records;
  const entries = new Map<
    string,
    {
      declaration: AiInvolvement;
      declaredIn: AiProvenanceEvent;
      reviewedIn: AiProvenanceEvent | null;
      correctedBy: AiDeclarationRef | null;
      correctedIn: AiProvenanceEvent | null;
    }
  >();
  for (const record of records) {
    if (record.kind !== 'CREATED' && record.kind !== 'REVISED') continue;
    for (const ai of record.aiInvolvement) {
      const key = aiKey(ai);
      const existing = entries.get(key);
      const reviewed = ai.scholarReview !== 'NOT_REVIEWED';
      if (existing === undefined) {
        entries.set(key, {
          declaration: ai,
          declaredIn: eventOf(record),
          reviewedIn: reviewed ? eventOf(record) : null,
          correctedBy: null,
          correctedIn: null,
        });
        if (ai.correctionOf !== undefined) {
          const target = entries.get(aiKey(ai.correctionOf));
          if (target !== undefined) {
            target.correctedBy = aiIdentityOf(ai);
            target.correctedIn = eventOf(record);
          }
        }
      } else {
        existing.declaration = ai;
        if (reviewed && existing.reviewedIn === null) existing.reviewedIn = eventOf(record);
      }
    }
  }
  return ok(
    deepFreeze(
      [...entries.values()].map((entry) => ({ ...entry, effective: entry.correctedBy === null })),
    ),
  );
}
