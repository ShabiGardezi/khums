import { appendAuditEvent, type AuditAppendError } from '@khums/core';
import type {
  AuditEvent,
  AuditEventDraft,
  EvidenceArtefact,
  ResearchChain,
  ResearchEntityType,
  ResearchRevisionRecord,
} from '@khums/shared-types';
import { err, ok, type Result } from '@khums/utils';
import { evidenceArtefactSchema, researchRevisionRecordSchema } from '@khums/validation';
import type { ClientSession, Db, MongoClient } from 'mongodb';

import { appendOnlyAuditEventStore } from '../audit/audit-event.store';
import {
  inMemoryAppendOnlyCollection,
  unavailableAppendOnlyCollection,
  type AppendOnlyCollection,
} from '../persistence/append-only-collection';
import { COLLECTIONS } from '../persistence/collections';
import type { LookupResult } from '../persistence/lookup-result';
import { mongoAppendOnlyCollection } from '../persistence/mongo-append-only-collection';
import {
  mongoUnitOfWork,
  sequentialUnitOfWork,
  type UnitOfWork,
} from '../persistence/unit-of-work';

/**
 * Storage for scholar research (M5.3.3), on append-only collections bound to one unit of work: a
 * research revision (or an evidence artefact) and its audit event commit together or not at all.
 * Chains are verified by `@khums/core` on every read; documents are never trusted as shaped.
 *
 * Revision documents keep the exact record as `recordJson` (canonical JSON round-trip, no BSON
 * type drift, no field-name restrictions on payload keys); the other fields are index copies,
 * cross-checked against the record on every load.
 */

/** Index copies a passage or translation carries (its immutable binding). */
export type ResearchAnchors =
  | Readonly<Record<string, never>>
  | { readonly sourceId: string }
  | { readonly passageId: string; readonly language: string }
  | { readonly questionId: string }
  | { readonly rulingVersion: number; readonly rulingSeriesId: string };

export interface ResearchEntityRef {
  readonly entityId: string;
  readonly marjaId: string;
}

export type AppendResult =
  | 'APPLIED'
  /** Another writer stored this revision first (or the chain moved on). */
  | 'CONFLICT'
  /** Revision 0 collided with an existing id or display reference: draw a new UUIDv7. */
  | 'COLLISION'
  | 'UNAVAILABLE';

export interface ResearchChainStore {
  readonly entityType: ResearchEntityType;
  /** `NOT_FOUND` when no chain has this id. */
  load(entityId: string): Promise<LookupResult<ResearchChain>>;
  /**
   * Stores the last record of `next` only if the stored chain has exactly `expectedLength`
   * records and the record links to the stored head (no forks, no gaps).
   */
  append(
    expectedLength: number,
    next: ResearchChain,
    anchors: ResearchAnchors,
  ): Promise<AppendResult>;
  /** Entities (from their revision-0 documents), optionally of one Marja, oldest first. */
  entities(marjaId?: string): Promise<Result<readonly ResearchEntityRef[], 'UNAVAILABLE'>>;
  /**
   * Rulings (M5.3.5): every version chain of one series, found by the `rulingSeriesId` index copy.
   * Untrusted: core replays the series and checks every record's own series binding.
   */
  seriesVersions(seriesId: string): Promise<Result<readonly ResearchChain[], 'UNAVAILABLE'>>;
}

export type EvidenceInsertResult = 'STORED' | 'DUPLICATE_DIGEST' | 'CONFLICT' | 'UNAVAILABLE';

export interface EvidenceArtefactStore {
  insert(artefact: EvidenceArtefact): Promise<EvidenceInsertResult>;
  get(artefactId: string): Promise<LookupResult<EvidenceArtefact>>;
  byDigest(marjaId: string, digest: string): Promise<LookupResult<EvidenceArtefact>>;
  bySource(sourceId: string): Promise<Result<readonly EvidenceArtefact[], 'UNAVAILABLE'>>;
  /** Every artefact (verification and backup drills). */
  all(): Promise<Result<readonly EvidenceArtefact[], 'UNAVAILABLE'>>;
}

