import type { Db, MongoClient } from 'mongodb';

import {
  inMemoryAppendOnlyCollection,
  unavailableAppendOnlyCollection,
  type AppendOnlyCollection,
} from '../persistence/append-only-collection';
import { COLLECTIONS } from '../persistence/collections';
import {
  inMemoryControlledCollection,
  unavailableControlledCollection,
  type ControlledCollection,
} from '../persistence/controlled-collection';
import { mongoAppendOnlyCollection } from '../persistence/mongo-append-only-collection';
import { mongoControlledCollection } from '../persistence/mongo-controlled-collection';
import { mongoUnitOfWork, sequentialUnitOfWork } from '../persistence/unit-of-work';

/**
 * The collections staff authentication and administration use (M4.6.2b), and how several writes
 * are made atomic. With MongoDB, `atomically` runs inside a multi-document transaction (Atlas is a
 * replica set): an account change, its role record, session revocation and the audit event commit
 * together or not at all. In memory (development/test only) operations run in order without
 * rollback, so services make every refusal decision before their first write.
 */
export interface StaffCollections {
  readonly accounts: ControlledCollection;
  readonly sessions: ControlledCollection;
  readonly throttles: ControlledCollection;
  readonly roles: AppendOnlyCollection;
  readonly control: AppendOnlyCollection;
  readonly audit: AppendOnlyCollection;
}

export interface StaffStore {
  /** For single operations (sign-in checks, session lookups, throttles). */
  readonly collections: StaffCollections;
  /** Whether a durable store backs this process (production requires it). */
  readonly durable: boolean;
  atomically<T>(work: (collections: StaffCollections) => Promise<T>): Promise<T>;
}

export { Rollback, TRANSACTION_ATTEMPTS } from '../persistence/unit-of-work';

export const STAFF_STORE = Symbol('STAFF_STORE');

export function inMemoryStaffStore(
  audit: AppendOnlyCollection = inMemoryAppendOnlyCollection(COLLECTIONS.auditEvents),
): StaffStore {
  const collections: StaffCollections = {
    accounts: inMemoryControlledCollection(COLLECTIONS.staffAccounts),
    sessions: inMemoryControlledCollection(COLLECTIONS.staffSessions),
    throttles: inMemoryControlledCollection(COLLECTIONS.staffLoginThrottles),
    roles: inMemoryAppendOnlyCollection(COLLECTIONS.staffRoleAssignments),
    control: inMemoryAppendOnlyCollection(COLLECTIONS.administrativeControl),
    audit,
  };
  return { collections, durable: false, atomically: sequentialUnitOfWork(collections) };
}

/** Production without a database: every staff operation fails closed. */
export function unavailableStaffStore(): StaffStore {
  const collections: StaffCollections = {
    accounts: unavailableControlledCollection(COLLECTIONS.staffAccounts),
    sessions: unavailableControlledCollection(COLLECTIONS.staffSessions),
    throttles: unavailableControlledCollection(COLLECTIONS.staffLoginThrottles),
    roles: unavailableAppendOnlyCollection(COLLECTIONS.staffRoleAssignments),
    control: unavailableAppendOnlyCollection(COLLECTIONS.administrativeControl),
    audit: unavailableAppendOnlyCollection(COLLECTIONS.auditEvents),
  };
  return { collections, durable: false, atomically: sequentialUnitOfWork(collections) };
}

export function mongoStaffStore(
  db: Db,
  client: MongoClient = db.client,
  /** TEST ONLY: wraps the transaction-bound collections (failure injection in live tests). */
  wrap: (collections: StaffCollections) => StaffCollections = (c) => c,
): StaffStore {
  const bind = (session?: Parameters<typeof mongoControlledCollection>[2]): StaffCollections => ({
    accounts: mongoControlledCollection(db, COLLECTIONS.staffAccounts, session),
    sessions: mongoControlledCollection(db, COLLECTIONS.staffSessions, session),
    throttles: mongoControlledCollection(db, COLLECTIONS.staffLoginThrottles, session),
    roles: mongoAppendOnlyCollection(db, COLLECTIONS.staffRoleAssignments, session),
    control: mongoAppendOnlyCollection(db, COLLECTIONS.administrativeControl, session),
    // In a transaction, losing the race for the next audit sequence retries the unit of work.
    audit: mongoAppendOnlyCollection(db, COLLECTIONS.auditEvents, session, ['sequence_unique']),
  });
  return {
    collections: bind(),
    durable: true,
    atomically: mongoUnitOfWork(client, (session) => wrap(bind(session))),
  };
}
