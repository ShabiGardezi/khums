import type { AuditEventStore } from '@khums/core';
import type { AuditEvent } from '@khums/shared-types';
import { err, ok } from '@khums/utils';
import { auditEventSchema } from '@khums/validation';

import type { AppendOnlyCollection } from '../persistence/append-only-collection';

/**
 * The audit chain's storage on an append-only collection (M4.6.3a). The head is derived (highest
 * `sequence`); the unique `sequence` and `eventId` indexes decide races and make retries
 * idempotent. A stored document that does not match the schema makes the store answer
 * "unavailable" (fail closed); the chain itself is verified by `@khums/core`.
 */
export function appendOnlyAuditEventStore(collection: AppendOnlyCollection): AuditEventStore {
  const parseOne = (docs: readonly unknown[]) => {
    const [first] = docs;
    if (first === undefined) return ok(null);
    const parsed = auditEventSchema.safeParse(first);
    return parsed.success ? ok(parsed.data) : err('STORE_UNAVAILABLE' as const);
  };
  return {
    head: async () => {
      const found = await collection.find(
        {},
        { sort: { field: 'sequence', direction: -1 }, limit: 1 },
      );
      if (!found.ok) return err('STORE_UNAVAILABLE');
      const event = parseOne(found.value);
      if (!event.ok) return event;
      return ok(
        event.value === null
          ? null
          : { sequence: event.value.sequence, digest: event.value.digest },
      );
    },
    insert: async (event: AuditEvent) => {
      const outcome = await collection.insert(event);
      switch (outcome.kind) {
        case 'INSERTED':
          return 'INSERTED';
        case 'UNAVAILABLE':
          return 'UNAVAILABLE';
        case 'DUPLICATE':
          return outcome.index === 'eventId_unique' ? 'EVENT_ID_TAKEN' : 'SEQUENCE_TAKEN';
      }
    },
    findByEventId: async (eventId) => {
      const found = await collection.find(
        { eventId },
        { sort: { field: 'sequence', direction: 1 }, limit: 1 },
      );
      return found.ok ? parseOne(found.value) : err('STORE_UNAVAILABLE');
    },
  };
}

/** Every event in sequence order, unvalidated (for verification and checkpoints). */
export async function readAuditChain(collection: AppendOnlyCollection) {
  return collection.find({}, { sort: { field: 'sequence', direction: 1 } });
}
