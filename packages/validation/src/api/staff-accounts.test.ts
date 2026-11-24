import { describe, expect, it } from 'vitest';

import {
  grantStaffRoleRequestSchema,
  replaceStaffRoleRequestSchema,
  staffAccountSchema,
} from './staff-accounts';

/** Staff administration contracts (decision 64): only SUPER_ADMIN and SCHOLAR can be granted. */

const scholarScope = { kind: 'MARJA', marjaIds: ['sistani', 'khamenei'] };

describe('grant and replace requests', () => {
  it('accept SUPER_ADMIN and SCHOLAR with a reason', () => {
    for (const schema of [grantStaffRoleRequestSchema, replaceStaffRoleRequestSchema]) {
      expect(
        schema.safeParse({ role: 'SCHOLAR', scope: scholarScope, reason: 'TEST assign' }).success,
      ).toBe(true);
      expect(
        schema.safeParse({
          role: 'SUPER_ADMIN',
          scope: { kind: 'ALL', marjaIds: [] },
          reason: 'TEST',
        }).success,
      ).toBe(true);
    }
  });

  it('refuse every legacy role, unknown fields and a missing reason', () => {
    for (const schema of [grantStaffRoleRequestSchema, replaceStaffRoleRequestSchema]) {
      for (const role of [
        'GOVERNING_SCHOLAR',
        'RULE_PACK_AUTHOR',
        'RELIGIOUS_RESEARCHER',
        'SCHOLAR_REVIEWER',
        'INDEPENDENT_APPROVER',
        'AUDITOR',
      ]) {
        expect(
          schema.safeParse({ role, scope: scholarScope, reason: 'TEST legacy' }).success,
          role,
        ).toBe(false);
      }
      expect(schema.safeParse({ role: 'SCHOLAR', scope: scholarScope }).success).toBe(false);
      expect(
        schema.safeParse({ role: 'SCHOLAR', scope: scholarScope, reason: 'TEST', extra: 1 })
          .success,
      ).toBe(false);
    }
  });
});

describe('account responses', () => {
  it('still read legacy roles (existing assignments are shown, to convert or revoke)', () => {
    const account = {
      principalId: 'p',
      username: 'u',
      status: 'ACTIVE',
      mustChangePassword: false,
      temporaryPasswordExpiresAt: null,
      createdAt: '2026-11-23T10:00:00.000Z',
      roles: [
        {
          assignmentId: 'a',
          role: 'GOVERNING_SCHOLAR',
          scope: scholarScope,
          grantedBy: 'x',
          grantedAt: '2026-11-23T10:00:00.000Z',
        },
      ],
    };
    expect(staffAccountSchema.safeParse(account).success).toBe(true);
  });
});
