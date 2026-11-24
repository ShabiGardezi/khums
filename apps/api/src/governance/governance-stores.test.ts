import { describe, expect, it } from 'vitest';

import { replayLedger, replayPolicyRegistry } from '@khums/core';
import type { GovernancePolicyRegistry } from '@khums/shared-types';

import { twoRecordLedger } from '../../test/support/governance-ledgers';
import type { AppConfig } from '../config';
import {
  inMemoryAppendOnlyCollection,
  type AppendOnlyCollection,
} from '../persistence/append-only-collection';
import { COLLECTIONS } from '../persistence/collections';
import { appendOnlyGovernanceLedgerStore } from './governance-ledger.store';
import { appendOnlyGovernancePolicyStore, seedPolicyRegistry } from './governance-policy.store';
import {
  initialRegistryFor,
  selectGovernancePolicyStore,
  selectGovernanceStore,
} from './governance.module';
import {
  INITIAL_GOVERNANCE_POLICIES,
  INITIAL_GOVERNANCE_POLICY_RECORDED_AT,
  INITIAL_GOVERNANCE_POLICY_SEED_REQUEST_ID,
} from './initial-governance-policies';

/** Durable governance stores on append-only collections (M4.6.3a). */

const seedRegistry = () =>
  initialRegistryFor(
    Date.parse(INITIAL_GOVERNANCE_POLICY_RECORDED_AT),
    INITIAL_GOVERNANCE_POLICIES,
    INITIAL_GOVERNANCE_POLICY_SEED_REQUEST_ID,
  );
const prefix = (registry: GovernancePolicyRegistry, n: number): GovernancePolicyRegistry => ({
  records: registry.records.slice(0, n),
});

describe('append-only governance policy store', () => {
  it('stores one document per record and loads a registry that core verifies', async () => {
    const collection = inMemoryAppendOnlyCollection(COLLECTIONS.governancePolicyRegistry);
    const store = appendOnlyGovernancePolicyStore(collection);
    const full = seedRegistry();
    expect(await store.load()).toEqual({ kind: 'FOUND', value: { records: [] } });
    expect(await store.append(0, prefix(full, 1))).toBe('APPLIED');
    expect(await store.append(1, prefix(full, 2))).toBe('APPLIED');
    const loaded = await store.load();
    expect(loaded).toEqual({ kind: 'FOUND', value: prefix(full, 2) });
    expect(loaded.kind === 'FOUND' && replayPolicyRegistry(loaded.value).ok).toBe(true);
  });

  it('a concurrent writer loses on the unique sequence (no fork); a retry of the same write is idempotent', async () => {
    const store = appendOnlyGovernancePolicyStore(
      inMemoryAppendOnlyCollection(COLLECTIONS.governancePolicyRegistry),
    );
    const mine = seedRegistry();
    const theirs = initialRegistryFor(Date.parse('2026-11-22T00:00:00.000Z'));
    const [a, b] = await Promise.all([
      store.append(0, prefix(mine, 1)),
      store.append(0, prefix(theirs, 1)),
    ]);
    expect([a, b].sort()).toEqual(['APPLIED', 'CONFLICT']);
    const winner = a === 'APPLIED' ? mine : theirs;
    // Retrying the write that landed (unknown outcome) reports APPLIED and stores nothing new.
    expect(await store.append(0, prefix(winner, 1))).toBe('APPLIED');
    const loaded = await store.load();
    expect(loaded.kind === 'FOUND' && loaded.value.records).toHaveLength(1);
  });

  it('refuses records that do not continue the stored chain', async () => {
    const store = appendOnlyGovernancePolicyStore(
      inMemoryAppendOnlyCollection(COLLECTIONS.governancePolicyRegistry),
    );
    const full = seedRegistry();
    const other = initialRegistryFor(Date.parse('2026-11-22T00:00:00.000Z'));
    await store.append(0, prefix(full, 1));
    // Record 1 of another history links to a different record 0.
    expect(
      await store.append(1, {
        records: [full.records[0], other.records[1]],
      } as GovernancePolicyRegistry),
    ).toBe('CONFLICT');
    // Wrong length, skipped positions and mismatched sequences.
    expect(await store.append(0, prefix(full, 2))).toBe('CONFLICT');
    expect(await store.append(2, prefix(full, 2))).toBe('CONFLICT');
  });

  it('fails closed on malformed stored documents and on an unavailable database', async () => {
    const collection = inMemoryAppendOnlyCollection(COLLECTIONS.governancePolicyRegistry);
    await collection.insert({ sequence: 0, recordId: 'policy#0', injected: true });
    expect(await appendOnlyGovernancePolicyStore(collection).load()).toEqual({
      kind: 'UNAVAILABLE',
    });
    const down: AppendOnlyCollection = {
      spec: COLLECTIONS.governancePolicyRegistry,
      insert: () => Promise.resolve({ kind: 'UNAVAILABLE' }),
      find: () => Promise.resolve({ ok: false, error: 'UNAVAILABLE' }),
    };
    const store = appendOnlyGovernancePolicyStore(down);
    expect(await store.load()).toEqual({ kind: 'UNAVAILABLE' });
    expect(await store.append(0, prefix(seedRegistry(), 1))).toBe('UNAVAILABLE');
  });

  it('seeds the initial configuration idempotently and never overwrites a different history', async () => {
    const store = appendOnlyGovernancePolicyStore(
      inMemoryAppendOnlyCollection(COLLECTIONS.governancePolicyRegistry),
    );
    expect(await seedPolicyRegistry(store, seedRegistry())).toBe('SEEDED');
    // Deterministic records: running the migration again (or concurrently) changes nothing.
    expect(await seedPolicyRegistry(store, seedRegistry())).toBe('SEEDED');
    const loaded = await store.load();
    expect(loaded.kind === 'FOUND' && loaded.value.records).toHaveLength(
      INITIAL_GOVERNANCE_POLICIES.length,
    );
    // A different initial configuration is reported, not applied.
    expect(
      await seedPolicyRegistry(store, initialRegistryFor(Date.parse('2026-11-22T00:00:00.000Z'))),
    ).toBe('DIFFERS');
  });

  it('is selected whenever a database is configured, in every environment', () => {
    for (const env of ['production', 'development'] as const) {
      const store = selectGovernancePolicyStore(
        { env } as unknown as AppConfig,
        0,
        INITIAL_GOVERNANCE_POLICIES,
        { collection: () => ({}) } as never,
      );
      expect(Object.keys(store).sort()).toEqual(['append', 'load']);
    }
  });
});

