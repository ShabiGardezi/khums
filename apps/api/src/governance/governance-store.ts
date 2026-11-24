import { appendAuditEvent, type AuditAppendError } from '@khums/core';
import type { AuditEvent, AuditEventDraft } from '@khums/shared-types';
import type { Result } from '@khums/utils';
import type { Db, MongoClient } from 'mongodb';

import { appendOnlyAuditEventStore } from '../audit/audit-event.store';
import {
  inMemoryAppendOnlyCollection,
  unavailableAppendOnlyCollection,
  type AppendOnlyCollection,
} from '../persistence/append-only-collection';
import { COLLECTIONS } from '../persistence/collections';
import { mongoAppendOnlyCollection } from '../persistence/mongo-append-only-collection';
import {
  mongoUnitOfWork,
  sequentialUnitOfWork,
  type UnitOfWork,
} from '../persistence/unit-of-work';
import {
  appendOnlyGovernanceLedgerStore,
  type GovernanceLedgerStore,
} from './governance-ledger.store';
import {
  appendOnlyGovernancePolicyStore,
  type GovernancePolicyStore,
} from './governance-policy.store';
import { appendOnlyPackContentStore, type PackContentStore } from './pack-content.store';

/**
 * Everything one governance change writes (M4.6.4a), bound to one unit of work: the pack's ledger,
 * its write-once content, the policy registry and the audit chain. With MongoDB a command's ledger
 * record, its content and its audit event commit in one transaction or not at all; a lost race for
 * a ledger, registry or audit sequence (or a content binding) retries the whole unit of work, which
 * re-reads the ledger and then refuses a stale `expectedSequence`.
 */
export interface GovernanceStores {
  readonly ledgers: GovernanceLedgerStore;
  readonly contents: PackContentStore;
  readonly policies: GovernancePolicyStore;
  /** Appends one event to the shared, hash-chained audit log. */
  audit(draft: AuditEventDraft): Promise<Result<AuditEvent, AuditAppendError>>;
}

export interface GovernanceStore {
  /** For reads outside a unit of work (listings, ledger views, the audit log). */
  readonly stores: GovernanceStores;
  readonly audit: AppendOnlyCollection;
  /** Whether a durable store backs this process (production requires it). */
  readonly durable: boolean;
  readonly atomically: UnitOfWork<GovernanceStores>;
}

export const GOVERNANCE_STORE = Symbol('GOVERNANCE_STORE');

export function governanceStoresOver(
  ledgers: AppendOnlyCollection,
  contents: AppendOnlyCollection,
  policies: GovernancePolicyStore,
  audit: AppendOnlyCollection,
): GovernanceStores {
  const auditStore = appendOnlyAuditEventStore(audit);
  return {
    ledgers: appendOnlyGovernanceLedgerStore(ledgers),
    contents: appendOnlyPackContentStore(contents),
    policies,
    audit: (draft) => appendAuditEvent(auditStore, draft),
  };
}

/**
 * DEVELOPMENT/TEST ONLY: process memory, sharing the in-memory audit collection (one audit chain)
 * and the selected policy store. Operations run in order without rollback.
 */
export function inMemoryGovernanceStore(
  audit: AppendOnlyCollection,
  policies: GovernancePolicyStore,
): GovernanceStore {
  const stores = governanceStoresOver(
    inMemoryAppendOnlyCollection(COLLECTIONS.governanceLedgerRecords),
    inMemoryAppendOnlyCollection(COLLECTIONS.rulePackContents),
    policies,
    audit,
  );
  return { stores, audit, durable: false, atomically: sequentialUnitOfWork(stores) };
}

/** Production without a database: every governance operation fails closed. */
export function unavailableGovernanceStore(policies: GovernancePolicyStore): GovernanceStore {
  const audit = unavailableAppendOnlyCollection(COLLECTIONS.auditEvents);
  const stores = governanceStoresOver(
    unavailableAppendOnlyCollection(COLLECTIONS.governanceLedgerRecords),
    unavailableAppendOnlyCollection(COLLECTIONS.rulePackContents),
    policies,
    audit,
  );
  return { stores, audit, durable: false, atomically: sequentialUnitOfWork(stores) };
}

/**
 * The governance stores over MongoDB, bound to `session` when given (one transaction). Also used
 * by the rule builder's verification unit of work (decision 67), so a verification, its builder
 * pack's ledger records, content and audit events commit together.
 */
export function mongoGovernanceStores(
  db: Db,
  session?: Parameters<typeof mongoAppendOnlyCollection>[2],
): GovernanceStores {
  const policies = mongoAppendOnlyCollection(db, COLLECTIONS.governancePolicyRegistry, session, [
    'sequence_unique',
  ]);
  return governanceStoresOver(
    mongoAppendOnlyCollection(db, COLLECTIONS.governanceLedgerRecords, session, [
      'ledger_sequence_unique',
    ]),
    mongoAppendOnlyCollection(db, COLLECTIONS.rulePackContents, session, ['record_kind_unique']),
    appendOnlyGovernancePolicyStore(policies),
    mongoAppendOnlyCollection(db, COLLECTIONS.auditEvents, session, ['sequence_unique']),
  );
}

export function mongoGovernanceStore(
  db: Db,
  client: MongoClient = db.client,
  /** TEST ONLY: wraps the transaction-bound stores (failure injection in live tests). */
  wrap: (stores: GovernanceStores) => GovernanceStores = (s) => s,
): GovernanceStore {
  const bind = (session?: Parameters<typeof mongoAppendOnlyCollection>[2]) =>
    mongoGovernanceStores(db, session);
  return {
    stores: bind(),
    audit: mongoAppendOnlyCollection(db, COLLECTIONS.auditEvents),
    durable: true,
    atomically: mongoUnitOfWork(client, (session) => wrap(bind(session))),
  };
}
