import { describe, expect, it } from 'vitest';

import { sealRulePack } from '@khums/core';
import type { RulePack } from '@khums/shared-types';

import { TEST_PACK } from '../../test/support/governance-ledgers';
import {
  inMemoryAppendOnlyCollection,
  unavailableAppendOnlyCollection,
  type AppendOnlyCollection,
} from '../persistence/append-only-collection';
import { COLLECTIONS } from '../persistence/collections';
import { appendOnlyPackContentStore } from './pack-content.store';

/** Write-once, digest-verified pack content (M4.6.4a, decision D2). TEST pack only. */

function pack(overrides: Partial<RulePack['metadata']> = {}): RulePack {
  const sealed = sealRulePack({
    ...structuredClone(TEST_PACK),
    metadata: { ...TEST_PACK.metadata, ...overrides },
  });
  if (!sealed.ok) throw new Error('seal');
  return sealed.value;
}
const digestOf = (p: RulePack) => p.metadata.integrity?.digest ?? '';
const RECORD = 'test-governed-pack@1.0.0#0';
const entry = (p: RulePack, kind: 'SUBMITTED' | 'PUBLISHED' = 'SUBMITTED') => ({
  recordId: kind === 'SUBMITTED' ? RECORD : 'test-governed-pack@1.0.0#4',
  kind,
  marjaId: p.metadata.marjaId,
  digest: digestOf(p),
  pack: p,
  storedAt: '2026-11-21T10:00:00.000Z',
});

function setup() {
  const collection = inMemoryAppendOnlyCollection(COLLECTIONS.rulePackContents);
  return { collection, store: appendOnlyPackContentStore(collection) };
}

/** A collection whose stored documents are altered on read (simulated tampering). */
function tampering(base: AppendOnlyCollection, alter: (doc: Record<string, unknown>) => object) {
  return {
    ...base,
    find: async (...args: Parameters<AppendOnlyCollection['find']>) => {
      const found = await base.find(...args);
      return found.ok
        ? { ok: true as const, value: found.value.map((d) => alter(d as Record<string, unknown>)) }
        : found;
    },
  };
}

describe('pack content store', () => {
  it('stores content once and loads it back verified against the ledger digest', async () => {
    const { store } = setup();
    const content = pack();
    expect(await store.store(entry(content))).toBe('STORED');
    const loaded = await store.load(RECORD, 'SUBMITTED', digestOf(content));
    expect(loaded).toMatchObject({ kind: 'FOUND', value: { marjaId: 'test-marja' } });
    expect(loaded.kind === 'FOUND' && loaded.value.pack).toEqual(content);
    expect(await store.load(RECORD, 'PUBLISHED', digestOf(content))).toEqual({ kind: 'NOT_FOUND' });
  });

  it('treats a retry of the same content as stored, and other content for the binding as a conflict', async () => {
    const { store } = setup();
    expect(await store.store(entry(pack()))).toBe('STORED');
    expect(await store.store(entry(pack()))).toBe('STORED');
    const other = pack({ title: 'TEST PACK — different content' });
    expect(await store.store({ ...entry(other), recordId: RECORD })).toBe('CONFLICT');
  });

  it('refuses to store content whose digest does not verify, or a published copy not marked PUBLISHED', async () => {
    const { store, collection } = setup();
    expect(await store.store({ ...entry(pack()), digest: 'f'.repeat(64) })).toBe('CONFLICT');
    expect(await store.store(entry(pack(), 'PUBLISHED'))).toBe('CONFLICT');
    expect(await store.store(entry(pack({ status: 'PUBLISHED' }), 'PUBLISHED'))).toBe('STORED');
    const docs = await collection.find({}, { sort: { field: 'recordId', direction: 1 } });
    expect(docs.ok && docs.value).toHaveLength(1);
  });

  it('reports tampered or mismatched content as an integrity failure', async () => {
    const { store, collection } = setup();
    const content = pack();
    await store.store(entry(content));
    expect(await store.load(RECORD, 'SUBMITTED', 'a'.repeat(64))).toEqual({
      kind: 'INTEGRITY_FAILURE',
    });
    for (const alter of [
      (d: Record<string, unknown>) => ({
        ...d,
        packJson: String(d.packJson).replace('TEST category', 'TEST altered'),
      }),
      (d: Record<string, unknown>) => ({ ...d, marjaId: 'test-other-marja' }),
      (d: Record<string, unknown>) => ({ ...d, packJson: '{not json' }),
      (d: Record<string, unknown>) => ({ ...d, digest: 'b'.repeat(64) }),
      (d: Record<string, unknown>) => ({ ...d, recordId: 'other-pack@1.0.0#0' }),
    ]) {
      const tampered = appendOnlyPackContentStore(tampering(collection, alter));
      expect(await tampered.load(RECORD, 'SUBMITTED', digestOf(content))).toEqual({
        kind: 'INTEGRITY_FAILURE',
      });
    }
  });

  it('binds a pack id to one Marja and lists submitted versions', async () => {
    const { store, collection } = setup();
    expect(await store.marjaOfPack('test-governed-pack')).toEqual({ ok: true, value: null });
    await store.store(entry(pack()));
    const v11 = pack({ version: '1.1.0' });
    await store.store({ ...entry(v11), recordId: 'test-governed-pack@1.1.0#0' });
    expect(await store.marjaOfPack('test-governed-pack')).toEqual({
      ok: true,
      value: 'test-marja',
    });
    expect(await store.versions()).toEqual({
      ok: true,
      value: [
        { packId: 'test-governed-pack', version: '1.0.0', marjaId: 'test-marja' },
        { packId: 'test-governed-pack', version: '1.1.0', marjaId: 'test-marja' },
      ],
    });
    expect(await store.versions('test-other-marja')).toEqual({ ok: true, value: [] });
    const mixed = appendOnlyPackContentStore(
      tampering(collection, (d) =>
        d.version === '1.1.0' ? { ...d, marjaId: 'test-other-marja' } : d,
      ),
    );
    expect(await mixed.marjaOfPack('test-governed-pack')).toEqual({
      ok: false,
      error: 'INTEGRITY_FAILURE',
    });
  });

  it('fails closed without a database', async () => {
    const store = appendOnlyPackContentStore(
      unavailableAppendOnlyCollection(COLLECTIONS.rulePackContents),
    );
    expect(await store.load(RECORD, 'SUBMITTED', 'a'.repeat(64))).toEqual({ kind: 'UNAVAILABLE' });
    expect(await store.store(entry(pack()))).toBe('UNAVAILABLE');
    expect(await store.versions()).toEqual({ ok: false, error: 'UNAVAILABLE' });
  });
});
