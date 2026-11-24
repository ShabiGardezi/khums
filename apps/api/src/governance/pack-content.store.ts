import { computeRulePackIntegrity } from '@khums/core';
import type { RulePack } from '@khums/shared-types';
import { err, ok, type Result } from '@khums/utils';
import { rulePackSchema } from '@khums/validation';

import type { AppendOnlyCollection } from '../persistence/append-only-collection';

/**
 * Write-once storage of the rule-pack content bound by governance records (M4.6.4a, decision D2).
 *
 * Only a SUBMIT request carries content. The content is stored with the SUBMITTED record that bound
 * it; publication stores the published content (status `PUBLISHED`, same content digest) with the
 * PUBLISHED record. Every later command loads the content of the record the ledger names, so a
 * client can never present replacement content. Every read re-parses the exact stored JSON with the
 * strict rule-pack schema and recomputes its digest, which must equal both the stored digest and the
 * digest the ledger bound; anything else is an integrity failure (fail closed).
 */

/**
 * `SUBMITTED` / `PUBLISHED`: governance (production path) content, bound by ledger records. (The
 * hand-built scholar-review packs and their `PROVISIONAL` content were removed, decision 80.)
 */
export type PackContentKind = 'SUBMITTED' | 'PUBLISHED';

const KINDS: readonly PackContentKind[] = ['SUBMITTED', 'PUBLISHED'];

export interface StoredPackContent {
  readonly recordId: string;
  readonly kind: PackContentKind;
  readonly packId: string;
  readonly version: string;
  readonly marjaId: string;
  readonly digest: string;
  readonly pack: RulePack;
  readonly storedAt: string;
}

export type PackContentLookup =
  | { readonly kind: 'FOUND'; readonly value: StoredPackContent }
  | { readonly kind: 'NOT_FOUND' }
  | { readonly kind: 'UNAVAILABLE' }
  /** The stored content does not verify against its digest or the ledger (an incident). */
  | { readonly kind: 'INTEGRITY_FAILURE' };

export interface PackVersionRef {
  readonly packId: string;
  readonly version: string;
  readonly marjaId: string;
}

export interface PackContentStore {
  /** The verified content bound by `recordId`; `expectedDigest` is the digest the ledger bound. */
  load(recordId: string, kind: PackContentKind, expectedDigest: string): Promise<PackContentLookup>;
  /**
   * Stores content for its binding record. `STORED` also for an idempotent retry of the same
   * content; `CONFLICT` when other content is already bound to that record.
   */
  store(
    entry: Omit<StoredPackContent, 'packId' | 'version'>,
  ): Promise<'STORED' | 'CONFLICT' | 'UNAVAILABLE'>;
  /** The Marja every stored version of `packId` belongs to (null when the pack id is new). */
  marjaOfPack(packId: string): Promise<Result<string | null, 'UNAVAILABLE' | 'INTEGRITY_FAILURE'>>;
  /** Pack versions with submitted content, optionally for one Marja, in pack/version order. */
  versions(marjaId?: string): Promise<Result<readonly PackVersionRef[], 'UNAVAILABLE'>>;
}

interface ContentDocument {
  readonly recordId: string;
  readonly kind: PackContentKind;
  readonly packId: string;
  readonly version: string;
  readonly marjaId: string;
  readonly digest: string;
  readonly packJson: string;
  readonly storedAt: string;
}

const isDocument = (raw: unknown): raw is ContentDocument => {
  if (typeof raw !== 'object' || raw === null) return false;
  const d = raw as Record<string, unknown>;
  return (
    ['recordId', 'packId', 'version', 'marjaId', 'digest', 'packJson', 'storedAt'].every(
      (field) => typeof d[field] === 'string',
    ) && KINDS.includes(d.kind as PackContentKind)
  );
};

