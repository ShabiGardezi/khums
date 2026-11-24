import {
  appendAuditEvent,
  INITIAL_ADMINISTRATIVE_CONTROL,
  type AuditAppendError,
} from '@khums/core';
import type { AdministrativeControlSetting } from '@khums/core';
import type {
  AccountStatus,
  AuditEvent,
  AuditEventDraft,
  RoleAssignment,
} from '@khums/shared-types';
import { err, ok, type Result } from '@khums/utils';
import {
  administrativeControlRecordSchema,
  loginThrottleRecordSchema,
  staffAccountRecordSchema,
  staffRoleRecordSchema,
  staffSessionRecordSchema,
  type AdministrativeControlRecord,
  type LoginThrottleRecord,
  type StaffAccountRecord,
  type StaffRoleRecord,
  type StaffSessionRecord,
} from '@khums/validation';
import type { z } from 'zod';

import { appendOnlyAuditEventStore } from '../audit/audit-event.store';
import type { StaffCollections } from './staff-store';

/**
 * Typed access to the staff collections (M4.6.2b; docs/DATABASE_SCHEMA.md §3.8). Persistence
 * shapes are internal to the API (not contracts). Every document read is validated; a malformed
 * document makes the operation fail closed (`UNAVAILABLE`). Password hashes and session/CSRF token
 * hashes never leave this layer except to the code that verifies them.
 */

export type StaffAccountDoc = StaffAccountRecord;
export type StaffSessionDoc = StaffSessionRecord;
export type ThrottleDoc = LoginThrottleRecord;
export type RoleRecord = StaffRoleRecord;
export type ControlRecord = AdministrativeControlRecord;

type Read<T> = Promise<Result<T, 'UNAVAILABLE'>>;

function parseAll<T>(schema: z.ZodType<T>, docs: readonly unknown[]): Result<T[], 'UNAVAILABLE'> {
  const out: T[] = [];
  for (const doc of docs) {
    const parsed = schema.safeParse(doc);
    if (!parsed.success) return err('UNAVAILABLE');
    out.push(parsed.data);
  }
  return ok(out);
}

async function findAll<T>(
  read: Promise<Result<readonly unknown[], 'UNAVAILABLE'>>,
  schema: z.ZodType<T>,
): Read<T[]> {
  const found = await read;
  return found.ok ? parseAll(schema, found.value) : found;
}

async function findOne<T>(
  read: Promise<Result<readonly unknown[], 'UNAVAILABLE'>>,
  schema: z.ZodType<T>,
): Read<T | null> {
  const all = await findAll(read, schema);
  return all.ok ? ok(all.value[0] ?? null) : all;
}

/** Folds GRANTED/REVOKED records into the assignments still in force for each principal. */
export function activeAssignments(
  records: readonly RoleRecord[],
  principalId?: string,
): RoleAssignment[] {
  const revoked = new Set(records.filter((r) => r.kind === 'REVOKED').map((r) => r.assignmentId));
  return records
    .filter((r) => r.kind === 'GRANTED' && !revoked.has(r.assignmentId))
    .filter((r) => principalId === undefined || r.principalId === principalId)
    .map((r) => ({
      assignmentId: r.assignmentId,
      principalId: r.principalId,
      role: r.role,
      scope: { kind: r.scope.kind, marjaIds: [...r.scope.marjaIds] },
      grantedBy: r.actor,
      grantedAt: r.at,
      revokedBy: null,
      revokedAt: null,
    }));
}

