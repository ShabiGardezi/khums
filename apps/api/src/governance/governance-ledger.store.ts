import type { GovernanceLedger, GovernanceRecord } from '@khums/shared-types';
import { err, ok, type Result } from '@khums/utils';
import { governanceLedgerSchema } from '@khums/validation';

import type { LookupResult } from '../persistence/lookup-result';
import type { AppendOnlyCollection } from '../persistence/append-only-collection';

/**
 * Storage port for rule-pack governance ledgers (M4.6.3a). The ledger (records, hash chain,
 * transition rules, authorization) is owned by `@khums/core`; the API only stores it. Wired into
 * the governance API in M4.6.4.
 */
export interface GovernanceLedgerStore {
  /** `NOT_FOUND` when the pack version has no records yet. */
  load(packId: string, version: string): Promise<LookupResult<GovernanceLedger>>;
  /**
   * Stores record `expectedLength` of `next` only if the stored ledger still has exactly
   * `expectedLength` records and the new record links to the last one (no forks).
   */
  append(
    expectedLength: number,
    next: GovernanceLedger,
  ): Promise<'APPLIED' | 'CONFLICT' | 'UNAVAILABLE'>;
  /** Every stored ledger, in pack/version order (integrity checkpoints). */
  loadAll(): Promise<Result<readonly GovernanceLedger[], 'UNAVAILABLE'>>;
}

const BY_SEQUENCE = { sort: { field: 'sequence', direction: 1 } } as const;

function ledgerOf(
  packId: string,
  version: string,
  docs: readonly unknown[],
): GovernanceLedger | null {
  const parsed = governanceLedgerSchema.safeParse({ packId, version, records: docs });
  return parsed.success ? parsed.data : null;
}

/**
 * Ledgers on an append-only collection: one document per record, unique
 * `(packId, version, sequence)` and `recordId`. Same append discipline as the policy registry:
 * derived head, insert as the atomic conflict check, idempotent retries by digest.
 */
export function appendOnlyGovernanceLedgerStore(
  collection: AppendOnlyCollection,
): GovernanceLedgerStore {
  const recordAt = async (
    packId: string,
    version: string,
    sequence: number,
  ): Promise<Result<GovernanceRecord | null, 'UNAVAILABLE'>> => {
    const found = await collection.find(
      { packId, version, sequence },
      { ...BY_SEQUENCE, limit: 1 },
    );
    if (!found.ok) return err('UNAVAILABLE');
    const [doc] = found.value;
    if (doc === undefined) return ok(null);
    const ledger = ledgerOf(packId, version, [doc]);
    return ledger === null ? err('UNAVAILABLE') : ok(ledger.records[0] ?? null);
  };
  return {
    load: async (packId, version) => {
      const found = await collection.find({ packId, version }, BY_SEQUENCE);
      if (!found.ok) return { kind: 'UNAVAILABLE' };
      if (found.value.length === 0) return { kind: 'NOT_FOUND' };
      const ledger = ledgerOf(packId, version, found.value);
      return ledger === null ? { kind: 'UNAVAILABLE' } : { kind: 'FOUND', value: ledger };
    },
    append: async (expectedLength, next) => {
      const record = next.records[expectedLength];
      if (
        next.records.length !== expectedLength + 1 ||
        record?.sequence !== expectedLength ||
        record.packId !== next.packId ||
        record.version !== next.version
      ) {
        return 'CONFLICT';
      }
      if (expectedLength > 0) {
        const previous = await recordAt(next.packId, next.version, expectedLength - 1);
        if (!previous.ok) return 'UNAVAILABLE';
        if (previous.value?.recordDigest !== record.previousRecordDigest) return 'CONFLICT';
      }
      const outcome = await collection.insert(record);
      if (outcome.kind === 'INSERTED') return 'APPLIED';
      if (outcome.kind === 'UNAVAILABLE') return 'UNAVAILABLE';
      const stored = await recordAt(next.packId, next.version, expectedLength);
      if (!stored.ok) return 'UNAVAILABLE';
      return stored.value?.recordDigest === record.recordDigest ? 'APPLIED' : 'CONFLICT';
    },
    loadAll: async () => {
      const found = await collection.find({}, { sort: { field: 'recordId', direction: 1 } });
      if (!found.ok) return err('UNAVAILABLE');
      const groups = new Map<string, { packId: string; version: string; docs: unknown[] }>();
      for (const doc of found.value) {
        const { packId, version } = (doc ?? {}) as { packId?: unknown; version?: unknown };
        if (typeof packId !== 'string' || typeof version !== 'string') return err('UNAVAILABLE');
        const key = `${packId}@${version}`;
        const group = groups.get(key) ?? { packId, version, docs: [] };
        group.docs.push(doc);
        groups.set(key, group);
      }
      const ledgers: GovernanceLedger[] = [];
      for (const group of [...groups.values()].sort((a, b) =>
        `${a.packId}@${a.version}`.localeCompare(`${b.packId}@${b.version}`),
      )) {
        const docs = [...group.docs].sort(
          (a, b) => (a as { sequence: number }).sequence - (b as { sequence: number }).sequence,
        );
        const ledger = ledgerOf(group.packId, group.version, docs);
        if (ledger === null) return err('UNAVAILABLE');
        ledgers.push(ledger);
      }
      return ok(ledgers);
    },
  };
}
