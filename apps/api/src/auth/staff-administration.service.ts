import { randomUUID } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';

import {
  checkAccountAdministration,
  checkAccountStatusChange,
  checkRoleGrant,
  checkRoleReplacement,
  checkRoleRevocation,
  normalizeUsername,
  type StaffAdministrationIssue,
  type TargetAccount,
} from '@khums/core';
import type {
  AccountStatus,
  AuditEventDraft,
  GovernanceRole,
  RoleScope,
} from '@khums/shared-types';
import {
  API_ERROR_CODES,
  type StaffAccount,
  type TemporaryCredentialResponse,
} from '@khums/validation';

import { ApiProblemException } from '../common/errors/api-problem.exception';
import { InjectAppConfig, type AppConfig } from '../config';
import { CLOCK, type Clock } from './auth.tokens';
import { accountKey } from './login-throttle';
import { PASSWORD_HASHER, type PasswordHasher } from './password-hasher';
import { newTemporaryPassword } from './secrets';
import { TEMPORARY_PASSWORD_LIFETIME_MS } from './staff-auth.service';
import { StaffAuthorizationService } from './staff-authorization.service';
import {
  activeAssignments,
  staffRepository,
  type RoleRecord,
  type StaffAccountDoc,
  type StaffRepository,
} from './staff-repository';
import { staffAuthenticationOf } from './staff-request';
import { Rollback, STAFF_STORE, type StaffStore } from './staff-store';

/**
 * Staff account administration by a SUPER_ADMIN (M4.6.2b; docs/AUTH_ARCHITECTURE.md §4.10).
 *
 * Order for every change: (1) the centralized evaluator authorizes the permission for the target;
 * (2) `@khums/core` applies the administration rules (no self-administration, only SUPER_ADMIN and
 * SCHOLAR grantable (decision 64), Marja scopes from the catalogue, no last-SUPER_ADMIN lockout,
 * the administrative-control setting); (3) one atomic unit of work writes the change, bumps the
 * target's `sessionEpoch` and revokes its sessions where access changes, and appends the audit
 * event (actor, target, roles/scopes, reason). If the audit event cannot be written, nothing is.
 */

const problem = (status: number, code: keyof typeof API_ERROR_CODES, detail: string) =>
  new ApiProblemException(status, API_ERROR_CODES[code], detail);

const unavailable = () =>
  problem(503, 'SERVICE_UNAVAILABLE', 'Staff administration is currently unavailable.');
const conflict = () =>
  problem(409, 'ADMINISTRATION_CONFLICT', 'The account changed meanwhile. Reload and try again.');

const ISSUE_STATUS: Record<StaffAdministrationIssue, number> = {
  SELF_ADMINISTRATION: 403,
  ROLE_NOT_GRANTABLE: 422,
  SCOPE_INVALID: 422,
  ROLE_ALREADY_HELD: 409,
  ROLE_NOT_HELD: 404,
  TARGET_NOT_ACTIVE: 409,
  CONFIRMATION_REQUIRED: 409,
  LAST_SUPER_ADMIN: 409,
  STATUS_UNCHANGED: 409,
  ACCOUNT_DEACTIVATED: 409,
};
const refusal = (issue: StaffAdministrationIssue) =>
  problem(ISSUE_STATUS[issue], issue, `The change was refused (${issue}).`);

const iso = (ms: number) => new Date(ms).toISOString();

interface LoadedTarget {
  readonly account: StaffAccountDoc;
  readonly records: readonly RoleRecord[];
  readonly target: TargetAccount;
}

export function toStaffAccount(
  account: StaffAccountDoc,
  records: readonly RoleRecord[],
): StaffAccount {
  return {
    principalId: account.principalId,
    username: account.username,
    status: account.status,
    mustChangePassword: account.mustChangePassword,
    temporaryPasswordExpiresAt: account.temporaryPasswordExpiresAt,
    createdAt: account.createdAt,
    roles: activeAssignments(records, account.principalId).map((a) => ({
      assignmentId: a.assignmentId,
      role: a.role,
      scope: { kind: a.scope.kind, marjaIds: [...a.scope.marjaIds] },
      grantedBy: a.grantedBy,
      grantedAt: a.grantedAt,
    })),
  };
}

