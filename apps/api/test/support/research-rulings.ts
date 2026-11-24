import { appendResearchRevision, formatUuidV7, researchDisplayRef } from '@khums/core';
import type { ResearchChain, ResearchEntityType, ResearchReference } from '@khums/shared-types';

import type { ResearchAnchors, ResearchStore } from '../../src/research/research-store';

/**
 * SYNTHETIC, fully sourced research chains for rule-pack tests (M5.3.6): source → passage →
 * finding → ruling, built with the production chain functions so every record verifies.
 * Placeholder content only: no real source, excerpt, finding or ruling.
 */

/** The fixed ruling the governance test pack's rule references (`TEST_RULING_REF`). */
export const TEST_RULING_ID = formatUuidV7(
  Date.parse('2026-11-22T00:00:00.000Z'),
  new Uint8Array([0x80, 0, 0, 0, 0, 0, 0, 0, 0, 1]),
);
export const TEST_RULING_REF = `${TEST_RULING_ID}@1`;

/**
 * A fixed synthetic ruling id per test Marja (packs re-bound to another Marja must cite a ruling of
 * THAT Marja). The governance test pack's own Marja maps to `TEST_RULING_ID`.
 */
export function testRulingIdFor(marjaId: string): string {
  if (marjaId === 'test-marja') return TEST_RULING_ID;
  const bytes = new Uint8Array(10);
  bytes[0] = 0x80;
  for (let i = 0; i < marjaId.length; i += 1) {
    const at = 2 + (i % 8);
    bytes[at] = ((bytes[at] ?? 0) + marjaId.charCodeAt(i) * (i + 1)) % 256;
  }
  return formatUuidV7(Date.parse('2026-11-22T00:00:01.000Z'), bytes);
}

let seq = 0;
const nextId = () => {
  seq += 1;
  const bytes = new Uint8Array(10);
  bytes[0] = 0x90;
  bytes[8] = seq >> 8;
  bytes[9] = seq;
  return formatUuidV7(Date.parse('2026-11-22T00:00:02.000Z') + seq, bytes);
};
const step = (
  kind: string,
  payload: Record<string, unknown> | null,
  refs: ResearchReference[],
) => ({
  kind: kind as 'CREATED',
  payload,
  references: refs,
  aiInvolvement: [],
  actor: { kind: 'STAFF_PRINCIPAL' as const, subject: 'test-scholar' },
  recordedAt: '2026-11-22T00:00:00.000Z',
  reason: ['WITHDRAWN', 'DRAFT_DELETED', 'DISPUTED'].includes(kind) ? 'TEST reason' : null,
  decisionId: `d-test-${kind}`,
  requestId: `test-research-${kind}`,
});
const refTo = (chain: ResearchChain, revision: number): ResearchReference => ({
  entityType: chain.entityType,
  entityId: chain.entityId,
  revision,
  rulingVersion: chain.records[0]?.rulingVersion ?? null,
  marjaId: chain.records[0]?.marjaId ?? '',
});

function created(
  entityType: ResearchEntityType,
  marjaId: string,
  payload: Record<string, unknown>,
  refs: ResearchReference[],
  entityId = nextId(),
): ResearchChain {
  const question =
    entityType === 'FINDING'
      ? { id: 'INC-01', catalogueRevision: 'research-matrix-rev5-required' }
      : null;
  const made = appendResearchRevision(
    null,
    {
      entityType,
      entityId,
      displayRef: researchDisplayRef(entityType, marjaId, entityId, question?.id ?? null),
      marjaId,
      rulingVersion: entityType === 'RULING' ? 1 : null,
      rulingSeriesId: entityType === 'RULING' ? entityId : null,
      question,
    },
    step('CREATED', payload, refs),
  );
  if (!made.ok) throw new Error(made.error);
  return made.value.chain;
}

function anchorsOf(chain: ResearchChain): ResearchAnchors {
  const first = chain.records[0];
  const ref = first?.references[0];
  switch (chain.entityType) {
    case 'PASSAGE':
      return { sourceId: ref?.entityId ?? '' };
    case 'FINDING':
      return { questionId: first?.question?.id ?? '' };
    case 'RULING':
      return { rulingVersion: 1, rulingSeriesId: chain.entityId };
    case 'SOURCE':
    case 'TRANSLATION':
      return {};
  }
}

function transitioned(chain: ResearchChain, kind: string): ResearchChain {
  const next = appendResearchRevision(chain, null, step(kind, null, []));
  if (!next.ok) throw new Error(next.error);
  return next.value.chain;
}

