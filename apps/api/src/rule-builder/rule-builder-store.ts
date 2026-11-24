import {
  appendAuditEvent,
  replayRuleRevisions,
  ruleRequestViews,
  type AuditAppendError,
  type RuleRequestView,
} from '@khums/core';
import type { AuditEvent, AuditEventDraft } from '@khums/shared-types';
import { err, ok, type Result } from '@khums/utils';
import {
  ruleVerificationRecordSchema,
  type RuleRequestRecord,
  type RuleVerificationRecord,
  type ScholarRuleRevision,
} from '@khums/validation';
import type { ClientSession, Db, MongoClient } from 'mongodb';

import { appendOnlyAuditEventStore } from '../audit/audit-event.store';
import {
  mongoGovernanceStores,
  type GovernanceStore,
  type GovernanceStores,
} from '../governance/governance-store';
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
 * Storage for scholar rule builder revisions (Phase 2 step 3) on the append-only
 * `scholarRuleRevisions` collection, bound to one unit of work with the audit chain: a revision
 * and its audit event commit together or not at all. Documents are never trusted as shaped: each
 * record is parsed from `recordJson`, cross-checked with its index copies and replayed by
 * `@khums/core` (contiguous revisions of one rule of one Marja).
 */

export type RevisionAppendResult = 'APPLIED' | 'CONFLICT' | 'UNAVAILABLE';

export interface RuleRevisionStore {
  /** Every revision of one rule, oldest first; `NOT_FOUND` when the rule does not exist. */
  history(ruleId: string): Promise<LookupResult<readonly ScholarRuleRevision[]>>;
  /** Every rule of one Marja with its revisions (oldest first), ordered by rule id. */
  ofMarja(
    marjaId: string,
  ): Promise<Result<readonly (readonly ScholarRuleRevision[])[], 'UNAVAILABLE'>>;
  /** Stores one new revision; `CONFLICT` when that revision number already exists. */
  append(record: ScholarRuleRevision): Promise<RevisionAppendResult>;
}

/** Source verifications (decision 67): append-only, one document per verification. */
export interface RuleVerificationStore {
  /** Every verification of one Marja's rules, oldest first. */
  ofMarja(marjaId: string): Promise<Result<readonly RuleVerificationRecord[], 'UNAVAILABLE'>>;
  /** Stores one verification; `CONFLICT` when its id already exists with other content. */
  append(record: RuleVerificationRecord): Promise<RevisionAppendResult>;
}

/** Scholar requests (Phase 4): append-only, a request and at most one resolution. */
export interface RuleRequestStore {
  /** Every request of one Marja with its resolution, newest first (fails closed). */
  ofMarja(marjaId: string): Promise<Result<readonly RuleRequestView[], 'UNAVAILABLE'>>;
  /** Stores one record; `CONFLICT` when that request already has a record of this type. */
  append(record: RuleRequestRecord): Promise<RevisionAppendResult>;
}

export interface RuleBuilderStores {
  readonly revisions: RuleRevisionStore;
  readonly verifications: RuleVerificationStore;
  readonly requests: RuleRequestStore;
  /**
   * The governance stores bound to the SAME unit of work (decision 67): the automatic builder
   * publication writes its ledger records and pack content with the verification and audit.
   */
  readonly governance: GovernanceStores;
  audit(draft: AuditEventDraft): Promise<Result<AuditEvent, AuditAppendError>>;
}

export interface RuleBuilderStore {
  readonly stores: RuleBuilderStores;
  readonly durable: boolean;
  readonly atomically: UnitOfWork<RuleBuilderStores>;
}

export const RULE_BUILDER_STORE = Symbol('RULE_BUILDER_STORE');

interface RevisionDocument {
  readonly ruleId: string;
  readonly revision: number;
  readonly marjaId: string;
  readonly recordJson: string;
  readonly actor: string;
  readonly at: string;
  readonly reason: string;
}

const documentOf = (record: ScholarRuleRevision): RevisionDocument => ({
  ruleId: record.ruleId,
  revision: record.revision,
  marjaId: record.marjaId,
  recordJson: JSON.stringify(record),
  actor: record.actor,
  at: record.at,
  reason: record.reason,
});

/** The record of one document, or null when the document and its record disagree. */
function recordOf(raw: unknown): unknown {
  const doc = raw as Partial<RevisionDocument> | null;
  if (doc === null || typeof doc.recordJson !== 'string') return null;
  let record: unknown;
  try {
    record = JSON.parse(doc.recordJson);
  } catch {
    return null;
  }
  const r = record as Partial<ScholarRuleRevision> | null;
  return r !== null &&
    r.ruleId === doc.ruleId &&
    r.revision === doc.revision &&
    r.marjaId === doc.marjaId &&
    r.actor === doc.actor &&
    r.at === doc.at &&
    r.reason === doc.reason
    ? record
    : null;
}