@Injectable()
export class StaffAdministrationService {
  constructor(
    @InjectAppConfig() private readonly config: AppConfig,
    @Inject(STAFF_STORE) private readonly store: StaffStore,
    @Inject(PASSWORD_HASHER) private readonly hasher: PasswordHasher,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly authz: StaffAuthorizationService,
  ) {}

  private actor(request: object): string {
    const auth = staffAuthenticationOf(request);
    if (auth === undefined) throw new Error('staff guard did not run');
    return auth.principal.principalId;
  }

  private draft(
    request: object,
    requestId: string | null,
    type: string,
    targetId: string,
    details: AuditEventDraft['details'],
    marjaIds: readonly string[] = [],
  ): AuditEventDraft {
    return {
      eventId: randomUUID(),
      type,
      actor: this.actor(request),
      targets: [{ kind: 'staffAccount', id: targetId }],
      marjaIds: [...marjaIds],
      details,
      requestId,
      occurredAt: iso(this.clock.now()),
    };
  }

  private async loadTarget(repo: StaffRepository, principalId: string): Promise<LoadedTarget> {
    // Sequential on purpose: MongoDB does not support concurrent operations on one transaction
    // session (found by the live Atlas suite); loadTarget runs inside units of work.
    const account = await repo.accountById(principalId);
    const records = await repo.roleRecords(principalId);
    if (!account.ok || !records.ok) throw unavailable();
    if (account.value === null)
      throw problem(404, 'ACCOUNT_NOT_FOUND', 'No staff account has this id.');
    return {
      account: account.value,
      records: records.value,
      target: {
        principalId: account.value.principalId,
        status: account.value.status,
        roles: activeAssignments(records.value, principalId),
      },
    };
  }

  /** Runs a unit of work; a `Rollback(problem)` inside rolls back and is thrown here. */
  private async atomically<T>(work: (tx: StaffRepository) => Promise<T>): Promise<T> {
    const result = await this.store.atomically<T | ApiProblemException>((c) =>
      work(staffRepository(c)),
    );
    if (result instanceof ApiProblemException) throw result;
    return result;
  }

  private static async requireAudit(tx: StaffRepository, draft: AuditEventDraft): Promise<void> {
    const recorded = await tx.audit(draft);
    if (!recorded.ok) throw new Rollback(unavailable());
  }

  private static async endAccess(
    tx: StaffRepository,
    principalId: string,
    at: string,
    reason: string,
  ): Promise<void> {
    const revoked = await tx.revokeAllSessions(principalId, at, reason);
    if (!revoked.ok) throw new Rollback(unavailable());
  }

  async list(request: object): Promise<StaffAccount[]> {
    this.authz.require(request, 'identity.user.read', {
      type: 'ACCOUNT',
      targetPrincipalId: 'staff-directory',
    });
    const repo = staffRepository(this.store.collections);
    const [accounts, records] = await Promise.all([repo.allAccounts(), repo.roleRecords()]);
    if (!accounts.ok || !records.ok) throw unavailable();
    return accounts.value.map((a) => toStaffAccount(a, records.value));
  }

  private async temporaryCredential(): Promise<{
    password: string;
    hash: string;
    expiresAt: string;
  }> {
    const password = newTemporaryPassword();
    return {
      password,
      hash: await this.hasher.hash(password),
      expiresAt: iso(this.clock.now() + TEMPORARY_PASSWORD_LIFETIME_MS),
    };
  }