export interface ResearchStores {
  readonly sources: ResearchChainStore;
  readonly passages: ResearchChainStore;
  readonly translations: ResearchChainStore;
  readonly findings: ResearchChainStore;
  readonly rulings: ResearchChainStore;
  readonly evidence: EvidenceArtefactStore;
  audit(draft: AuditEventDraft): Promise<Result<AuditEvent, AuditAppendError>>;
}

export interface ResearchStore {
  readonly stores: ResearchStores;
  readonly durable: boolean;
  readonly atomically: UnitOfWork<ResearchStores>;
}

export const RESEARCH_STORE = Symbol('RESEARCH_STORE');

const BY_REVISION = { sort: { field: 'revision', direction: 1 } } as const;

interface RevisionDocument {
  readonly entityType: string;
  readonly entityId: string;
  readonly revision: number;
  readonly recordId: string;
  readonly marjaId: string;
  readonly displayRef: string;
  readonly kind: string;
  readonly recordedAt: string;
  readonly recordDigest: string;
  readonly recordJson: string;
}

/** Parses one stored revision; null when the document and its record disagree (fail closed). */
function recordOf(raw: unknown): ResearchRevisionRecord | null {
  const doc = raw as Partial<RevisionDocument> | null;
  if (doc === null || typeof doc.recordJson !== 'string') return null;
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(doc.recordJson);
  } catch {
    return null;
  }
  const record = researchRevisionRecordSchema.safeParse(parsedJson);
  if (!record.success) return null;
  const r = record.data;
  return r.entityType === doc.entityType &&
    r.entityId === doc.entityId &&
    r.revision === doc.revision &&
    r.recordId === doc.recordId &&
    r.marjaId === doc.marjaId &&
    r.displayRef === doc.displayRef &&
    r.kind === doc.kind &&
    r.recordedAt === doc.recordedAt &&
    r.recordDigest === doc.recordDigest
    ? r
    : null;
}

export function researchChainStore(
  collection: AppendOnlyCollection,
  entityType: ResearchEntityType,
): ResearchChainStore {
  const recordAt = async (entityId: string, revision: number) => {
    const found = await collection.find({ entityId, revision }, { ...BY_REVISION, limit: 1 });
    if (!found.ok) return err('UNAVAILABLE' as const);
    const [doc] = found.value;
    if (doc === undefined) return ok(null);
    const record = recordOf(doc);
    return record === null ? err('UNAVAILABLE' as const) : ok(record);
  };
  const load = async (entityId: string): Promise<LookupResult<ResearchChain>> => {
    const found = await collection.find({ entityId }, BY_REVISION);
    if (!found.ok) return { kind: 'UNAVAILABLE' };
    if (found.value.length === 0) return { kind: 'NOT_FOUND' };
    const records: ResearchRevisionRecord[] = [];
    for (const doc of found.value) {
      const record = recordOf(doc);
      if (record?.entityType !== entityType) return { kind: 'UNAVAILABLE' };
      records.push(record);
    }
    return { kind: 'FOUND', value: { entityType, entityId, records } };
  };
  return {
    entityType,
    seriesVersions: async (seriesId) => {
      const found = await collection.find({ rulingSeriesId: seriesId, revision: 0 }, BY_REVISION);
      if (!found.ok) return err('UNAVAILABLE');
      const chains: ResearchChain[] = [];
      for (const doc of found.value) {
        const record = recordOf(doc);
        if (record === null) return err('UNAVAILABLE');
        const chain = await load(record.entityId);
        if (chain.kind !== 'FOUND') return err('UNAVAILABLE');
        chains.push(chain.value);
      }
      return ok(chains);
    },
    load,
    append: async (expectedLength, next, anchors) => {
      const record = next.records[expectedLength];
      if (
        record === undefined ||
        next.records.length !== expectedLength + 1 ||
        record.revision !== expectedLength ||
        record.entityId !== next.entityId ||
        record.entityType !== entityType
      ) {
        return 'CONFLICT';
      }
      if (expectedLength > 0) {
        const previous = await recordAt(next.entityId, expectedLength - 1);
        if (!previous.ok) return 'UNAVAILABLE';
        if (previous.value?.recordDigest !== record.previousRecordDigest) return 'CONFLICT';
      }
      const outcome = await collection.insert({
        entityType: record.entityType,
        entityId: record.entityId,
        revision: record.revision,
        recordId: record.recordId,
        marjaId: record.marjaId,
        displayRef: record.displayRef,
        kind: record.kind,
        recordedAt: record.recordedAt,
        recordDigest: record.recordDigest,
        previousRecordDigest: record.previousRecordDigest,
        ...anchors,
        recordJson: JSON.stringify(record),
      });
      if (outcome.kind === 'INSERTED') return 'APPLIED';
      if (outcome.kind === 'UNAVAILABLE') return 'UNAVAILABLE';
      return expectedLength === 0 ? 'COLLISION' : 'CONFLICT';
    },
    entities: async (marjaId) => {
      const found = await collection.find(
        marjaId === undefined ? { revision: 0 } : { revision: 0, marjaId },
        { sort: { field: 'recordedAt', direction: 1 } },
      );
      if (!found.ok) return err('UNAVAILABLE');
      const refs: ResearchEntityRef[] = [];
      for (const doc of found.value) {
        const record = recordOf(doc);
        if (record?.entityType !== entityType) return err('UNAVAILABLE');
        refs.push({ entityId: record.entityId, marjaId: record.marjaId });
      }
      return ok(refs);
    },
  };
}

