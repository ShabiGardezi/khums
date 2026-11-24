import { Logger, Module, type Provider } from '@nestjs/common';
import type { Db } from 'mongodb';

import type { AuditEventStore } from '@khums/core';

import { APP_CONFIG, type AppConfig } from '../config';
import {
  inMemoryAppendOnlyCollection,
  unavailableAppendOnlyCollection,
  type AppendOnlyCollection,
} from '../persistence/append-only-collection';
import { COLLECTIONS } from '../persistence/collections';
import { mongoAppendOnlyCollection } from '../persistence/mongo-append-only-collection';
import { MONGO_DATABASE } from '../persistence/persistence.module';
import { appendOnlyAuditEventStore } from './audit-event.store';
import { AUDIT_COLLECTION, AUDIT_EVENT_STORE, AuditService } from './audit.service';

/**
 * The audit collection for this process: MongoDB when configured; otherwise unavailable in
 * production (fail closed) and process memory in development and test.
 */
export function selectAuditCollection(config: AppConfig, db: Db | null): AppendOnlyCollection {
  const spec = COLLECTIONS.auditEvents;
  if (db !== null) return mongoAppendOnlyCollection(db, spec);
  return config.env === 'production'
    ? unavailableAppendOnlyCollection(spec)
    : inMemoryAppendOnlyCollection(spec);
}

const providers: Provider[] = [
  {
    provide: AUDIT_COLLECTION,
    inject: [APP_CONFIG, MONGO_DATABASE],
    useFactory: (config: AppConfig, db: Db | null): AppendOnlyCollection => {
      if (db === null && config.env === 'production') {
        new Logger('Audit').warn('No database configured; audit events cannot be recorded.');
      }
      return selectAuditCollection(config, db);
    },
  },
  {
    provide: AUDIT_EVENT_STORE,
    inject: [AUDIT_COLLECTION],
    useFactory: (collection: AppendOnlyCollection): AuditEventStore =>
      appendOnlyAuditEventStore(collection),
  },
  AuditService,
];

/** Append-only, hash-chained audit log (M4.6.3a). */
@Module({ providers, exports: [AuditService, AUDIT_COLLECTION] })
export class AuditModule {}