/** Parses and verifies a stored document; null when it fails any check. */
function verify(raw: unknown, expectedDigest: string | null): StoredPackContent | null {
  if (!isDocument(raw)) return null;
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(raw.packJson);
  } catch {
    return null;
  }
  const parsed = rulePackSchema.safeParse(parsedJson);
  if (!parsed.success) return null;
  const pack = parsed.data;
  const integrity = computeRulePackIntegrity(pack);
  if (!integrity.ok || integrity.value.digest !== raw.digest) return null;
  if (expectedDigest !== null && raw.digest !== expectedDigest) return null;
  if (
    pack.metadata.packId !== raw.packId ||
    pack.metadata.version !== raw.version ||
    pack.metadata.marjaId !== raw.marjaId
  ) {
    return null;
  }
  const scholarReview = pack.metadata.releaseChannel === 'SCHOLAR_REVIEW';
  if (!raw.recordId.startsWith(`${raw.packId}@${raw.version}#`) || scholarReview) return null;
  if (raw.kind === 'PUBLISHED' && pack.metadata.status !== 'PUBLISHED') return null;
  return {
    recordId: raw.recordId,
    kind: raw.kind,
    packId: raw.packId,
    version: raw.version,
    marjaId: raw.marjaId,
    digest: raw.digest,
    pack,
    storedAt: raw.storedAt,
  };
}

const BY_RECORD = { sort: { field: 'recordId', direction: 1 } } as const;

export function appendOnlyPackContentStore(collection: AppendOnlyCollection): PackContentStore {
  const find = async (recordId: string, kind: PackContentKind) => {
    const found = await collection.find({ recordId, kind }, { ...BY_RECORD, limit: 1 });
    return found.ok ? ok(found.value[0] ?? null) : err('UNAVAILABLE' as const);
  };
  return {
    load: async (recordId, kind, expectedDigest) => {
      const found = await find(recordId, kind);
      if (!found.ok) return { kind: 'UNAVAILABLE' };
      if (found.value === null) return { kind: 'NOT_FOUND' };
      const verified = verify(found.value, expectedDigest);
      return verified?.kind !== kind
        ? { kind: 'INTEGRITY_FAILURE' }
        : { kind: 'FOUND', value: verified };
    },
    store: async (entry) => {
      const document: ContentDocument = {
        recordId: entry.recordId,
        kind: entry.kind,
        packId: entry.pack.metadata.packId,
        version: entry.pack.metadata.version,
        marjaId: entry.marjaId,
        digest: entry.digest,
        packJson: JSON.stringify(entry.pack),
        storedAt: entry.storedAt,
      };
      // Never store what would not verify on read.
      if (verify(document, entry.digest) === null) return 'CONFLICT';
      const outcome = await collection.insert(document);
      if (outcome.kind === 'INSERTED') return 'STORED';
      if (outcome.kind === 'UNAVAILABLE') return 'UNAVAILABLE';
      // A binding already exists: an idempotent retry only if it is the same content.
      const existing = await find(entry.recordId, entry.kind);
      if (!existing.ok) return 'UNAVAILABLE';
      const stored = verify(existing.value, entry.digest);
      return stored?.marjaId === entry.marjaId ? 'STORED' : 'CONFLICT';
    },
    marjaOfPack: async (packId) => {
      const found = await collection.find({ packId }, BY_RECORD);
      if (!found.ok) return err('UNAVAILABLE');
      const marjaIds = new Set<string>();
      for (const raw of found.value) {
        const verified = verify(raw, null);
        if (verified === null) return err('INTEGRITY_FAILURE');
        marjaIds.add(verified.marjaId);
      }
      if (marjaIds.size > 1) return err('INTEGRITY_FAILURE');
      return ok([...marjaIds][0] ?? null);
    },
    versions: async (marjaId) => {
      const found = await collection.find(
        marjaId === undefined ? { kind: 'SUBMITTED' } : { kind: 'SUBMITTED', marjaId },
        BY_RECORD,
      );
      if (!found.ok) return err('UNAVAILABLE');
      const seen = new Map<string, PackVersionRef>();
      for (const raw of found.value) {
        if (!isDocument(raw)) return err('UNAVAILABLE');
        const key = `${raw.packId}@${raw.version}`;
        if (!seen.has(key)) {
          seen.set(key, { packId: raw.packId, version: raw.version, marjaId: raw.marjaId });
        }
      }
      return ok(
        [...seen.values()].sort((a, b) =>
          `${a.packId}@${a.version}`.localeCompare(`${b.packId}@${b.version}`),
        ),
      );
    },
  };
}