function evidenceStore(collection: AppendOnlyCollection): EvidenceArtefactStore {
  const parseAll = (docs: readonly unknown[]) => {
    const artefacts: EvidenceArtefact[] = [];
    for (const doc of docs) {
      const parsed = evidenceArtefactSchema.safeParse(doc);
      if (!parsed.success) return null;
      artefacts.push(parsed.data);
    }
    return artefacts;
  };
  const one = async (filter: Readonly<Record<string, string>>) => {
    const found = await collection.find(filter, {
      sort: { field: 'artefactId', direction: 1 },
      limit: 1,
    });
    if (!found.ok) return { kind: 'UNAVAILABLE' } as const;
    const parsed = parseAll(found.value);
    if (parsed === null) return { kind: 'UNAVAILABLE' } as const;
    const [first] = parsed;
    return first === undefined
      ? ({ kind: 'NOT_FOUND' } as const)
      : ({ kind: 'FOUND', value: first } as const);
  };
  const many = async (filter: Readonly<Record<string, string>>) => {
    const found = await collection.find(filter, { sort: { field: 'recordedAt', direction: 1 } });
    if (!found.ok) return err('UNAVAILABLE' as const);
    const parsed = parseAll(found.value);
    return parsed === null ? err('UNAVAILABLE' as const) : ok(parsed);
  };
  return {
    insert: async (artefact) => {
      const outcome = await collection.insert({ ...artefact });
      if (outcome.kind === 'INSERTED') return 'STORED';
      if (outcome.kind === 'UNAVAILABLE') return 'UNAVAILABLE';
      return outcome.index === 'marja_digest_unique' ? 'DUPLICATE_DIGEST' : 'CONFLICT';
    },
    get: (artefactId) => one({ artefactId }),
    byDigest: (marjaId, digest) => one({ marjaId, digest }),
    bySource: (sourceId) => many({ sourceId }),
    all: () => many({}),
  };
}

export interface ResearchCollections {
  readonly sources: AppendOnlyCollection;
  readonly passages: AppendOnlyCollection;
  readonly translations: AppendOnlyCollection;
  readonly findings: AppendOnlyCollection;
  readonly rulings: AppendOnlyCollection;
  readonly evidence: AppendOnlyCollection;
  readonly audit: AppendOnlyCollection;
}