describe('append-only governance ledger store', () => {
  it('appends records and loads a ledger that core replays', async () => {
    const store = appendOnlyGovernanceLedgerStore(
      inMemoryAppendOnlyCollection(COLLECTIONS.governanceLedgerRecords),
    );
    const { one, two } = twoRecordLedger();
    expect(await store.load(one.packId, one.version)).toEqual({ kind: 'NOT_FOUND' });
    expect(await store.append(0, one)).toBe('APPLIED');
    expect(await store.append(1, two)).toBe('APPLIED');
    const loaded = await store.load(one.packId, one.version);
    expect(loaded).toEqual({ kind: 'FOUND', value: two });
    expect(loaded.kind === 'FOUND' && replayLedger(loaded.value).ok).toBe(true);
    const all = await store.loadAll();
    expect(all.ok && all.value).toEqual([two]);
  });

  it('rejects races, stale writers and mismatched pack versions; retries are idempotent', async () => {
    const store = appendOnlyGovernanceLedgerStore(
      inMemoryAppendOnlyCollection(COLLECTIONS.governanceLedgerRecords),
    );
    const { one, two } = twoRecordLedger();
    expect(await store.append(0, one)).toBe('APPLIED');
    expect(await store.append(0, one)).toBe('APPLIED'); // retry after an unknown outcome
    expect(await store.append(0, two)).toBe('CONFLICT'); // stale expected length
    expect(await store.append(1, { ...two, version: '9.9.9' })).toBe('CONFLICT');
    const [first] = one.records;
    if (first === undefined) throw new Error('fixture');
    const forked = {
      ...two,
      records: [first, { ...two.records[1], previousRecordDigest: 'f'.repeat(64) }],
    };
    expect(await store.append(1, forked as typeof two)).toBe('CONFLICT');
  });
});

describe('governance unit-of-work store selection (M4.6.4a)', () => {
  const audit = () => inMemoryAppendOnlyCollection(COLLECTIONS.auditEvents);

  it('uses MongoDB transactions whenever a database is configured', () => {
    const db = { collection: () => ({}), client: { startSession: () => ({}) } } as never;
    for (const env of ['production', 'development'] as const) {
      expect(selectGovernanceStore({ env } as unknown as AppConfig, 0, db, audit()).durable).toBe(
        true,
      );
    }
  });

  it('fails closed in production without a database, and shares the audit chain in development', async () => {
    const production = selectGovernanceStore(
      { env: 'production' } as unknown as AppConfig,
      0,
      null,
      audit(),
    );
    expect(production.durable).toBe(false);
    expect(await production.stores.ledgers.load('p', '1.0.0')).toEqual({ kind: 'UNAVAILABLE' });
    expect(await production.stores.policies.load()).toEqual({ kind: 'UNAVAILABLE' });
    const shared = audit();
    const development = selectGovernanceStore(
      { env: 'development' } as unknown as AppConfig,
      Date.parse(INITIAL_GOVERNANCE_POLICY_RECORDED_AT),
      null,
      shared,
    );
    expect(development.audit).toBe(shared);
    expect((await development.stores.policies.load()).kind).toBe('FOUND');
  });
});
