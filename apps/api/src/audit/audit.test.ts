import type { PinoLogger } from 'nestjs-pino';
import { describe, expect, it, vi } from 'vitest';

import { appendAuditEvent, verifyAuditChain } from '@khums/core';
import type { AuditEventDraft } from '@khums/shared-types';

import type { AppConfig } from '../config';
import { inMemoryAppendOnlyCollection } from '../persistence/append-only-collection';
import { COLLECTIONS } from '../persistence/collections';
import { appendOnlyAuditEventStore, readAuditChain } from './audit-event.store';
import { selectAuditCollection } from './audit.module';
import { AuditService } from './audit.service';

/** Append-only, hash-chained audit log in the API (M4.6.3a). */

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const draft = (n: number): AuditEventDraft => ({
  eventId: uuid(n),
  type: 'staff.role.granted',
  actor: 'principal-admin',
  targets: [{ kind: 'staffAccount', id: `principal-${String(n)}` }],
  marjaIds: ['sistani'],
  details: { role: 'GOVERNING_SCHOLAR', reason: 'TEST reason' },
  requestId: `req-${String(n)}`,
  occurredAt: '2026-11-21T10:00:00.000Z',
});

describe('audit store on an append-only collection', () => {
  it('concurrent writers all land, in one unforked, verifiable chain', async () => {
    const collection = inMemoryAppendOnlyCollection(COLLECTIONS.auditEvents);
    const store = appendOnlyAuditEventStore(collection);
    const results = await Promise.all(
      [0, 1, 2, 3, 4].map((n) => appendAuditEvent(store, draft(n))),
    );
    expect(results.every((r) => r.ok)).toBe(true);
    const chain = await readAuditChain(collection);
    if (!chain.ok) throw new Error('fixture');
    expect(chain.value.map((e) => (e as { sequence: number }).sequence)).toEqual([0, 1, 2, 3, 4]);
    expect(verifyAuditChain(chain.value).ok).toBe(true);
  });

  it('maps the eventId index to an idempotent retry', async () => {
    const collection = inMemoryAppendOnlyCollection(COLLECTIONS.auditEvents);
    const store = appendOnlyAuditEventStore(collection);
    const first = await appendAuditEvent(store, draft(1));
    expect(await appendAuditEvent(store, draft(1))).toEqual(first);
    const chain = await readAuditChain(collection);
    expect(chain.ok && chain.value).toHaveLength(1);
  });

  it('fails closed on a malformed stored event', async () => {
    const collection = inMemoryAppendOnlyCollection(COLLECTIONS.auditEvents);
    await collection.insert({ sequence: 0, eventId: uuid(9), digest: 'x' });
    expect(await appendOnlyAuditEventStore(collection).head()).toEqual({
      ok: false,
      error: 'STORE_UNAVAILABLE',
    });
  });

  it('production without a database has no audit store (fail closed); dev/test use memory', async () => {
    const prod = selectAuditCollection({ env: 'production' } as AppConfig, null);
    expect(await prod.insert({})).toEqual({ kind: 'UNAVAILABLE' });
    const dev = selectAuditCollection({ env: 'development' } as AppConfig, null);
    expect(await dev.insert({ sequence: 0, eventId: 'e' })).toEqual({ kind: 'INSERTED' });
  });
});

describe('AuditService', () => {
  it('adds the event id and server time, and logs failures by code only', async () => {
    const logger = { warn: vi.fn() };
    const store = appendOnlyAuditEventStore(inMemoryAppendOnlyCollection(COLLECTIONS.auditEvents));
    const service = new AuditService(
      store,
      { now: () => Date.parse('2026-11-21T12:00:00.000Z') },
      logger as unknown as PinoLogger,
    );
    const { eventId: _e, occurredAt: _o, ...input } = draft(1);
    const recorded = await service.record(input, uuid(1));
    expect(recorded.ok && recorded.value).toMatchObject({
      eventId: uuid(1),
      occurredAt: '2026-11-21T12:00:00.000Z',
      sequence: 0,
    });
    const refused = await service.record({ ...input, type: 'Bad' });
    expect(refused).toEqual({ ok: false, error: 'AUDIT_EVENT_INVALID' });
    expect(logger.warn).toHaveBeenCalledWith(
      { code: 'AUDIT_EVENT_INVALID' },
      'Audit event not recorded',
    );
    expect(JSON.stringify(logger.warn.mock.calls)).not.toContain('principal-admin');
  });
});