const BY_REVISION = { sort: { field: 'revision', direction: 1 } } as const;

function revisionStore(collection: AppendOnlyCollection): RuleRevisionStore {
  const replay = (docs: readonly unknown[]) => {
    const records = docs.map(recordOf);
    return records.includes(null) ? null : replayRuleRevisions(records);
  };
  return {
    history: async (ruleId) => {
      const found = await collection.find({ ruleId }, BY_REVISION);
      if (!found.ok) return { kind: 'UNAVAILABLE' };
      if (found.value.length === 0) return { kind: 'NOT_FOUND' };
      const history = replay(found.value);
      return history === null ? { kind: 'UNAVAILABLE' } : { kind: 'FOUND', value: history };
    },
    ofMarja: async (marjaId) => {
      const found = await collection.find({ marjaId }, BY_REVISION);
      if (!found.ok) return err('UNAVAILABLE');
      const byRule = new Map<string, unknown[]>();
      for (const doc of found.value) {
        const ruleId = (doc as Partial<RevisionDocument> | null)?.ruleId;
        if (typeof ruleId !== 'string') return err('UNAVAILABLE');
        byRule.set(ruleId, [...(byRule.get(ruleId) ?? []), doc]);
      }
      const rules: (readonly ScholarRuleRevision[])[] = [];
      for (const ruleId of [...byRule.keys()].sort()) {
        const history = replay(byRule.get(ruleId) ?? []);
        if (history === null) return err('UNAVAILABLE');
        rules.push(history);
      }
      return ok(rules);
    },
    append: async (record) => {
      const outcome = await collection.insert(documentOf(record));
      if (outcome.kind === 'INSERTED') return 'APPLIED';
      if (outcome.kind === 'UNAVAILABLE') return 'UNAVAILABLE';
      // Idempotent retry: the identical revision is already stored.
      const stored = await collection.find(
        { ruleId: record.ruleId, revision: record.revision },
        { ...BY_REVISION, limit: 1 },
      );
      if (!stored.ok) return 'UNAVAILABLE';
      const [doc] = stored.value;
      return doc !== undefined &&
        recordOf(doc) !== null &&
        (doc as RevisionDocument).recordJson === documentOf(record).recordJson
        ? 'APPLIED'
        : 'CONFLICT';
    },
  };
}

interface VerificationDocument {
  readonly verificationId: string;
  readonly ruleId: string;
  readonly revision: number;
  readonly marjaId: string;
  readonly contentHash: string;
  readonly recordJson: string;
  readonly actor: string;
  readonly at: string;
}

const verificationDocumentOf = (record: RuleVerificationRecord): VerificationDocument => ({
  verificationId: record.verificationId,
  ruleId: record.ruleId,
  revision: record.revision,
  marjaId: record.marjaId,
  contentHash: record.contentHash,
  recordJson: JSON.stringify(record),
  actor: record.actor,
  at: record.at,
});

/** The validated record of one document, or null when the document and its record disagree. */
function verificationOf(raw: unknown): RuleVerificationRecord | null {
  const doc = raw as Partial<VerificationDocument> | null;
  if (doc === null || typeof doc.recordJson !== 'string') return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(doc.recordJson);
  } catch {
    return null;
  }
  const record = ruleVerificationRecordSchema.safeParse(parsed);
  if (!record.success) return null;
  const r = record.data;
  return r.verificationId === doc.verificationId &&
    r.ruleId === doc.ruleId &&
    r.revision === doc.revision &&
    r.marjaId === doc.marjaId &&
    r.contentHash === doc.contentHash &&
    r.actor === doc.actor &&
    r.at === doc.at
    ? r
    : null;
}

function verificationStore(collection: AppendOnlyCollection): RuleVerificationStore {
  return {
    ofMarja: async (marjaId) => {
      const found = await collection.find({ marjaId }, { sort: { field: 'at', direction: 1 } });
      if (!found.ok) return err('UNAVAILABLE');
      const records = found.value.map(verificationOf);
      // A document that fails validation is an integrity failure: fail closed.
      return records.some((r) => r === null)
        ? err('UNAVAILABLE')
        : ok(records.filter((r): r is RuleVerificationRecord => r !== null));
    },
    append: async (record) => {
      const outcome = await collection.insert(verificationDocumentOf(record));
      if (outcome.kind === 'INSERTED') return 'APPLIED';
      if (outcome.kind === 'UNAVAILABLE') return 'UNAVAILABLE';
      return 'CONFLICT';
    },
  };
}

interface RequestDocument {
  readonly requestId: string;
  readonly type: string;
  readonly marjaId: string;
  readonly recordJson: string;
  readonly actor: string;
  readonly at: string;
}

