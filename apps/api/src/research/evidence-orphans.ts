import { randomUUID } from 'node:crypto';

import type { AuditAppendError } from '@khums/core';
import type { AuditEvent, AuditEventDraft } from '@khums/shared-types';
import { err, ok, type Result } from '@khums/utils';

import { EVIDENCE_KEY, type EvidenceStorage } from './evidence-storage';
import type { EvidenceArtefactStore } from './research-store';

/**
 * Evidence orphans (M5.3.3 hardening; architecture §4.3.2). An upload stores the encrypted bytes
 * FIRST and then commits the metadata and its audit event in one transaction, so a failed commit
 * can leave bytes that no committed artefact refers to ("orphans"); never the reverse.
 *
 * - The inventory is read-only: every stored key with no artefact, with its age. Referenced keys
 *   are never listed. Orphans younger than the grace period may be an upload still in flight (or
 *   about to be retried) and are never eligible for deletion.
 * - Cleanup is operator-run and needs the exact list of keys AND a typed confirmation that names
 *   how many. Immediately before each deletion it re-checks that the key is still unreferenced and
 *   still older than the grace period (a re-upload refreshes a key's age), so referenced evidence
 *   is never deleted, even if it is passed in by mistake.
 * - It is audited before anything is deleted (intent) and afterwards (outcome), with storage keys
 *   (Marja and SHA-256), counts and reason codes only: never bytes, keys or secrets.
 */

/** Never shorter than one day; the default is a week. */
export const MIN_ORPHAN_GRACE_MS = 24 * 60 * 60 * 1000;
export const DEFAULT_ORPHAN_GRACE_MS = 7 * MIN_ORPHAN_GRACE_MS;
/** One cleanup run deletes at most this many keys (each run is audited with every key). */
export const MAX_ORPHANS_PER_CLEANUP = 50;

export interface OrphanEntry {
  readonly key: string;
  readonly storedAt: string;
  readonly ageMs: number;
  /** Older than the grace period: may be deleted after confirmation. */
  readonly eligible: boolean;
}

export interface OrphanInventory {
  readonly storedKeys: number;
  readonly referencedKeys: number;
  readonly graceMs: number;
  readonly orphans: readonly OrphanEntry[];
  /** The keys a cleanup may delete now (pass exactly these to `deleteEvidenceOrphans`). */
  readonly eligible: readonly string[];
}

export type OrphanError = 'GRACE_TOO_SHORT' | 'UNAVAILABLE';

/** Splits `${marjaId}/${digest}`. */
const partsOf = (key: string) => {
  const [marjaId, digest] = key.split('/');
  return { marjaId: marjaId ?? '', digest: digest ?? '' };
};

/** True when a committed artefact refers to `key` (asked fresh each time). */
async function isReferenced(
  artefacts: EvidenceArtefactStore,
  key: string,
): Promise<Result<boolean, 'UNAVAILABLE'>> {
  const { marjaId, digest } = partsOf(key);
  const found = await artefacts.byDigest(marjaId, digest);
  if (found.kind === 'UNAVAILABLE') return err('UNAVAILABLE');
  return ok(found.kind === 'FOUND' && found.value.storageKey === key);
}

export async function evidenceOrphanInventory(deps: {
  readonly storage: EvidenceStorage;
  readonly artefacts: EvidenceArtefactStore;
  readonly now: () => number;
  readonly graceMs?: number;
}): Promise<Result<OrphanInventory, OrphanError>> {
  const graceMs = deps.graceMs ?? DEFAULT_ORPHAN_GRACE_MS;
  if (graceMs < MIN_ORPHAN_GRACE_MS) return err('GRACE_TOO_SHORT');
  const keys = await deps.storage.keys();
  if (!keys.ok) return err('UNAVAILABLE');
  const all = await deps.artefacts.all();
  if (!all.ok) return err('UNAVAILABLE');
  const referenced = new Set(all.value.map((a) => a.storageKey));
  const now = deps.now();
  const orphans: OrphanEntry[] = [];
  for (const key of keys.value) {
    if (referenced.has(key)) continue;
    const stat = await deps.storage.stat(key);
    if (!stat.ok) {
      if (stat.error === 'NOT_FOUND') continue; // removed meanwhile
      return err('UNAVAILABLE');
    }
    const ageMs = Math.max(0, now - stat.value.storedAt);
    orphans.push({
      key,
      storedAt: new Date(stat.value.storedAt).toISOString(),
      ageMs,
      eligible: ageMs >= graceMs,
    });
  }
  return ok({
    storedKeys: keys.value.length,
    referencedKeys: keys.value.filter((k) => referenced.has(k)).length,
    graceMs,
    orphans,
    eligible: orphans.filter((o) => o.eligible).map((o) => o.key),
  });
}

