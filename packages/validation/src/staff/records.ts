import { z } from 'zod';

import { GOVERNANCE_ROLES, roleScopeSchema } from '../auth/authorization';

/**
 * Staff identity STORAGE records (M4.6.2b; docs/DATABASE_SCHEMA.md §3.8): what the API stores in
 * `staffAccounts`, `staffSessions`, `staffLoginThrottles`, `staffRoleAssignments` and
 * `administrativeControl`, validated on every read (like the ledger and audit record schemas).
 * Server-side only; never an HTTP contract. Password hashes and token hashes in these records never
 * leave the API.
 */

const iso = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
const ACCOUNT_STATUSES = ['INVITED', 'ACTIVE', 'SUSPENDED', 'DEACTIVATED'] as const;

export const staffAccountRecordSchema = z.object({
  principalId: z.string().min(1),
  username: z.string().min(1),
  usernameKey: z.string().min(1),
  passwordHash: z.string().min(1),
  passwordChangedAt: iso,
  mustChangePassword: z.boolean(),
  temporaryPasswordExpiresAt: iso.nullable(),
  status: z.enum(ACCOUNT_STATUSES),
  createdBy: z.string().min(1),
  createdAt: iso,
  /** Incremented on every password, status or role change: older sessions stop working. */
  sessionEpoch: z.number().int().min(0),
  version: z.number().int().min(0),
});
export type StaffAccountRecord = z.infer<typeof staffAccountRecordSchema>;

export const staffSessionRecordSchema = z.object({
  sessionIdHash: z.string().regex(/^[0-9a-f]{64}$/),
  principalId: z.string().min(1),
  csrfTokenHash: z.string().regex(/^[0-9a-f]{64}$/),
  sessionEpoch: z.number().int().min(0),
  /** Signed in with a temporary password: only the password change is allowed. */
  passwordChangeOnly: z.boolean(),
  authenticatedAt: iso,
  createdAt: iso,
  lastSeenAt: iso,
  idleExpiresAt: iso,
  absoluteExpiresAt: iso,
  expireAt: z.date(),
  revokedAt: iso.nullable(),
  revokedReason: z.string().nullable(),
});
export type StaffSessionRecord = z.infer<typeof staffSessionRecordSchema>;

export const loginThrottleRecordSchema = z.object({
  key: z.string().min(1),
  failures: z.number().int().min(0),
  throttledUntil: iso.nullable(),
  lastFailureAt: iso.nullable(),
  expireAt: z.date(),
});
export type LoginThrottleRecord = z.infer<typeof loginThrottleRecordSchema>;

export const staffRoleRecordSchema = z.object({
  recordId: z.string().min(1),
  kind: z.enum(['GRANTED', 'REVOKED']),
  assignmentId: z.string().min(1),
  principalId: z.string().min(1),
  role: z.enum(GOVERNANCE_ROLES),
  scope: roleScopeSchema,
  actor: z.string().min(1),
  at: iso,
  reason: z.string().min(1),
});
export type StaffRoleRecord = z.infer<typeof staffRoleRecordSchema>;

export const administrativeControlRecordSchema = z.object({
  sequence: z.number().int().min(0),
  kind: z.enum(['BOOTSTRAP', 'SETTING_CHANGED']),
  setting: z.enum(['SINGLE_ADMIN_V1', 'DUAL_ADMIN_V1']),
  actor: z.string().min(1),
  recordedAt: iso,
  reason: z.string().min(1),
});
export type AdministrativeControlRecord = z.infer<typeof administrativeControlRecordSchema>;