export function researchStoresOver(c: ResearchCollections): ResearchStores {
  const auditStore = appendOnlyAuditEventStore(c.audit);
  return {
    sources: researchChainStore(c.sources, 'SOURCE'),
    passages: researchChainStore(c.passages, 'PASSAGE'),
    translations: researchChainStore(c.translations, 'TRANSLATION'),
    findings: researchChainStore(c.findings, 'FINDING'),
    rulings: researchChainStore(c.rulings, 'RULING'),
    evidence: evidenceStore(c.evidence),
    audit: (draft) => appendAuditEvent(auditStore, draft),
  };
}

/** DEVELOPMENT/TEST ONLY: process memory, sharing the audit collection given. */
export function inMemoryResearchCollections(audit: AppendOnlyCollection): ResearchCollections {
  return {
    sources: inMemoryAppendOnlyCollection(COLLECTIONS.researchSources),
    passages: inMemoryAppendOnlyCollection(COLLECTIONS.sourcePassages),
    translations: inMemoryAppendOnlyCollection(COLLECTIONS.passageTranslations),
    findings: inMemoryAppendOnlyCollection(COLLECTIONS.researchFindings),
    rulings: inMemoryAppendOnlyCollection(COLLECTIONS.religiousRulings),
    evidence: inMemoryAppendOnlyCollection(COLLECTIONS.evidenceArtefacts),
    audit,
  };
}

export function inMemoryResearchStore(audit: AppendOnlyCollection): ResearchStore {
  const stores = researchStoresOver(inMemoryResearchCollections(audit));
  return { stores, durable: false, atomically: sequentialUnitOfWork(stores) };
}

/** Production without a database: every research operation fails closed. */
export function unavailableResearchStore(): ResearchStore {
  const stores = researchStoresOver({
    sources: unavailableAppendOnlyCollection(COLLECTIONS.researchSources),
    passages: unavailableAppendOnlyCollection(COLLECTIONS.sourcePassages),
    translations: unavailableAppendOnlyCollection(COLLECTIONS.passageTranslations),
    findings: unavailableAppendOnlyCollection(COLLECTIONS.researchFindings),
    rulings: unavailableAppendOnlyCollection(COLLECTIONS.religiousRulings),
    evidence: unavailableAppendOnlyCollection(COLLECTIONS.evidenceArtefacts),
    audit: unavailableAppendOnlyCollection(COLLECTIONS.auditEvents),
  });
  return { stores, durable: false, atomically: sequentialUnitOfWork(stores) };
}

/** Revision-chain indexes whose duplicates mean "another writer won": retry the whole unit. */
const CHAIN_CONFLICTS = [
  'entity_revision_unique',
  'recordId_unique',
  'displayRef_revision_unique',
  'series_version_revision_unique',
] as const;

/**
 * MongoDB: one multi-document transaction per unit of work. A duplicate on a chain index (a
 * concurrent writer stored that revision, or a revision-0 id collision) aborts and retries the
 * WHOLE unit, which re-reads the chain: the retry then answers `REVISION_CONFLICT` for a stale
 * `expectedRevision`, or draws a fresh UUIDv7 for a creation.
 */
