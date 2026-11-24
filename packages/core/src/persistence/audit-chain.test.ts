import { describe, expect, it } from 'vitest';

import type { AuditEvent, AuditEventDraft, ChainHead } from '@khums/shared-types';
import { err, ok } from '@khums/utils';

import {
  appendAuditEvent,
  sealAuditEvent,
  verifyAuditChain,
  type AuditEventStore,
} from './audit-chain';

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

const draft = (n: number, overrides: Partial<AuditEventDraft> = {}): AuditEventDraft => ({
  eventId: uuid(n),
  type: 'staff.role.granted',
  actor: 'principal-admin',
  targets: [{ kind: 'staffAccount', id: `principal-${String(n)}` }],
  marjaIds: ['sistani'],
  details: { role: 'GOVERNING_SCHOLAR', reason: 'Initial scholar', scopes: ['sistani'] },
  requestId: `req-${String(n)}`,
  occurredAt: '2026-11-21T10:00:00.000Z',
  ...overrides,
});

function chainOf(count: number): AuditEvent[] {
  const events: AuditEvent[] = [];
  let head: ChainHead | null = null;
  for (let n = 0; n < count; n += 1) {
    const sealed = sealAuditEvent(draft(n), head);
    if (!sealed.ok) throw new Error(sealed.error);
    events.push(sealed.value);
    head = { sequence: sealed.value.sequence, digest: sealed.value.digest };
  }
  return events;
}

/** In-memory store with the same unique-index semantics as the database (sequence, eventId). */
function memoryStore(initial: AuditEvent[] = []) {
  const events = [...initial];
  const store: AuditEventStore & { events: AuditEvent[] } = {
    events,
    head: () => {
      const last = events.at(-1);
      return Promise.resolve(
        ok(last === undefined ? null : { sequence: last.sequence, digest: last.digest }),
      );
    },
    insert: (event) => {
      if (events.some((e) => e.sequence === event.sequence))
        return Promise.resolve('SEQUENCE_TAKEN');
      if (events.some((e) => e.eventId === event.eventId)) return Promise.resolve('EVENT_ID_TAKEN');
      events.push(event);
      return Promise.resolve('INSERTED');
    },
    findByEventId: (eventId) =>
      Promise.resolve(ok(events.find((e) => e.eventId === eventId) ?? null)),
  };
  return store;
}

describe('sealing and verifying the audit chain', () => {
  it('links each event to the previous digest and verifies the whole chain', () => {
    const events = chainOf(3);
    expect(events.map((e) => e.sequence)).toEqual([0, 1, 2]);
    expect(events[0]?.previousDigest).toBeNull();
    expect(events[1]?.previousDigest).toBe(events[0]?.digest);
    expect(verifyAuditChain(events)).toEqual(
      ok({ head: { sequence: 2, digest: events[2]?.digest }, count: 3 }),
    );
    expect(Object.isFrozen(events[0])).toBe(true);
  });

  it('verifies incrementally from a verified head', () => {
    const events = chainOf(4);
    const head = { sequence: 1, digest: events[1]?.digest ?? '' };
    expect(verifyAuditChain(events.slice(2), head).ok).toBe(true);
    expect(verifyAuditChain(events.slice(3), head)).toEqual(
      err({ code: 'AUDIT_CHAIN_BROKEN', at: 3 }),
    );
  });

  it('detects edits, reordering, removal and broken links', () => {
    const events = chainOf(3);
    const [first, second, third] = events;
    if (first === undefined || second === undefined || third === undefined) throw new Error();
    const edited = { ...second, details: { ...second.details, role: 'AUDITOR' } };
    expect(verifyAuditChain([first, edited, third])).toEqual(
      err({ code: 'AUDIT_CHAIN_BROKEN', at: 1 }),
    );
    expect(verifyAuditChain([first, third])).toEqual(err({ code: 'AUDIT_CHAIN_BROKEN', at: 2 }));
    expect(verifyAuditChain([second, first])).toEqual(err({ code: 'AUDIT_CHAIN_BROKEN', at: 1 }));
    // A consistent rewrite from a forged start still fails if it does not start at 0 …
    expect(verifyAuditChain(events.slice(1))).toEqual(err({ code: 'AUDIT_CHAIN_BROKEN', at: 1 }));
    // … and an unknown field is refused outright.
    expect(verifyAuditChain([{ ...first, extra: 1 }])).toEqual(
      err({ code: 'AUDIT_EVENT_INVALID', at: 0 }),
    );
  });

  it('refuses drafts that could carry amounts, secrets or free-form shapes', () => {
    for (const bad of [
      draft(1, { details: { amount: 12 as unknown as string } }),
      draft(1, { eventId: 'not-a-uuid' }),
      draft(1, { type: 'Signin' }),
      draft(1, { occurredAt: '2026-11-21' }),
      { ...draft(1), password: 'x' } as AuditEventDraft,
      draft(1, { details: { note: 'x'.repeat(501) } }),
    ]) {
      expect(sealAuditEvent(bad, null)).toEqual(err('AUDIT_EVENT_INVALID'));
    }
  });
});

