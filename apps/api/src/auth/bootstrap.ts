import { randomUUID } from 'node:crypto';

import {
  checkPasswordPolicy,
  INITIAL_ADMINISTRATIVE_CONTROL,
  normalizeUsername,
  type PasswordPolicyIssue,
} from '@khums/core';
import { err, ok, type Result } from '@khums/utils';

import type { PasswordHasher } from './password-hasher';
import { staffRepository } from './staff-repository';
import { Rollback, type StaffStore } from './staff-store';

/**
 * First SUPER_ADMIN bootstrap (M4.6.2b; docs/AUTH_ARCHITECTURE.md §4.10). Atomic, race-safe and
 * once only:
 *
 * - the FIRST write of the unit of work is administrative-control record `sequence: 0`
 *   (`kind: 'BOOTSTRAP'`, setting `SINGLE_ADMIN_V1`) in an append-only collection with a unique
 *   `sequence` index. Of two concurrent runs exactly one insert succeeds; the other rolls back.
 *   The application can never delete that record, so bootstrap can never run again;
 * - in the same MongoDB transaction: the account (password chosen at the prompt, so no forced
 *   change), its SUPER_ADMIN assignment (scope ALL, no religious role) and the
 *   `staff.bootstrap.completed` audit event. Either everything commits or nothing does.
 *
 * There are no default credentials. The caller (the operator command) reads the password from an
 * interactive prompt; it is never an argument, an environment variable or a log line.
 */

export const BOOTSTRAP_ACTOR = 'system:bootstrap';

export type BootstrapFailure =
  | { readonly kind: 'ALREADY_BOOTSTRAPPED' }
  | { readonly kind: 'USERNAME_INVALID' }
  | { readonly kind: 'PASSWORD_POLICY_VIOLATION'; readonly issue: PasswordPolicyIssue }
  | { readonly kind: 'USERNAME_TAKEN' }
  | { readonly kind: 'UNAVAILABLE' };

/** Refuses before any prompt when bootstrap already happened or a SUPER_ADMIN exists. */
export async function bootstrapAllowed(store: StaffStore): Promise<Result<void, BootstrapFailure>> {
  const repo = staffRepository(store.collections);
  const [control, admins] = await Promise.all([repo.controlRecords(), repo.activeSuperAdmins()]);
  if (!control.ok || !admins.ok) return err({ kind: 'UNAVAILABLE' });
  return control.value.length > 0 || admins.value > 0
    ? err({ kind: 'ALREADY_BOOTSTRAPPED' })
    : ok(undefined);
}

export async function bootstrapSuperAdmin(
  deps: { readonly store: StaffStore; readonly hasher: PasswordHasher; readonly now: number },
  input: { readonly username: string; readonly password: string },
): Promise<Result<{ readonly principalId: string }, BootstrapFailure>> {
  const allowed = await bootstrapAllowed(deps.store);
  if (!allowed.ok) return allowed;
  const username = normalizeUsername(input.username);
  if (!username.ok) return err({ kind: 'USERNAME_INVALID' });
  const policy = checkPasswordPolicy(input.password, username.value);
  if (!policy.ok) return err({ kind: 'PASSWORD_POLICY_VIOLATION', issue: policy.error });
  const passwordHash = await deps.hasher.hash(input.password);
  const at = new Date(deps.now).toISOString();
  const principalId = randomUUID();

  return deps.store.atomically(
    async (c): Promise<Result<{ principalId: string }, BootstrapFailure>> => {
      const tx = staffRepository(c);
      const control = await tx.insertControlRecord({
        sequence: 0,
        kind: 'BOOTSTRAP',
        setting: INITIAL_ADMINISTRATIVE_CONTROL,
        actor: BOOTSTRAP_ACTOR,
        recordedAt: at,
        reason: 'Initial SUPER_ADMIN bootstrap',
      });
      if (control.kind === 'DUPLICATE')
        throw new Rollback(err({ kind: 'ALREADY_BOOTSTRAPPED' } as const));
      if (control.kind !== 'INSERTED') throw new Rollback(err({ kind: 'UNAVAILABLE' } as const));
      const account = await tx.insertAccount({
        principalId,
        username: username.value,
        usernameKey: username.value,
        passwordHash,
        passwordChangedAt: at,
        mustChangePassword: false,
        temporaryPasswordExpiresAt: null,
        status: 'ACTIVE',
        createdBy: BOOTSTRAP_ACTOR,
        createdAt: at,
        sessionEpoch: 0,
        version: 0,
      });
      if (account.kind === 'DUPLICATE')
        throw new Rollback(err({ kind: 'USERNAME_TAKEN' } as const));
      if (account.kind !== 'INSERTED') throw new Rollback(err({ kind: 'UNAVAILABLE' } as const));
      const assignmentId = randomUUID();
      const role = await tx.insertRoleRecord({
        recordId: randomUUID(),
        kind: 'GRANTED',
        assignmentId,
        principalId,
        role: 'SUPER_ADMIN',
        scope: { kind: 'ALL', marjaIds: [] },
        actor: BOOTSTRAP_ACTOR,
        at,
        reason: 'Initial SUPER_ADMIN bootstrap',
      });
      if (role.kind !== 'INSERTED') throw new Rollback(err({ kind: 'UNAVAILABLE' } as const));
      const audited = await tx.audit({
        eventId: randomUUID(),
        type: 'staff.bootstrap.completed',
        actor: BOOTSTRAP_ACTOR,
        targets: [{ kind: 'staffAccount', id: principalId }],
        marjaIds: [],
        details: {
          role: 'SUPER_ADMIN',
          scope: 'ALL',
          assignmentId,
          setting: INITIAL_ADMINISTRATIVE_CONTROL,
        },
        requestId: null,
        occurredAt: at,
      });
      if (!audited.ok) throw new Rollback(err({ kind: 'UNAVAILABLE' } as const));
      return ok({ principalId });
    },
  );
}
