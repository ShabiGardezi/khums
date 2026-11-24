import { describe, expect, it } from 'vitest';

import {
  auditEventDraftSchema,
  auditEventSchema,
  integrityChainIdSchema,
  integrityCheckpointSchema,
} from './index';

/** Audit and checkpoint schemas (M4.6.3a): strict shapes, no amounts, no unknown fields. */

const draft = {
  eventId: '00000000-0000-4000-8000-000000000001',
  type: 'staff.role.granted',
  actor: 'principal-admin',
  targets: [{ kind: 'staffAccount', id: 'principal-1' }],
  marjaIds: ['sistani'],
  details: { role: 'GOVERNING_SCHOLAR', scopes: ['sistani'], confirmed: true, note: null },
  requestId: 'req-1',
  occurredAt: '2026-11-21T10:00:00.000Z',
};

describe('audit event schemas', () => {
  it('accepts a well-formed draft and sealed event', () => {
    expect(auditEventDraftSchema.safeParse(draft).success).toBe(true);
    expect(
      auditEventSchema.safeParse({
        ...draft,
        sequence: 0,
        previousDigest: null,
        digest: 'a'.repeat(64),
      }).success,
    ).toBe(true);
  });

  it('refuses numbers in details, unknown fields and malformed identifiers', () => {
    for (const bad of [
      { ...draft, details: { amount: 100 } },
      { ...draft, password: 'x' },
      { ...draft, eventId: 'abc' },
      { ...draft, type: 'staff' },
      { ...draft, targets: [{ kind: 'Staff Account', id: 'x' }] },
      {
        ...draft,
        details: Object.fromEntries(Array.from({ length: 31 }, (_, i) => [`k${String(i)}`, 'v'])),
      },
    ]) {
      expect(auditEventDraftSchema.safeParse(bad).success).toBe(false);
    }
  });
});

describe('checkpoint schemas', () => {
  const checkpoint = {
    checkpointId: '00000000-0000-4000-8000-000000000002',
    chainId: 'governance-ledger:pack-a@1.0.0',
    sequence: 3,
    digest: 'b'.repeat(64),
    recordCount: 4,
    createdAt: '2026-11-21T10:00:00.000Z',
    keyId: 'key-2026a',
    signature: 'A'.repeat(86),
  };

  it('accepts a well-formed checkpoint and the four chain kinds', () => {
    expect(integrityCheckpointSchema.safeParse(checkpoint).success).toBe(true);
    for (const id of [
      'audit',
      'governance-policy-registry',
      'governance-ledger:p.x@2.1.0',
      'provisional:p.x@0.1.0',
    ]) {
      expect(integrityChainIdSchema.safeParse(id).success, id).toBe(true);
    }
  });

  it('refuses unknown chains, bad signatures and extra fields', () => {
    for (const id of ['ledger:x', 'provisional:x', 'provisional:x@1.0', 'feedback:x@1.0.0']) {
      expect(integrityChainIdSchema.safeParse(id).success, id).toBe(false);
    }
    expect(integrityCheckpointSchema.safeParse({ ...checkpoint, signature: 'short' }).success).toBe(
      false,
    );
    expect(integrityCheckpointSchema.safeParse({ ...checkpoint, extra: 1 }).success).toBe(false);
  });
});