function requestStore(collection: AppendOnlyCollection): RuleRequestStore {
  return {
    ofMarja: async (marjaId) => {
      const found = await collection.find({ marjaId }, { sort: { field: 'at', direction: 1 } });
      if (!found.ok) return err('UNAVAILABLE');
      const records: unknown[] = [];
      for (const raw of found.value) {
        const doc = raw as Partial<RequestDocument> | null;
        if (doc === null || typeof doc.recordJson !== 'string') return err('UNAVAILABLE');
        let record: unknown;
        try {
          record = JSON.parse(doc.recordJson);
        } catch {
          return err('UNAVAILABLE');
        }
        const r = record as Partial<RuleRequestRecord> | null;
        if (
          r === null ||
          r.requestId !== doc.requestId ||
          r.type !== doc.type ||
          r.marjaId !== doc.marjaId ||
          r.actor !== doc.actor ||
          r.at !== doc.at
        ) {
          return err('UNAVAILABLE');
        }
        records.push(record);
      }
      const views = ruleRequestViews(marjaId, records);
      return views === null ? err('UNAVAILABLE') : ok(views);
    },
    append: async (record) => {
      const outcome = await collection.insert({
        requestId: record.requestId,
        type: record.type,
        marjaId: record.marjaId,
        recordJson: JSON.stringify(record),
        actor: record.actor,
        at: record.at,
      } satisfies RequestDocument);
      if (outcome.kind === 'INSERTED') return 'APPLIED';
      if (outcome.kind === 'UNAVAILABLE') return 'UNAVAILABLE';
      return 'CONFLICT';
    },
  };
}

export function ruleBuilderStoresOver(c: {
  readonly revisions: AppendOnlyCollection;
  readonly verifications: AppendOnlyCollection;
  readonly requests: AppendOnlyCollection;
  readonly governance: GovernanceStores;
  readonly audit: AppendOnlyCollection;
}): RuleBuilderStores {
  const auditStore = appendOnlyAuditEventStore(c.audit);
  return {
    revisions: revisionStore(c.revisions),
    verifications: verificationStore(c.verifications),
    requests: requestStore(c.requests),
    governance: c.governance,
    audit: (draft) => appendAuditEvent(auditStore, draft),
  };
}

/**
 * DEVELOPMENT/TEST ONLY: process memory, sharing the audit collection and the governance store
 * given (so builder ledgers are the ones the governance and public endpoints read).
 */
export function inMemoryRuleBuilderStore(
  audit: AppendOnlyCollection,
  governance: GovernanceStore,
): RuleBuilderStore {
  const stores = ruleBuilderStoresOver({
    revisions: inMemoryAppendOnlyCollection(COLLECTIONS.scholarRuleRevisions),
    verifications: inMemoryAppendOnlyCollection(COLLECTIONS.ruleVerificationRecords),
    requests: inMemoryAppendOnlyCollection(COLLECTIONS.scholarRuleRequests),
    governance: governance.stores,
    audit,
  });
  return { stores, durable: false, atomically: sequentialUnitOfWork(stores) };
}

/** Production without a database: every operation fails closed. */
export function unavailableRuleBuilderStore(governance: GovernanceStore): RuleBuilderStore {
  const stores = ruleBuilderStoresOver({
    revisions: unavailableAppendOnlyCollection(COLLECTIONS.scholarRuleRevisions),
    verifications: unavailableAppendOnlyCollection(COLLECTIONS.ruleVerificationRecords),
    requests: unavailableAppendOnlyCollection(COLLECTIONS.scholarRuleRequests),
    governance: governance.stores,
    audit: unavailableAppendOnlyCollection(COLLECTIONS.auditEvents),
  });
  return { stores, durable: false, atomically: sequentialUnitOfWork(stores) };
}

export function mongoRuleBuilderStore(db: Db, client: MongoClient = db.client): RuleBuilderStore {
  const bind = (session?: ClientSession) =>
    ruleBuilderStoresOver({
      revisions: mongoAppendOnlyCollection(db, COLLECTIONS.scholarRuleRevisions, session, [
        'rule_revision_unique',
      ]),
      verifications: mongoAppendOnlyCollection(db, COLLECTIONS.ruleVerificationRecords, session, [
        'verification_unique',
      ]),
      requests: mongoAppendOnlyCollection(db, COLLECTIONS.scholarRuleRequests, session, [
        'request_type_unique',
      ]),
      governance: mongoGovernanceStores(db, session),
      audit: mongoAppendOnlyCollection(db, COLLECTIONS.auditEvents, session, ['sequence_unique']),
    });
  return {
    stores: bind(),
    durable: true,
    atomically: mongoUnitOfWork(client, (session) => bind(session)),
  };
}