  async create(
    request: object,
    input: { readonly username: string; readonly reason: string },
    requestId: string | null,
  ): Promise<TemporaryCredentialResponse> {
    const principalId = randomUUID();
    this.authz.require(request, 'identity.user.invite', {
      type: 'ACCOUNT',
      targetPrincipalId: principalId,
    });
    const username = normalizeUsername(input.username);
    if (!username.ok)
      throw problem(
        422,
        'USERNAME_INVALID',
        'Usernames are 3–64 characters: letters, digits, ".", "_" or "-".',
      );
    const temporary = await this.temporaryCredential();
    const nowIso = iso(this.clock.now());
    await this.atomically(async (tx) => {
      const inserted = await tx.insertAccount({
        principalId,
        username: username.value,
        usernameKey: username.value,
        passwordHash: temporary.hash,
        passwordChangedAt: nowIso,
        mustChangePassword: true,
        temporaryPasswordExpiresAt: temporary.expiresAt,
        status: 'ACTIVE',
        createdBy: this.actor(request),
        createdAt: nowIso,
        sessionEpoch: 0,
        version: 0,
      });
      if (inserted.kind === 'DUPLICATE') {
        throw new Rollback(
          problem(409, 'USERNAME_TAKEN', 'An account with this username already exists.'),
        );
      }
      if (inserted.kind !== 'INSERTED') throw new Rollback(unavailable());
      await StaffAdministrationService.requireAudit(
        tx,
        this.draft(request, requestId, 'staff.account.created', principalId, {
          reason: input.reason,
        }),
      );
    });
    return {
      principalId,
      username: username.value,
      temporaryPassword: temporary.password,
      temporaryPasswordExpiresAt: temporary.expiresAt,
    };
  }

  async resetPassword(
    request: object,
    principalId: string,
    reason: string,
    requestId: string | null,
  ): Promise<TemporaryCredentialResponse> {
    this.authz.require(request, 'identity.user.invite', {
      type: 'ACCOUNT',
      targetPrincipalId: principalId,
    });
    const temporary = await this.temporaryCredential();
    const nowIso = iso(this.clock.now());
    const username = await this.atomically(async (tx) => {
      const { account, target } = await this.loadTarget(tx, principalId);
      const allowed = checkAccountAdministration({ actorPrincipalId: this.actor(request), target });
      if (!allowed.ok) throw new Rollback(refusal(allowed.error));
      const updated = await tx.updateAccount(
        principalId,
        account.version,
        {
          passwordHash: temporary.hash,
          passwordChangedAt: nowIso,
          mustChangePassword: true,
          temporaryPasswordExpiresAt: temporary.expiresAt,
        },
        true,
      );
      if (updated !== 'UPDATED')
        throw new Rollback(updated === 'CONFLICT' ? conflict() : unavailable());
      await StaffAdministrationService.endAccess(tx, principalId, nowIso, 'PASSWORD_RESET');
      await StaffAdministrationService.requireAudit(
        tx,
        this.draft(request, requestId, 'staff.password.reset', principalId, { reason }),
      );
      return account.username;
    });
    return {
      principalId,
      username,
      temporaryPassword: temporary.password,
      temporaryPasswordExpiresAt: temporary.expiresAt,
    };
  }

  async setStatus(
    request: object,
    principalId: string,
    input: { readonly status: AccountStatus; readonly reason: string },
    requestId: string | null,
  ): Promise<StaffAccount> {
    this.authz.require(request, 'identity.user.suspend', {
      type: 'ACCOUNT',
      targetPrincipalId: principalId,
    });
    const nowIso = iso(this.clock.now());
    return this.atomically(async (tx) => {
      const { account, records, target } = await this.loadTarget(tx, principalId);
      const admins = await tx.activeSuperAdmins();
      if (!admins.ok) throw new Rollback(unavailable());
      const allowed = checkAccountStatusChange({
        actorPrincipalId: this.actor(request),
        target,
        to: input.status,
        activeSuperAdmins: admins.value,
      });
      if (!allowed.ok) throw new Rollback(refusal(allowed.error));
      const updated = await tx.updateAccount(
        principalId,
        account.version,
        { status: input.status },
        true,
      );
      if (updated !== 'UPDATED')
        throw new Rollback(updated === 'CONFLICT' ? conflict() : unavailable());
      if (input.status !== 'ACTIVE') {
        await StaffAdministrationService.endAccess(
          tx,
          principalId,
          nowIso,
          `ACCOUNT_${input.status}`,
        );
      }
      await StaffAdministrationService.requireAudit(
        tx,
        this.draft(request, requestId, 'staff.account.statusChanged', principalId, {
          from: account.status,
          to: input.status,
          reason: input.reason,
        }),
      );
      return toStaffAccount({ ...account, status: input.status }, records);
    });
  }