export function mongoResearchStore(
  db: Db,
  client: MongoClient = db.client,
  /** TEST ONLY: wraps the transaction-bound stores (failure injection in live tests). */
  wrap: (stores: ResearchStores) => ResearchStores = (s) => s,
): ResearchStore {
  const bind = (session?: ClientSession) =>
    researchStoresOver({
      sources: mongoAppendOnlyCollection(db, COLLECTIONS.researchSources, session, [
        ...CHAIN_CONFLICTS,
      ]),
      passages: mongoAppendOnlyCollection(db, COLLECTIONS.sourcePassages, session, [
        ...CHAIN_CONFLICTS,
      ]),
      translations: mongoAppendOnlyCollection(db, COLLECTIONS.passageTranslations, session, [
        ...CHAIN_CONFLICTS,
      ]),
      findings: mongoAppendOnlyCollection(db, COLLECTIONS.researchFindings, session, [
        ...CHAIN_CONFLICTS,
      ]),
      rulings: mongoAppendOnlyCollection(db, COLLECTIONS.religiousRulings, session, [
        ...CHAIN_CONFLICTS,
      ]),
      evidence: mongoAppendOnlyCollection(db, COLLECTIONS.evidenceArtefacts, session, [
        'artefactId_unique',
      ]),
      audit: mongoAppendOnlyCollection(db, COLLECTIONS.auditEvents, session, ['sequence_unique']),
    });
  return {
    stores: bind(),
    durable: true,
    atomically: mongoUnitOfWork(client, (session) => wrap(bind(session))),
  };
}

/**
 * Loads every research chain reachable from `starts` (breadth first over each record's
 * references; at most 2000 chains). A start may name several candidate types (a builder rule's
 * `sourceRefs` are sources or passages): the first type that has the id is used. Missing ids are
 * skipped (core then reports them); a store failure is `UNAVAILABLE`.
 */
export async function loadResearchProvenance(
  stores: ResearchStores,
  starts: readonly { readonly types: readonly ResearchEntityType[]; readonly id: string }[],
): Promise<Result<ReadonlyMap<string, ResearchChain>, 'UNAVAILABLE'>> {
  const byType: Readonly<Record<ResearchEntityType, ResearchChainStore>> = {
    SOURCE: stores.sources,
    PASSAGE: stores.passages,
    TRANSLATION: stores.translations,
    FINDING: stores.findings,
    RULING: stores.rulings,
  };
  const loaded = new Map<string, ResearchChain>();
  const queue = starts.map((s) => ({ types: s.types, id: s.id }));
  while (queue.length > 0 && loaded.size < 2000) {
    const next = queue.shift();
    if (next === undefined || loaded.has(next.id)) continue;
    for (const type of next.types) {
      const found = await byType[type].load(next.id);
      if (found.kind === 'UNAVAILABLE') return err('UNAVAILABLE');
      if (found.kind !== 'FOUND') continue;
      loaded.set(next.id, found.value);
      for (const record of found.value.records) {
        for (const reference of record.references) {
          if (!loaded.has(reference.entityId)) {
            queue.push({ types: [reference.entityType], id: reference.entityId });
          }
        }
      }
      break;
    }
  }
  return ok(loaded);
}

/**
 * Every research chain a set of rulings depends on (M5.3.6 provenance): the rulings themselves and,
 * following references, their findings, passages, translations and sources. Bounded by what the
 * records reference; core replays and checks everything it uses.
 */
export async function loadRulingProvenance(
  stores: ResearchStores,
  rulingIds: readonly string[],
): Promise<Result<ReadonlyMap<string, ResearchChain>, 'UNAVAILABLE'>> {
  const byType: Readonly<Record<ResearchEntityType, ResearchChainStore>> = {
    SOURCE: stores.sources,
    PASSAGE: stores.passages,
    TRANSLATION: stores.translations,
    FINDING: stores.findings,
    RULING: stores.rulings,
  };
  const loaded = new Map<string, ResearchChain>();
  const queue: { type: ResearchEntityType; id: string }[] = rulingIds.map((id) => ({
    type: 'RULING',
    id,
  }));
  while (queue.length > 0 && loaded.size < 2000) {
    const next = queue.shift();
    if (next === undefined || loaded.has(next.id)) continue;
    const found = await byType[next.type].load(next.id);
    if (found.kind === 'UNAVAILABLE') return err('UNAVAILABLE');
    if (found.kind !== 'FOUND') continue;
    loaded.set(next.id, found.value);
    for (const record of found.value.records) {
      for (const reference of record.references) {
        if (!loaded.has(reference.entityId)) {
          queue.push({ type: reference.entityType, id: reference.entityId });
        }
      }
    }
  }
  return ok(loaded);
}