/** The exact confirmation an operator must type for `count` keys. */
export const orphanConfirmation = (count: number) => `DELETE ${String(count)} EVIDENCE ORPHANS`;

export type OrphanSkipReason =
  /** A committed artefact refers to the key (never deleted). */
  | 'REFERENCED'
  /** Younger than the grace period (in flight, or re-stored since the inventory). */
  | 'IN_GRACE_PERIOD'
  | 'NOT_FOUND'
  /** Not a storage key. */
  | 'INVALID_KEY'
  | 'UNAVAILABLE';

export interface OrphanCleanupReport {
  readonly cleanupId: string;
  readonly requested: number;
  readonly deleted: readonly string[];
  readonly skipped: readonly { readonly key: string; readonly reason: OrphanSkipReason }[];
}

export type OrphanCleanupError =
  | OrphanError
  | 'NO_KEYS'
  | 'TOO_MANY_KEYS'
  | 'DUPLICATE_KEYS'
  /** The typed confirmation does not match `orphanConfirmation(keys.length)`. */
  | 'CONFIRMATION_REQUIRED'
  /** The intent could not be audited: nothing was deleted. */
  | 'AUDIT_UNAVAILABLE';

type Audit = (draft: AuditEventDraft) => Promise<Result<AuditEvent, AuditAppendError>>;

export async function deleteEvidenceOrphans(deps: {
  readonly storage: EvidenceStorage;
  readonly artefacts: EvidenceArtefactStore;
  readonly audit: Audit;
  readonly now: () => number;
  readonly keys: readonly string[];
  readonly confirmation: string;
  readonly graceMs?: number;
  readonly newId?: () => string;
}): Promise<Result<OrphanCleanupReport, OrphanCleanupError>> {
  const graceMs = deps.graceMs ?? DEFAULT_ORPHAN_GRACE_MS;
  if (graceMs < MIN_ORPHAN_GRACE_MS) return err('GRACE_TOO_SHORT');
  if (deps.keys.length === 0) return err('NO_KEYS');
  if (deps.keys.length > MAX_ORPHANS_PER_CLEANUP) return err('TOO_MANY_KEYS');
  if (new Set(deps.keys).size !== deps.keys.length) return err('DUPLICATE_KEYS');
  if (deps.confirmation !== orphanConfirmation(deps.keys.length)) {
    return err('CONFIRMATION_REQUIRED');
  }
  const cleanupId = (deps.newId ?? randomUUID)();
  const draft = (type: string, details: AuditEventDraft['details']): AuditEventDraft => ({
    eventId: (deps.newId ?? randomUUID)(),
    type,
    actor: null,
    targets: [{ kind: 'evidenceCleanup', id: cleanupId }],
    marjaIds: [
      ...new Set(deps.keys.filter((k) => EVIDENCE_KEY.test(k)).map((k) => partsOf(k).marjaId)),
    ],
    details,
    requestId: null,
    occurredAt: new Date(deps.now()).toISOString(),
  });
  const intent = await deps.audit(
    draft('research.evidence.orphans.cleanup.started', {
      command: 'delete-evidence-orphans',
      graceDays: String(graceMs / MIN_ORPHAN_GRACE_MS),
      keys: [...deps.keys],
    }),
  );
  if (!intent.ok) return err('AUDIT_UNAVAILABLE');

  const deleted: string[] = [];
  const skipped: { key: string; reason: OrphanSkipReason }[] = [];
  for (const key of deps.keys) {
    if (!EVIDENCE_KEY.test(key)) {
      skipped.push({ key, reason: 'INVALID_KEY' });
      continue;
    }
    // Re-checked right before deleting: the inventory may be stale.
    const referenced = await isReferenced(deps.artefacts, key);
    if (!referenced.ok) {
      skipped.push({ key, reason: 'UNAVAILABLE' });
      continue;
    }
    if (referenced.value) {
      skipped.push({ key, reason: 'REFERENCED' });
      continue;
    }
    const stat = await deps.storage.stat(key);
    if (!stat.ok) {
      skipped.push({ key, reason: stat.error });
      continue;
    }
    if (deps.now() - stat.value.storedAt < graceMs) {
      skipped.push({ key, reason: 'IN_GRACE_PERIOD' });
      continue;
    }
    const removed = await deps.storage.remove(key);
    if (removed.ok) deleted.push(key);
    else skipped.push({ key, reason: removed.error });
  }
  const outcome = await deps.audit(
    draft('research.evidence.orphans.cleanup.completed', {
      command: 'delete-evidence-orphans',
      deleted,
      skipped: skipped.map((s) => `${s.key}:${s.reason}`),
    }),
  );
  // The deletions happened and were announced; a missing outcome event is reported, not hidden.
  const report = { cleanupId, requested: deps.keys.length, deleted, skipped };
  return outcome.ok ? ok(report) : err('AUDIT_UNAVAILABLE');
}