  async grantRole(
    request: object,
    principalId: string,
    input: { readonly role: GovernanceRole; readonly scope: RoleScope; readonly reason: string },
    requestId: string | null,
  ): Promise<StaffAccount> {
    // Under SINGLE_ADMIN_V1 a grant is one step: the PROPOSE stage is applied directly.
    this.authz.require(request, 'identity.role.assign', {
      type: 'ROLE_ASSIGNMENT',
      targetPrincipalId: principalId,
      role: input.role,
      scope: input.scope,
      stage: 'PROPOSE',
      proposedBy: null,
    });
    const nowIso = iso(this.clock.now());
    return this.atomically(async (tx) => {
      const { account, records, target } = await this.loadTarget(tx, principalId);
      const setting = await tx.administrativeControl();
      if (!setting.ok) throw new Rollback(unavailable());
      const allowed = checkRoleGrant({
        actorPrincipalId: this.actor(request),
        target,
        role: input.role,
        scope: input.scope,
        setting: setting.value,
      });
      if (!allowed.ok) throw new Rollback(refusal(allowed.error));
      const record: RoleRecord = {
        recordId: randomUUID(),
        kind: 'GRANTED',
        assignmentId: randomUUID(),
        principalId,
        role: input.role,
        scope: { kind: input.scope.kind, marjaIds: [...input.scope.marjaIds] },
        actor: this.actor(request),
        at: nowIso,
        reason: input.reason,
      };
      const inserted = await tx.insertRoleRecord(record);
      if (inserted.kind !== 'INSERTED') throw new Rollback(unavailable());
      const bumped = await tx.updateAccount(principalId, account.version, {}, true);
      if (bumped !== 'UPDATED')
        throw new Rollback(bumped === 'CONFLICT' ? conflict() : unavailable());
      await StaffAdministrationService.endAccess(tx, principalId, nowIso, 'ROLES_CHANGED');
      await StaffAdministrationService.requireAudit(
        tx,
        this.draft(
          request,
          requestId,
          'staff.role.granted',
          principalId,
          {
            role: input.role,
            scope: input.scope.kind,
            assignmentId: record.assignmentId,
            setting: setting.value,
            reason: input.reason,
          },
          input.scope.marjaIds,
        ),
      );
      return toStaffAccount(account, [...records, record]);
    });
  }

