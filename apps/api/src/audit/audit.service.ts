import { randomUUID } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import { appendAuditEvent, type AuditAppendError, type AuditEventStore } from '@khums/core';
import type { AuditEvent, AuditEventDraft } from '@khums/shared-types';
import type { Result } from '@khums/utils';

import { CLOCK, type Clock } from '../auth/auth.tokens';

export const AUDIT_EVENT_STORE = Symbol('AUDIT_EVENT_STORE');
/** The audit collection of this process (shared with the staff store). */
export const AUDIT_COLLECTION = Symbol('AUDIT_COLLECTION');

/** What callers provide; the service adds the idempotency id and the server time. */
export type AuditRecordInput = Omit<AuditEventDraft, 'eventId' | 'occurredAt'>;

/**
 * Records audit events in the append-only, hash-chained audit log (M4.6.3a). Used by staff
 * authentication and administration from M4.6.2b. Failures are returned (never swallowed) and
 * logged by code only: event content is never logged.
 */
@Injectable()
export class AuditService {
  constructor(
    @Inject(AUDIT_EVENT_STORE) private readonly store: AuditEventStore,
    @Inject(CLOCK) private readonly clock: Clock,
    @InjectPinoLogger(AuditService.name) private readonly logger: PinoLogger,
  ) {}

  /**
   * Appends one event. Pass the same `eventId` when retrying after `AUDIT_STORE_UNAVAILABLE` so
   * the retry is idempotent; a new id is generated otherwise.
   */
  async record(
    input: AuditRecordInput,
    eventId: string = randomUUID(),
  ): Promise<Result<AuditEvent, AuditAppendError>> {
    const result = await appendAuditEvent(this.store, {
      ...input,
      eventId,
      occurredAt: new Date(this.clock.now()).toISOString(),
    });
    if (!result.ok) this.logger.warn({ code: result.error }, 'Audit event not recorded');
    return result;
  }
}