/** Stores the records of `chain` beyond those already stored (append-only, revision by revision). */
export async function storeChain(store: ResearchStore, chain: ResearchChain): Promise<void> {
  const stores = {
    SOURCE: store.stores.sources,
    PASSAGE: store.stores.passages,
    TRANSLATION: store.stores.translations,
    FINDING: store.stores.findings,
    RULING: store.stores.rulings,
  }[chain.entityType];
  const loaded = await stores.load(chain.entityId);
  const from = loaded.kind === 'FOUND' ? loaded.value.records.length : 0;
  for (let i = from; i < chain.records.length; i += 1) {
    const result = await stores.append(
      i,
      { ...chain, records: chain.records.slice(0, i + 1) },
      anchorsOf(chain),
    );
    if (result !== 'APPLIED') throw new Error(`research chain not stored: ${result}`);
  }
}

/** Appends transitions (e.g. ['WITHDRAWN'], ['DISPUTED']) to any stored chain and stores them. */
export async function advanceRuling(
  store: ResearchStore,
  chain: ResearchChain,
  kinds: readonly string[],
): Promise<ResearchChain> {
  let next = chain;
  for (const kind of kinds) {
    const appended = appendResearchRevision(next, null, step(kind, null, []));
    if (!appended.ok) throw new Error(appended.error);
    next = appended.value.chain;
  }
  await storeChain(store, next);
  return next;
}

/**
 * Seeds a sourced ruling version 1 of `marjaId` (source → passage → finding → ruling) taken
 * through `kinds` (default: approved), and returns every chain. The finding is VERIFIED
 * (decision 69: a source-verified rule needs its findings VERIFIED or APPROVED).
 */
export async function seedSourcedRulingChains(
  store: ResearchStore,
  marjaId: string,
  options: { readonly kinds?: readonly string[]; readonly rulingId?: string } = {},
): Promise<{
  readonly source: ResearchChain;
  readonly passage: ResearchChain;
  readonly finding: ResearchChain;
  readonly ruling: ResearchChain;
}> {
  // Evidence is VERIFIED (D14), even though the ruling itself may stay a draft.
  const source = transitioned(
    created(
      'SOURCE',
      marjaId,
      {
        title: { original: 'TEST synthetic source', translation: null },
        copyright: 'EXCERPTS_ONLY',
      },
      [],
    ),
    'VERIFIED',
  );
  const passage = transitioned(
    created(
      'PASSAGE',
      marjaId,
      { locator: { page: '1' }, originalLanguage: 'ar', text: 'TEST synthetic excerpt' },
      [refTo(source, 1)],
    ),
    'VERIFIED',
  );
  const finding = transitioned(
    created('FINDING', marjaId, { conclusion: 'TEST synthetic finding' }, [refTo(passage, 1)]),
    'VERIFIED',
  );
  const ruling = created(
    'RULING',
    marjaId,
    { conclusion: 'TEST synthetic ruling' },
    [refTo(finding, 0), refTo(passage, 1)],
    options.rulingId,
  );
  for (const chain of [source, passage, finding, ruling]) await storeChain(store, chain);
  return {
    source,
    passage,
    finding,
    ruling: await advanceRuling(store, ruling, options.kinds ?? ['APPROVED']),
  };
}

/** `seedSourcedRulingChains`, returning only the ruling chain. */
export async function seedSourcedRuling(
  store: ResearchStore,
  marjaId: string,
  options: { readonly kinds?: readonly string[]; readonly rulingId?: string } = {},
): Promise<ResearchChain> {
  return (await seedSourcedRulingChains(store, marjaId, options)).ruling;
}

/**
 * Seeds one SYNTHETIC source of `marjaId`, DRAFT (unverified) unless `verified`. Returns the chain;
 * `verifyStoredSource` later appends and stores its VERIFIED record (Phase 2 step 5 tests).
 */
export async function seedSource(
  store: ResearchStore,
  marjaId: string,
  verified = false,
): Promise<ResearchChain> {
  const draft = created(
    'SOURCE',
    marjaId,
    {
      title: { original: 'TEST synthetic extra source', translation: null },
      copyright: 'EXCERPTS_ONLY',
    },
    [],
  );
  const chain = verified ? transitioned(draft, 'VERIFIED') : draft;
  await storeChain(store, chain);
  return chain;
}

/** Appends and stores the VERIFIED transition of a stored DRAFT source. */
export async function verifyStoredSource(
  store: ResearchStore,
  chain: ResearchChain,
): Promise<ResearchChain> {
  const next = transitioned(chain, 'VERIFIED');
  await storeChain(store, next);
  return next;
}