  async revokeRole(
    request: object,
    principalId: string,
    assignmentId: string,
    reason: string,
    requestId: string | null,
  ): Promise<StaffAccount> {
    const nowIso = iso(this.clock.now());
    // Authorize against the assignment actually held (role and scope from the store).
    const preview = await this.loadTarget(staffRepository(this.store.collections), principalId);
    const held = preview.target.roles.find((r) => r.assignmentId === assignmentId);
    this.authz.require(request, 'identity.role.assign', {
      type: 'ROLE_ASSIGNMENT',
      targetPrincipalId: principalId,
      role: held?.role ?? 'AUDITOR',
      scope: held?.scope ?? { kind: 'ALL', marjaIds: [] },
      stage: 'PROPOSE',
      proposedBy: null,
    });
    return this.atomically(async (tx) => {
      const { account, records, target } = await this.loadTarget(tx, principalId);
      const admins = await tx.activeSuperAdmins();
      if (!admins.ok) throw new Rollback(unavailable());
      const allowed = checkRoleRevocation({
        actorPrincipalId: this.actor(request),
        target,
        assignmentId,
        activeSuperAdmins: admins.value,
      });
      if (!allowed.ok) throw new Rollback(refusal(allowed.error));
      const record: RoleRecord = {
        recordId: randomUUID(),
        kind: 'REVOKED',
        assignmentId,
        principalId,
        role: allowed.value.role,
        scope: { kind: allowed.value.scope.kind, marjaIds: [...allowed.value.scope.marjaIds] },
        actor: this.actor(request),
        at: nowIso,
        reason,
      };
      const inserted = await tx.insertRoleRecord(record);
      if (inserted.kind !== 'INSERTED')
        throw new Rollback(inserted.kind === 'DUPLICATE' ? conflict() : unavailable());
      const bumped = await tx.updateAccount(principalId, account.version, {}, true);
      if (bumped !== 'UPDATED')
        throw new Rollback(bumped === 'CONFLICT' ? conflict() : unavailable());
      await StaffAdministrationService.endAccess(tx, principalId, nowIso, 'ROLES_CHANGED');
      await StaffAdministrationService.requireAudit(
        tx,
        this.draft(
          request,
          requestId,
          'staff.role.revoked',
          principalId,
          { role: record.role, assignmentId, reason },
          record.scope.marjaIds,
        ),
      );
      return toStaffAccount(account, [...records, record]);
    });
  }

  /**
   * Replaces one held assignment in ONE unit of work (decision 64): a REVOKED record for the old
   * assignment and a GRANTED record for the new role and scope, one session-epoch bump, sessions
   * revoked, and one `staff.role.replaced` audit event naming both assignments. Used to change a
   * scholar's Marjas and to convert a legacy role.
   */
  async replaceRole(
    request: object,
    principalId: string,
    assignmentId: string,
    input: { readonly role: GovernanceRole; readonly scope: RoleScope; readonly reason: string },
    requestId: string | null,
  ): Promise<StaffAccount> {
    const nowIso = iso(this.clock.now());
    const preview = await this.loadTarget(staffRepository(this.store.collections), principalId);
    const held = preview.target.roles.find((r) => r.assignmentId === assignmentId);
    // Both halves are authorized: removing the held assignment and granting the new one.
    this.authz.require(request, 'identity.role.assign', {
      type: 'ROLE_ASSIGNMENT',
      targetPrincipalId: principalId,
      role: held?.role ?? input.role,
      scope: held?.scope ?? input.scope,
      stage: 'PROPOSE',
      proposedBy: null,
    });
    this.authz.require(request, 'identity.role.assign', {
      type: 'ROLE_ASSIGNMENT',
      targetPrincipalId: principalId,
      role: input.role,
      scope: input.scope,
      stage: 'PROPOSE',
      proposedBy: null,
    });
    return this.atomically(async (tx) => {
      const { account, records, target } = await this.loadTarget(tx, principalId);
      const admins = await tx.activeSuperAdmins();
      const setting = await tx.administrativeControl();
      if (!admins.ok || !setting.ok) throw new Rollback(unavailable());
      const allowed = checkRoleReplacement({
        actorPrincipalId: this.actor(request),
        target,
        assignmentId,
        role: input.role,
        scope: input.scope,
        activeSuperAdmins: admins.value,
        setting: setting.value,
      });
      if (!allowed.ok) throw new Rollback(refusal(allowed.error));
      const old = allowed.value;
      const revoked: RoleRecord = {
        recordId: randomUUID(),
        kind: 'REVOKED',
        assignmentId,
        principalId,
        role: old.role,
        scope: { kind: old.scope.kind, marjaIds: [...old.scope.marjaIds] },
        actor: this.actor(request),
        at: nowIso,
        reason: input.reason,
      };
      const granted: RoleRecord = {
        recordId: randomUUID(),
        kind: 'GRANTED',
        assignmentId: randomUUID(),
        principalId,
        role: input.role,
        scope: { kind: input.scope.kind, marjaIds: [...input.scope.marjaIds] },
        actor: this.actor(request),
        at: nowIso,
        reason: input.reason,
      };
      const removed = await tx.insertRoleRecord(revoked);
      if (removed.kind !== 'INSERTED')
        throw new Rollback(removed.kind === 'DUPLICATE' ? conflict() : unavailable());
      const added = await tx.insertRoleRecord(granted);
      if (added.kind !== 'INSERTED') throw new Rollback(unavailable());
      const bumped = await tx.updateAccount(principalId, account.version, {}, true);
      if (bumped !== 'UPDATED')
        throw new Rollback(bumped === 'CONFLICT' ? conflict() : unavailable());
      await StaffAdministrationService.endAccess(tx, principalId, nowIso, 'ROLES_CHANGED');
      await StaffAdministrationService.requireAudit(
        tx,
        this.draft(
          request,
          requestId,
          'staff.role.replaced',
          principalId,
          {
            fromRole: old.role,
            fromAssignmentId: assignmentId,
            fromMarjaIds: [...old.scope.marjaIds],
            role: input.role,
            scope: input.scope.kind,
            assignmentId: granted.assignmentId,
            setting: setting.value,
            reason: input.reason,
          },
          [...new Set([...old.scope.marjaIds, ...input.scope.marjaIds])],
        ),
      );
      return toStaffAccount(account, [...records, revoked, granted]);
    });
  }