describe('appending (derived head, unique indexes, idempotent retries)', () => {
  it('appends at the derived head', async () => {
    const store = memoryStore();
    for (let n = 0; n < 3; n += 1) {
      const appended = await appendAuditEvent(store, draft(n));
      expect(appended.ok && appended.value.sequence).toBe(n);
    }
    expect(verifyAuditChain(store.events).ok).toBe(true);
  });

  it('retries after losing a race and never forks the chain', async () => {
    const store = memoryStore(chainOf(1));
    let raced = false;
    const racing: AuditEventStore = {
      ...store,
      // The first head read is stale: another writer appended in between.
      head: async () => {
        if (!raced) {
          raced = true;
          const stale = await store.head();
          const other = sealAuditEvent(draft(99), stale.ok ? stale.value : null);
          if (other.ok) await store.insert(other.value);
          return stale;
        }
        return store.head();
      },
    };
    const appended = await appendAuditEvent(racing, draft(5));
    expect(appended.ok && appended.value.sequence).toBe(2);
    expect(store.events.map((e) => e.sequence)).toEqual([0, 1, 2]);
    expect(verifyAuditChain(store.events).ok).toBe(true);
  });

  it('gives up after bounded contention instead of dropping the event', async () => {
    const store = memoryStore(chainOf(1));
    const alwaysTaken: AuditEventStore = {
      ...store,
      insert: () => Promise.resolve('SEQUENCE_TAKEN'),
    };
    expect(await appendAuditEvent(alwaysTaken, draft(5), { maxAttempts: 3 })).toEqual(
      err('AUDIT_APPEND_CONTENDED'),
    );
  });

  it('is idempotent: a retry of a draft that already landed returns the stored event', async () => {
    const store = memoryStore();
    const first = await appendAuditEvent(store, draft(1));
    await appendAuditEvent(store, draft(2));
    const retry = await appendAuditEvent(store, draft(1));
    expect(retry).toEqual(first);
    expect(store.events).toHaveLength(2);
  });

  it('refuses a reused event id with different content', async () => {
    const store = memoryStore();
    await appendAuditEvent(store, draft(1));
    expect(await appendAuditEvent(store, draft(1, { actor: 'someone-else' }))).toEqual(
      err('AUDIT_EVENT_ID_REUSED'),
    );
  });

  it('fails closed when the store is unavailable or the outcome is unknown', async () => {
    const store = memoryStore();
    expect(
      await appendAuditEvent(
        { ...store, head: () => Promise.resolve(err('STORE_UNAVAILABLE')) },
        draft(1),
      ),
    ).toEqual(err('AUDIT_STORE_UNAVAILABLE'));
    expect(
      await appendAuditEvent({ ...store, insert: () => Promise.resolve('UNAVAILABLE') }, draft(1)),
    ).toEqual(err('AUDIT_STORE_UNAVAILABLE'));
    expect(await appendAuditEvent(store, draft(1, { type: 'bad' }))).toEqual(
      err('AUDIT_EVENT_INVALID'),
    );
  });
});
