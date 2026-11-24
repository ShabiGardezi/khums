import { describe, expect, it } from 'vitest';

import {
  administrativeControlRecordSchema,
  staffAccountRecordSchema,
  staffRoleRecordSchema,
  staffSessionRecordSchema,
} from './index';

/** Staff storage record schemas (M4.6.2b): records read back from the database are checked. */

const at = '2026-11-21T10:00:00.000Z';

describe('staff storage records', () => {
  it('accepts well-formed records', () => {
    expect(
      staffAccountRecordSchema.safeParse({
        principalId: 'p1',
        username: 'scholar1',
        usernameKey: 'scholar1',
        passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$c2FsdA$aGFzaA',
        passwordChangedAt: at,
        mustChangePassword: false,
        temporaryPasswordExpiresAt: null,
        status: 'ACTIVE',
        createdBy: 'system:bootstrap',
        createdAt: at,
        sessionEpoch: 0,
        version: 0,
      }).success,
    ).toBe(true);
    expect(
      staffRoleRecordSchema.safeParse({
        recordId: 'r1',
        kind: 'GRANTED',
        assignmentId: 'a1',
        principalId: 'p1',
        role: 'GOVERNING_SCHOLAR',
        scope: { kind: 'MARJA', marjaIds: ['sistani'] },
        actor: 'admin',
        at,
        reason: 'TEST',
      }).success,
    ).toBe(true);
  });

  it('refuses malformed values (fail closed on corrupted documents)', () => {
    expect(
      staffSessionRecordSchema.safeParse({ sessionIdHash: 'not-hex', principalId: 'p1' }).success,
    ).toBe(false);
    expect(
      staffRoleRecordSchema.safeParse({
        recordId: 'r1',
        kind: 'GRANTED',
        assignmentId: 'a1',
        principalId: 'p1',
        role: 'ROOT',
        scope: { kind: 'ALL', marjaIds: [] },
        actor: 'admin',
        at,
        reason: 'TEST',
      }).success,
    ).toBe(false);
    expect(
      administrativeControlRecordSchema.safeParse({
        sequence: 0,
        kind: 'BOOTSTRAP',
        setting: 'TRIPLE_ADMIN',
        actor: 'x',
        recordedAt: at,
        reason: 'x',
      }).success,
    ).toBe(false);
  });
});
