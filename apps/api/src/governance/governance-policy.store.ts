import type { GovernancePolicyRegistry } from '@khums/shared-types';
import { err, ok } from '@khums/utils';
import { governancePolicyRegistrySchema } from '@khums/validation';

import type { LookupResult } from '../persistence/lookup-result';
import type { AppendOnlyCollection } from '../persistence/append-only-collection';

/**
 * Storage port for the per-Marja governance policy registry (single-scholar stage 4). The
 * registry itself (records, hash chain, verification, authorized changes) is owned by
 * `@khums/core`; the API only stores it. Durable implementation: `appendOnlyGovernancePolicyStore`
 * (M4.6.3a).
 */
export interface GovernancePolicyStore {
  load(): Promise<LookupResult<GovernancePolicyRegistry>>;
  /**
   * Replaces the stored registry with `next` only if the store still holds exactly
   * `expectedLength` records (compare-and-append: concurrent changes cannot fork the history).
   */
  append(
    expectedLength: number,
    next: GovernancePolicyRegistry,
  ): Promise<'APPLIED' | 'CONFLICT' | 'UNAVAILABLE'>;
}

export const GOVERNANCE_POLICY_STORE = Symbol('GOVERNANCE_POLICY_STORE');

/** Production without a database: no authoritative store, so nothing resolves (fail closed). */
export const unavailableGovernancePolicyStore: GovernancePolicyStore = {
  load: () => Promise.resolve({ kind: 'UNAVAILABLE' }),
  append: () => Promise.resolve('UNAVAILABLE'),
};

/** DEVELOPMENT/TEST ONLY: process memory; lost on restart. Never used in production. */
export function inMemoryGovernancePolicyStore(
  initial: GovernancePolicyRegistry,
): GovernancePolicyStore {
  let current = initial;
  return {
    load: () => Promise.resolve({ kind: 'FOUND', value: current }),
    append: (expectedLength, next) => {
      if (current.records.length !== expectedLength) return Promise.resolve('CONFLICT');
      // Append-only: the new registry must extend the current one record for record.
      const extendsCurrent =
        next.records.length === expectedLength + 1 &&
        current.records.every((r, i) => next.records[i]?.recordDigest === r.recordDigest);
      if (!extendsCurrent) return Promise.resolve('CONFLICT');
      current = next;
      return Promise.resolve('APPLIED');
    },
  };
}

/**
 * The registry on an append-only collection (M4.6.3a): one document per record, unique `sequence`
 * and `recordId`. No mutable head: an append inserts exactly record `expectedLength`, linked to the
 * stored record before it; the unique index rejects a concurrent writer (`CONFLICT`), and a retry
 * of a write that already landed (same digest at that sequence) is `APPLIED` (idempotent).
 */
export function appendOnlyGovernancePolicyStore(
  collection: AppendOnlyCollection,
): GovernancePolicyStore {
  const recordAt = async (sequence: number) => {
    const found = await collection.find(
      { sequence },
      { sort: { field: 'sequence', direction: 1 }, limit: 1 },
    );
    if (!found.ok) return err('UNAVAILABLE' as const);
    const [doc] = found.value;
    if (doc === undefined) return ok(null);
    const parsed = governancePolicyRegistrySchema.safeParse({ records: [doc] });
    return parsed.success ? ok(parsed.data.records[0] ?? null) : err('UNAVAILABLE' as const);
  };
  return {
    load: async () => {
      const found = await collection.find({}, { sort: { field: 'sequence', direction: 1 } });
      if (!found.ok) return { kind: 'UNAVAILABLE' };
      const parsed = governancePolicyRegistrySchema.safeParse({ records: found.value });
      // A malformed stored document fails closed; core verifies the chain on every read.
      return parsed.success ? { kind: 'FOUND', value: parsed.data } : { kind: 'UNAVAILABLE' };
    },
    append: async (expectedLength, next) => {
      const record = next.records[expectedLength];
      if (next.records.length !== expectedLength + 1 || record?.sequence !== expectedLength) {
        return 'CONFLICT';
      }
      if (expectedLength > 0) {
        const previous = await recordAt(expectedLength - 1);
        if (!previous.ok) return 'UNAVAILABLE';
        if (previous.value?.recordDigest !== record.previousRecordDigest) return 'CONFLICT';
      }
      const outcome = await collection.insert(record);
      if (outcome.kind === 'INSERTED') return 'APPLIED';
      if (outcome.kind === 'UNAVAILABLE') return 'UNAVAILABLE';
      const stored = await recordAt(expectedLength);
      if (!stored.ok) return 'UNAVAILABLE';
      return stored.value?.recordDigest === record.recordDigest ? 'APPLIED' : 'CONFLICT';
    },
  };
}

export type PolicySeedOutcome =
  /** Every initial record is stored exactly (now or by an earlier run). */
  | 'SEEDED'
  /** The stored registry differs from the initial configuration; nothing was changed. */
  | 'DIFFERS'
  | 'UNAVAILABLE';

/**
 * Writes the initial registry records one by one (migration only). Records are deterministic, so
 * a re-run or a concurrent run finds identical records (idempotent `APPLIED`); a different stored
 * history is never overwritten.
 */
export async function seedPolicyRegistry(
  store: GovernancePolicyStore,
  initial: GovernancePolicyRegistry,
): Promise<PolicySeedOutcome> {
  for (let index = 0; index < initial.records.length; index += 1) {
    const outcome = await store.append(index, { records: initial.records.slice(0, index + 1) });
    if (outcome === 'UNAVAILABLE') return 'UNAVAILABLE';
    if (outcome === 'CONFLICT') return 'DIFFERS';
  }
  return 'SEEDED';
}