  async revokeSessions(
    request: object,
    principalId: string,
    reason: string,
    requestId: string | null,
  ): Promise<StaffAccount> {
    this.authz.require(request, 'identity.session.revoke', {
      type: 'SESSION',
      targetPrincipalId: principalId,
    });
    const nowIso = iso(this.clock.now());
    return this.atomically(async (tx) => {
      const { account, records, target } = await this.loadTarget(tx, principalId);
      const allowed = checkAccountAdministration({ actorPrincipalId: this.actor(request), target });
      if (!allowed.ok) throw new Rollback(refusal(allowed.error));
      const bumped = await tx.updateAccount(principalId, account.version, {}, true);
      if (bumped !== 'UPDATED')
        throw new Rollback(bumped === 'CONFLICT' ? conflict() : unavailable());
      await StaffAdministrationService.endAccess(
        tx,
        principalId,
        nowIso,
        'REVOKED_BY_ADMINISTRATOR',
      );
      await StaffAdministrationService.requireAudit(
        tx,
        this.draft(request, requestId, 'staff.sessions.revoked', principalId, { reason }),
      );
      return toStaffAccount(account, records);
    });
  }

  /**
   * Clears the account-wide (unknown devices) sign-in throttle: the safe recovery path when an
   * attacker has slowed sign-ins from new devices. Per-client and per-device counters expire.
   */
  async clearThrottle(
    request: object,
    principalId: string,
    reason: string,
    requestId: string | null,
  ): Promise<StaffAccount> {
    this.authz.require(request, 'identity.user.suspend', {
      type: 'ACCOUNT',
      targetPrincipalId: principalId,
    });
    const settings = this.config.staffAuth;
    if (settings === null) throw unavailable();
    return this.atomically(async (tx) => {
      const { account, records } = await this.loadTarget(tx, principalId);
      const reset = await tx.resetThrottle(accountKey(settings.secret, account.usernameKey));
      if (!reset.ok) throw new Rollback(unavailable());
      await StaffAdministrationService.requireAudit(
        tx,
        this.draft(request, requestId, 'staff.throttle.cleared', principalId, { reason }),
      );
      return toStaffAccount(account, records);
    });
  }
}