export function staffRepository(c: StaffCollections) {
  const auditStore = appendOnlyAuditEventStore(c.audit);
  return {
    accountByUsernameKey: (usernameKey: string) =>
      findOne(c.accounts.find({ usernameKey }), staffAccountRecordSchema),
    accountById: (principalId: string) =>
      findOne(c.accounts.find({ principalId }), staffAccountRecordSchema),
    allAccounts: () =>
      findAll(
        c.accounts.find({}, { sort: { field: 'usernameKey', direction: 1 } }),
        staffAccountRecordSchema,
      ),
    insertAccount: async (doc: StaffAccountDoc) => c.accounts.insert(doc),
    /**
     * Version-checked update: applies only if the account still has `version` (optimistic
     * concurrency). `bumpEpoch` invalidates every existing session of the account.
     */
    updateAccount: async (
      principalId: string,
      version: number,
      set: Partial<Omit<StaffAccountDoc, 'principalId' | 'version' | 'sessionEpoch'>>,
      bumpEpoch: boolean,
    ): Promise<'UPDATED' | 'CONFLICT' | 'UNAVAILABLE'> => {
      const result = await c.accounts.updateOne(
        { principalId, version },
        { set, inc: bumpEpoch ? { version: 1, sessionEpoch: 1 } : { version: 1 } },
      );
      if (!result.ok) return 'UNAVAILABLE';
      return result.value === 1 ? 'UPDATED' : 'CONFLICT';
    },

    roleRecords: (principalId?: string) =>
      findAll(
        c.roles.find(principalId === undefined ? {} : { principalId }, {
          sort: { field: 'at', direction: 1 },
        }),
        staffRoleRecordSchema,
      ),
    insertRoleRecord: (record: RoleRecord) => c.roles.insert(record),
    /** Active accounts holding an active SUPER_ADMIN assignment. */
    activeSuperAdmins: async (): Read<number> => {
      // Sequential: this runs inside transactions, where concurrent operations are not supported.
      const records = await findAll(
        c.roles.find({}, { sort: { field: 'at', direction: 1 } }),
        staffRoleRecordSchema,
      );
      const accounts = await findAll(
        c.accounts.find({ status: 'ACTIVE' }),
        staffAccountRecordSchema,
      );
      if (!records.ok) return records;
      if (!accounts.ok) return accounts;
      const admins = new Set(
        activeAssignments(records.value)
          .filter((a) => a.role === 'SUPER_ADMIN')
          .map((a) => a.principalId),
      );
      return ok(accounts.value.filter((a) => admins.has(a.principalId)).length);
    },

    controlRecords: () =>
      findAll(
        c.control.find({}, { sort: { field: 'sequence', direction: 1 } }),
        administrativeControlRecordSchema,
      ),
    administrativeControl: async (): Read<AdministrativeControlSetting> => {
      const records = await findAll(
        c.control.find({}, { sort: { field: 'sequence', direction: 1 } }),
        administrativeControlRecordSchema,
      );
      return records.ok
        ? ok(records.value.at(-1)?.setting ?? INITIAL_ADMINISTRATIVE_CONTROL)
        : records;
    },
    insertControlRecord: (record: ControlRecord) => c.control.insert(record),

    insertSession: (doc: StaffSessionDoc) => c.sessions.insert(doc),
    sessionByHash: (sessionIdHash: string) =>
      findOne(c.sessions.find({ sessionIdHash }), staffSessionRecordSchema),
    touchSession: (sessionIdHash: string, lastSeenAt: string, idleExpiresAt: string) =>
      c.sessions.updateOne(
        { sessionIdHash, revokedAt: null },
        { set: { lastSeenAt, idleExpiresAt } },
      ),
    revokeSession: (sessionIdHash: string, at: string, reason: string) =>
      c.sessions.updateOne(
        { sessionIdHash, revokedAt: null },
        { set: { revokedAt: at, revokedReason: reason } },
      ),
    revokeAllSessions: (principalId: string, at: string, reason: string) =>
      c.sessions.updateMany(
        { principalId, revokedAt: null },
        { set: { revokedAt: at, revokedReason: reason } },
      ),

    throttle: (key: string) => findOne(c.throttles.find({ key }), loginThrottleRecordSchema),
    recordThrottleFailure: async (key: string, at: string, expireAt: Date): Read<ThrottleDoc> => {
      const doc = await c.throttles.upsertAndGet(
        { key },
        { inc: { failures: 1 }, set: { lastFailureAt: at, expireAt } },
        { throttledUntil: null },
      );
      if (!doc.ok) return doc;
      const parsed = loginThrottleRecordSchema.safeParse(doc.value);
      return parsed.success ? ok(parsed.data) : err('UNAVAILABLE');
    },
    setThrottledUntil: (key: string, throttledUntil: string | null) =>
      c.throttles.updateOne({ key }, { set: { throttledUntil } }),
    resetThrottle: (key: string) =>
      c.throttles.updateOne({ key }, { set: { failures: 0, throttledUntil: null } }),

    audit: (draft: AuditEventDraft): Promise<Result<AuditEvent, AuditAppendError>> =>
      appendAuditEvent(auditStore, draft),
  };
}

export type StaffRepository = ReturnType<typeof staffRepository>;

export type { AccountStatus };
