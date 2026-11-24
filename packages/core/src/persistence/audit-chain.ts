import { canonicalDigest } from '@khums/calculation-engine';
import type { AuditEvent, AuditEventDraft, ChainHead } from '@khums/shared-types';
import { err, ok, type Result } from '@khums/utils';
import { auditEventDraftSchema, auditEventSchema } from '@khums/validation';

import { deepFreeze } from '../governance/ledger';

/**
 * Append-only, hash-chained audit log (M4.6.3a; docs/DATABASE_SCHEMA.md §3.9).
 *
 * The chain's head is always derived from the stored events (highest sequence); no mutable head
 * document exists. An append is "read head → seal at head+1 → insert"; the store's unique index on
 * `sequence` makes the insert the atomic conflict check, and the unique `eventId` makes retries
 * after an unknown outcome idempotent.
 */

export type AuditChainIssueCode =
  /** The draft or a stored event does not match the schema. */
  | 'AUDIT_EVENT_INVALID'
  /** Sequence gap or reorder, broken `previousDigest` link, or a digest that does not recompute. */
  | 'AUDIT_CHAIN_BROKEN';

export interface AuditChainIssue {
  readonly code: AuditChainIssueCode;
  /** Sequence (or array position) of the first bad event, when known. */
  readonly at: number | null;
}

export interface AuditChainSummary {
  readonly head: ChainHead | null;
  readonly count: number;
}

const digestOf = (event: Omit<AuditEvent, 'digest'>): string | null => {
  const digest = canonicalDigest(event);
  return digest.ok ? digest.value : null;
};

/** Places a draft at the position after `head` (or first). Pure; nothing is stored. */
export function sealAuditEvent(
  draft: AuditEventDraft,
  head: ChainHead | null,
): Result<AuditEvent, AuditChainIssueCode> {
  const parsed = auditEventDraftSchema.safeParse(draft);
  if (!parsed.success) return err('AUDIT_EVENT_INVALID');
  const unsealed = {
    ...parsed.data,
    sequence: head === null ? 0 : head.sequence + 1,
    previousDigest: head === null ? null : head.digest,
  };
  const digest = digestOf(unsealed);
  if (digest === null) return err('AUDIT_EVENT_INVALID');
  return ok(deepFreeze({ ...unsealed, digest }));
}

/**
 * Verifies a contiguous run of events. With `after = null` the run must start at sequence 0 (the
 * whole chain); otherwise it must continue directly after `after` (incremental verification from a
 * verified head). Every shape, sequence, link and digest is checked.
 */
export function verifyAuditChain(
  raw: readonly unknown[],
  after: ChainHead | null = null,
): Result<AuditChainSummary, AuditChainIssue> {
  let head = after;
  for (const [index, candidate] of raw.entries()) {
    const parsed = auditEventSchema.safeParse(candidate);
    if (!parsed.success) return err({ code: 'AUDIT_EVENT_INVALID', at: index });
    const event = parsed.data;
    const expectedSequence = head === null ? 0 : head.sequence + 1;
    const { digest, ...unsealed } = event;
    if (
      event.sequence !== expectedSequence ||
      event.previousDigest !== (head === null ? null : head.digest) ||
      digestOf(unsealed) !== digest
    ) {
      return err({ code: 'AUDIT_CHAIN_BROKEN', at: event.sequence });
    }
    head = { sequence: event.sequence, digest };
  }
  return ok({ head, count: raw.length });
}

/** Storage port for the audit chain. Implementations only store; they never decide. */
export interface AuditEventStore {
  /** The stored event with the highest sequence, or null when the chain is empty. */
  head(): Promise<Result<ChainHead | null, 'STORE_UNAVAILABLE'>>;
  /**
   * Inserts exactly this event. `SEQUENCE_TAKEN` / `EVENT_ID_TAKEN` come from the unique indexes;
   * `UNAVAILABLE` means the outcome is unknown (the caller may retry with the same draft).
   */
  insert(
    event: AuditEvent,
  ): Promise<'INSERTED' | 'SEQUENCE_TAKEN' | 'EVENT_ID_TAKEN' | 'UNAVAILABLE'>;
  findByEventId(eventId: string): Promise<Result<AuditEvent | null, 'STORE_UNAVAILABLE'>>;
}

export type AuditAppendError =
  | 'AUDIT_EVENT_INVALID'
  /** Another event already uses this `eventId` with different content (refused; investigate). */
  | 'AUDIT_EVENT_ID_REUSED'
  /** Every attempt lost the race for the next sequence. Nothing was dropped silently. */
  | 'AUDIT_APPEND_CONTENDED'
  /** The store could not answer or the outcome is unknown; retrying the same draft is safe. */
  | 'AUDIT_STORE_UNAVAILABLE';

const sameDraft = (stored: AuditEvent, draft: AuditEventDraft): boolean => {
  const { sequence: _s, previousDigest: _p, digest: _d, ...storedDraft } = stored;
  const a = canonicalDigest(storedDraft);
  const b = canonicalDigest(draft);
  return a.ok && b.ok && a.value === b.value;
};

/**
 * Appends one audit event, retrying a bounded number of times when another writer takes the next
 * sequence. Re-sending a draft whose earlier attempt did land returns the stored event.
 */
export async function appendAuditEvent(
  store: AuditEventStore,
  draft: AuditEventDraft,
  options: { readonly maxAttempts?: number } = {},
): Promise<Result<AuditEvent, AuditAppendError>> {
  const maxAttempts = options.maxAttempts ?? 5;
  if (!auditEventDraftSchema.safeParse(draft).success) return err('AUDIT_EVENT_INVALID');

  const alreadyStored = async (): Promise<Result<AuditEvent | null, AuditAppendError>> => {
    const existing = await store.findByEventId(draft.eventId);
    if (!existing.ok) return err('AUDIT_STORE_UNAVAILABLE');
    if (existing.value === null) return ok(null);
    return sameDraft(existing.value, draft) ? ok(existing.value) : err('AUDIT_EVENT_ID_REUSED');
  };

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const head = await store.head();
    if (!head.ok) return err('AUDIT_STORE_UNAVAILABLE');
    const sealed = sealAuditEvent(draft, head.value);
    if (!sealed.ok) return err('AUDIT_EVENT_INVALID');
    const outcome = await store.insert(sealed.value);
    switch (outcome) {
      case 'INSERTED':
        return ok(sealed.value);
      case 'UNAVAILABLE':
        return err('AUDIT_STORE_UNAVAILABLE');
      case 'EVENT_ID_TAKEN':
      case 'SEQUENCE_TAKEN': {
        // Either a concurrent writer took the sequence, or an earlier attempt of this same
        // draft already landed (a duplicate can be reported on either index).
        const stored = await alreadyStored();
        if (!stored.ok) return stored;
        if (stored.value !== null) return ok(stored.value);
        if (outcome === 'EVENT_ID_TAKEN') return err('AUDIT_STORE_UNAVAILABLE');
        break;
      }
    }
  }
  return err('AUDIT_APPEND_CONTENDED');
}
