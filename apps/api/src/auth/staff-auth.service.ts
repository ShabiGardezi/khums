import { randomUUID } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import {
  checkPasswordPolicy,
  normalizeUsername,
  permissionsForMarja,
  type PasswordPolicyIssue,
} from '@khums/core';
import { establishPrincipal } from '@khums/core/trusted-principal';
import type { AuditEventDraft, GovernancePermission } from '@khums/shared-types';
import { err, ok, type Result } from '@khums/utils';

import { InjectAppConfig, type AppConfig } from '../config';
import type { StaffAuthConfig } from '../config/app-config';
import { CLOCK, type Clock } from './auth.tokens';
import { checkCsrfToken, checkRequestOrigin, UNSAFE_METHODS, type CsrfFailure } from './csrf';
import { issueDeviceCookie, verifyDeviceCookie } from './device-cookie';
import { attemptKeys, checkThrottle, recordFailure, recordSuccess } from './login-throttle';
import { PASSWORD_HASHER, type PasswordHasher } from './password-hasher';
import { newToken, sha256Hex } from './secrets';
import {
  activeAssignments,
  staffRepository,
  type StaffAccountDoc,
  type StaffRepository,
} from './staff-repository';
import type { StaffAuthentication } from './staff-request';
import { Rollback, STAFF_STORE, type StaffStore } from './staff-store';

/**
 * Staff sign-in, per-request session validation, sign-out and password change (M4.6.2b;
 * docs/AUTH_ARCHITECTURE.md §4.10). The ONLY caller of `establishPrincipal`.
 *
 * Sessions are server-side: the cookie holds a random 256-bit id, the store holds its SHA-256
 * hash. Every request re-validates the session (not revoked, idle and absolute limits), the
 * account (ACTIVE) and the account's `sessionEpoch` (bumped on every password, status or role
 * change, so those changes end every older session immediately), and re-reads roles. Nothing a
 * client sends is used except the session cookie, the CSRF header and the documented request
 * bodies. Passwords, tokens and hashes are never logged.
 */

/** The identity issuer recorded in principals for local staff accounts (an identifier, never fetched). */
export const LOCAL_STAFF_ISSUER = 'https://staff-accounts.khums.invalid/';
/** Sliding idle expiry is written at most once per minute per session. */
const TOUCH_INTERVAL_MS = 60_000;
/** Temporary passwords expire 72 hours after they are issued. */
export const TEMPORARY_PASSWORD_LIFETIME_MS = 72 * 3_600_000;

export interface IssuedSession {
  readonly sessionToken: string;
  readonly csrfToken: string;
  readonly mustChangePassword: boolean;
  readonly sessionExpiresAt: string;
  readonly maxAgeMs: number;
  /** A fresh device cookie for this browser (see device-cookie.ts). */
  readonly deviceCookie: string;
}

export type LoginFailure =
  | { readonly kind: 'UNAVAILABLE' }
  | { readonly kind: 'INVALID_CREDENTIALS' }
  | { readonly kind: 'THROTTLED'; readonly retryAfterSeconds: number }
  | { readonly kind: 'ACCOUNT_NOT_ACTIVE' }
  | { readonly kind: 'TEMPORARY_PASSWORD_EXPIRED' };

export type AuthenticationFailure =
  | { readonly kind: 'UNAVAILABLE' }
  | { readonly kind: 'AUTHENTICATION_REQUIRED' }
  | { readonly kind: 'REAUTHENTICATION_REQUIRED' }
  | { readonly kind: 'SESSION_REVOKED' }
  | { readonly kind: 'ACCOUNT_NOT_ACTIVE' }
  | { readonly kind: 'CSRF_REJECTED'; readonly reason: CsrfFailure }
  | { readonly kind: 'ACCESS_DENIED' };

export type PasswordChangeFailure =
  | LoginFailure
  | { readonly kind: 'PASSWORD_POLICY_VIOLATION'; readonly issue: PasswordPolicyIssue }
  | { readonly kind: 'PASSWORD_REUSED' }
  | { readonly kind: 'CONFLICT' };

export interface RequestFacts {
  readonly method: string;
  readonly headers: Readonly<Record<string, string | string[] | undefined>>;
  readonly sessionToken: string | undefined;
  /** The device cookie value presented, if any (verified per account, never trusted alone). */
  readonly deviceCookie: string | undefined;
  /** The client IP the API can trust (signed by the web tier, or the TCP peer; client-ip.ts). */
  readonly clientIp: string;
  /** Where `clientIp` came from (logged on sign-in, never the address itself). */
  readonly clientIpSource?: 'SIGNED_EDGE' | 'PEER';
  readonly requestId: string | null;
}

const iso = (ms: number) => new Date(ms).toISOString();

@Injectable()
export class StaffAuthService {
  constructor(
    @InjectAppConfig() private readonly config: AppConfig,
    @Inject(STAFF_STORE) private readonly store: StaffStore,
    @Inject(PASSWORD_HASHER) private readonly hasher: PasswordHasher,
    @Inject(CLOCK) private readonly clock: Clock,
    @InjectPinoLogger(StaffAuthService.name) private readonly logger: PinoLogger,
  ) {}

  get settings(): StaffAuthConfig | null {
    return this.config.staffAuth;
  }

  now(): number {
    return this.clock.now();
  }

  private draft(
    type: string,
    actor: string | null,
    targetId: string | null,
    details: AuditEventDraft['details'],
    requestId: string | null,
  ): AuditEventDraft {
    return {
      eventId: randomUUID(),
      type,
      actor,
      targets: targetId === null ? [] : [{ kind: 'staffAccount', id: targetId }],
      marjaIds: [],
      details,
      requestId,
      occurredAt: iso(this.clock.now()),
    };
  }

  /** Best-effort audit for refusals (never changes the outcome); logs the code on failure. */
  private async auditRefusal(repo: StaffRepository, draft: AuditEventDraft): Promise<void> {
    const recorded = await repo.audit(draft);
    if (!recorded.ok)
      this.logger.warn({ code: recorded.error, type: draft.type }, 'Audit event not recorded');
  }

  /** Creates a session row for `account` (inside the caller's unit of work). */
  private async issueSession(
    repo: StaffRepository,
    account: StaffAccountDoc,
    sessionEpoch: number,
    passwordChangeOnly: boolean,
    nowMs: number,
  ): Promise<IssuedSession | null> {
    const settings = this.config.staffAuth;
    if (settings === null) return null;
    const sessionToken = newToken();
    const csrfToken = newToken();
    const absolute = nowMs + settings.sessionAbsoluteMs;
    const idle = Math.min(nowMs + settings.sessionIdleMs, absolute);
    const inserted = await repo.insertSession({
      sessionIdHash: sha256Hex(sessionToken),
      principalId: account.principalId,
      csrfTokenHash: sha256Hex(csrfToken),
      sessionEpoch,
      passwordChangeOnly,
      authenticatedAt: iso(nowMs),
      createdAt: iso(nowMs),
      lastSeenAt: iso(nowMs),
      idleExpiresAt: iso(idle),
      absoluteExpiresAt: iso(absolute),
      expireAt: new Date(absolute),
      revokedAt: null,
      revokedReason: null,
    });
    if (inserted.kind !== 'INSERTED') return null;
    return {
      sessionToken,
      csrfToken,
      mustChangePassword: passwordChangeOnly,
      sessionExpiresAt: iso(idle),
      maxAgeMs: settings.sessionAbsoluteMs,
      deviceCookie: issueDeviceCookie(settings.secret, account.principalId, nowMs),
    };
  }

  async login(
    input: { readonly username: string; readonly password: string },
    facts: RequestFacts,
  ): Promise<Result<IssuedSession, LoginFailure>> {
    const settings = this.config.staffAuth;
    if (settings === null) return err({ kind: 'UNAVAILABLE' });
    const repo = staffRepository(this.store.collections);
    const nowMs = this.clock.now();
    const normalized = normalizeUsername(input.username);
    const found = normalized.ok ? await repo.accountByUsernameKey(normalized.value) : ok(null);
    if (!found.ok) return err({ kind: 'UNAVAILABLE' });
    const account = found.value;
    // A known device of THIS account is throttled on its own (no lockout from elsewhere).
    const deviceId =
      account === null
        ? null
        : verifyDeviceCookie(settings.secret, facts.deviceCookie, account.principalId, nowMs);
    const keys = attemptKeys(
      settings.secret,
      normalized.ok ? normalized.value : input.username,
      facts.clientIp,
      deviceId,
    );

    const throttle = await checkThrottle(repo, keys, nowMs);
    if (throttle.kind === 'UNAVAILABLE') return err({ kind: 'UNAVAILABLE' });
    if (throttle.kind === 'THROTTLED') {
      // Not audited (an attacker could otherwise grow the audit chain at will); logged by code.
      this.logger.warn({ code: 'LOGIN_THROTTLED', key: throttle.key }, 'Staff sign-in throttled');
      return err({ kind: 'THROTTLED', retryAfterSeconds: throttle.retryAfterSeconds });
    }

    const valid =
      account === null
        ? (await this.hasher.dummyVerify(input.password), false)
        : await this.hasher.verify(account.passwordHash, input.password);
    if (account === null || !valid) {
      if (!(await recordFailure(repo, keys, nowMs))) return err({ kind: 'UNAVAILABLE' });
      // The submitted username is NOT recorded (it may be a mistyped password).
      await this.auditRefusal(
        repo,
        this.draft(
          'staff.signin.failed',
          null,
          account?.principalId ?? null,
          { reason: 'INVALID_CREDENTIALS' },
          facts.requestId,
        ),
      );
      return err({ kind: 'INVALID_CREDENTIALS' });
    }
    await recordSuccess(repo, keys);

    if (account.status !== 'ACTIVE') {
      await this.auditRefusal(
        repo,
        this.draft(
          'staff.signin.refused',
          account.principalId,
          account.principalId,
          { reason: 'ACCOUNT_NOT_ACTIVE' },
          facts.requestId,
        ),
      );
      return err({ kind: 'ACCOUNT_NOT_ACTIVE' });
    }
    if (
      account.mustChangePassword &&
      (account.temporaryPasswordExpiresAt === null ||
        Date.parse(account.temporaryPasswordExpiresAt) <= nowMs)
    ) {
      await this.auditRefusal(
        repo,
        this.draft(
          'staff.signin.refused',
          account.principalId,
          account.principalId,
          { reason: 'TEMPORARY_PASSWORD_EXPIRED' },
          facts.requestId,
        ),
      );
      return err({ kind: 'TEMPORARY_PASSWORD_EXPIRED' });
    }
    if (!account.mustChangePassword && this.hasher.needsRehash(account.passwordHash)) {
      // Upgrade the stored hash to the current parameters (a lost race is harmless).
      await repo.updateAccount(
        account.principalId,
        account.version,
        { passwordHash: await this.hasher.hash(input.password) },
        false,
      );
    }

    const issued = await this.store.atomically<IssuedSession | null>(async (c) => {
      const tx = staffRepository(c);
      // Session rotation: a session the browser still presents is ended, never reused.
      if (facts.sessionToken !== undefined) {
        await tx.revokeSession(sha256Hex(facts.sessionToken), iso(nowMs), 'ROTATED_AT_SIGN_IN');
      }
      const session = await this.issueSession(
        tx,
        account,
        account.sessionEpoch,
        account.mustChangePassword,
        nowMs,
      );
      if (session === null) throw new Rollback(null);
      const audited = await tx.audit(
        this.draft(
          'staff.signin.succeeded',
          account.principalId,
          account.principalId,
          { temporaryPassword: account.mustChangePassword },
          facts.requestId,
        ),
      );
      if (!audited.ok) throw new Rollback(null);
      return session;
    });
    if (issued === null) return err({ kind: 'UNAVAILABLE' });
    // Deployment check: on Vercel this must say SIGNED_EDGE (docs/DEPLOYMENT_VERIFICATION.md).
    this.logger.info({ clientIpSource: facts.clientIpSource ?? 'PEER' }, 'Staff signed in');
    return ok(issued);
  }

  /**
   * Validates the session for one request and establishes the principal. Unsafe methods pass the
   * Origin and Sec-Fetch-Site checks before anything else, then the session-bound CSRF token.
   */
  async authenticate(
    facts: RequestFacts,
  ): Promise<Result<StaffAuthentication, AuthenticationFailure>> {
    const settings = this.config.staffAuth;
    if (settings === null) return err({ kind: 'UNAVAILABLE' });
    const unsafe = UNSAFE_METHODS.has(facts.method.toUpperCase());
    if (unsafe) {
      const origin = checkRequestOrigin(facts.headers, settings.allowedOrigins);
      if (origin !== null) return err({ kind: 'CSRF_REJECTED', reason: origin });
    }
    if (facts.sessionToken === undefined) return err({ kind: 'AUTHENTICATION_REQUIRED' });

    const repo = staffRepository(this.store.collections);
    const nowMs = this.clock.now();
    const sessionIdHash = sha256Hex(facts.sessionToken);
    const found = await repo.sessionByHash(sessionIdHash);
    if (!found.ok) return err({ kind: 'UNAVAILABLE' });
    const session = found.value;
    if (session === null) return err({ kind: 'REAUTHENTICATION_REQUIRED' });
    if (session.revokedAt !== null) return err({ kind: 'SESSION_REVOKED' });
    if (
      Date.parse(session.idleExpiresAt) <= nowMs ||
      Date.parse(session.absoluteExpiresAt) <= nowMs
    ) {
      return err({ kind: 'REAUTHENTICATION_REQUIRED' });
    }
    if (unsafe) {
      const token = checkCsrfToken(facts.headers['x-csrf-token'], session.csrfTokenHash);
      if (token !== null) return err({ kind: 'CSRF_REJECTED', reason: token });
    }

    const [account, records] = await Promise.all([
      repo.accountById(session.principalId),
      repo.roleRecords(session.principalId),
    ]);
    if (!account.ok || !records.ok) return err({ kind: 'UNAVAILABLE' });
    if (account.value === null) return err({ kind: 'REAUTHENTICATION_REQUIRED' });
    if (account.value.status !== 'ACTIVE') {
      await repo.revokeSession(sessionIdHash, iso(nowMs), 'ACCOUNT_NOT_ACTIVE');
      return err({ kind: 'ACCOUNT_NOT_ACTIVE' });
    }
    // Any password, status or role change since this session was issued ends it.
    if (account.value.sessionEpoch !== session.sessionEpoch)
      return err({ kind: 'SESSION_REVOKED' });

    let idleExpiresAt = session.idleExpiresAt;
    if (nowMs - Date.parse(session.lastSeenAt) >= TOUCH_INTERVAL_MS) {
      idleExpiresAt = iso(
        Math.min(nowMs + settings.sessionIdleMs, Date.parse(session.absoluteExpiresAt)),
      );
      const touched = await repo.touchSession(sessionIdHash, iso(nowMs), idleExpiresAt);
      if (!touched.ok) return err({ kind: 'UNAVAILABLE' });
    }

    const established = establishPrincipal({
      principalId: account.value.principalId,
      establishedAt: iso(nowMs),
      identity: {
        issuer: LOCAL_STAFF_ISSUER,
        subject: account.value.principalId,
        emailVerified: false,
      },
      accountStatus: account.value.status,
      roles: activeAssignments(records.value, account.value.principalId),
      authentication: {
        authenticatedAt: session.authenticatedAt,
        methods: ['PASSWORD'],
        assurance: 'AAL1',
      },
      session: {
        sessionId: sessionIdHash,
        issuedAt: session.createdAt,
        idleExpiresAt,
        absoluteExpiresAt: session.absoluteExpiresAt,
      },
    });
    if (!established.ok) {
      // Stored roles that do not fit the model (malformed or inconsistent records): deny.
      this.logger.error({ code: established.error }, 'Staff principal refused');
      return err({ kind: 'ACCESS_DENIED' });
    }
    return ok({
      principal: established.value,
      sessionState: 'ACTIVE',
      session: {
        sessionIdHash,
        passwordChangeOnly: session.passwordChangeOnly,
        expiresAt: idleExpiresAt,
      },
      account: { username: account.value.username },
    });
  }

  async logout(auth: StaffAuthentication, requestId: string | null): Promise<void> {
    const nowMs = this.clock.now();
    await this.store.atomically(async (c) => {
      const tx = staffRepository(c);
      await tx.revokeSession(auth.session.sessionIdHash, iso(nowMs), 'SIGNED_OUT');
      const principalId = auth.principal.principalId;
      await tx.audit(this.draft('staff.signout', principalId, principalId, {}, requestId));
    });
  }

  /**
   * Changes the signed-in account's password. The new password must pass the policy and differ
   * from the current one, which is also how a temporary password can never become permanent.
   * Every session of the account is revoked and a fresh session is issued (rotation).
   */
  /**
   * Which of `principalIds` hold `permission` for `marjaId` NOW: an ACTIVE account whose roles in
   * force grant it there (catalogue rule, `permissionsForMarja`). Used to stop counting a source
   * verification whose verifier lost the right to verify (audit BLD-07). Never grants anything.
   */
  async principalsHolding(
    permission: GovernancePermission,
    marjaId: string,
    principalIds: readonly string[],
  ): Promise<Result<ReadonlySet<string>, 'UNAVAILABLE'>> {
    const repo = staffRepository(this.store.collections);
    const records = await repo.roleRecords();
    if (!records.ok) return err('UNAVAILABLE');
    const holding = new Set<string>();
    for (const principalId of new Set(principalIds)) {
      const account = await repo.accountById(principalId);
      if (!account.ok) return err('UNAVAILABLE');
      if (account.value?.status !== 'ACTIVE') continue;
      const roles = activeAssignments(records.value, principalId);
      if (permissionsForMarja(roles, marjaId).includes(permission)) holding.add(principalId);
    }
    return ok(holding);
  }

  async changePassword(
    auth: StaffAuthentication,
    input: { readonly currentPassword: string; readonly newPassword: string },
    facts: RequestFacts,
  ): Promise<Result<IssuedSession, PasswordChangeFailure>> {
    const settings = this.config.staffAuth;
    if (settings === null) return err({ kind: 'UNAVAILABLE' });
    const repo = staffRepository(this.store.collections);
    const nowMs = this.clock.now();
    const found = await repo.accountById(auth.principal.principalId);
    if (!found.ok || found.value === null) return err({ kind: 'UNAVAILABLE' });
    const account = found.value;

    const keys = attemptKeys(
      settings.secret,
      account.usernameKey,
      facts.clientIp,
      verifyDeviceCookie(settings.secret, facts.deviceCookie, account.principalId, nowMs),
    );
    const throttle = await checkThrottle(repo, keys, nowMs);
    if (throttle.kind === 'UNAVAILABLE') return err({ kind: 'UNAVAILABLE' });
    if (throttle.kind === 'THROTTLED')
      return err({ kind: 'THROTTLED', retryAfterSeconds: throttle.retryAfterSeconds });

    if (!(await this.hasher.verify(account.passwordHash, input.currentPassword))) {
      if (!(await recordFailure(repo, keys, nowMs))) return err({ kind: 'UNAVAILABLE' });
      await this.auditRefusal(
        repo,
        this.draft(
          'staff.password.changeRefused',
          account.principalId,
          account.principalId,
          { reason: 'INVALID_CREDENTIALS' },
          facts.requestId,
        ),
      );
      return err({ kind: 'INVALID_CREDENTIALS' });
    }
    const policy = checkPasswordPolicy(input.newPassword, account.usernameKey);
    if (!policy.ok) return err({ kind: 'PASSWORD_POLICY_VIOLATION', issue: policy.error });
    // The current hash is the temporary password while one is in force.
    if (await this.hasher.verify(account.passwordHash, input.newPassword))
      return err({ kind: 'PASSWORD_REUSED' });
    const passwordHash = await this.hasher.hash(input.newPassword);

    const outcome = await this.store.atomically(
      async (c): Promise<Result<IssuedSession, PasswordChangeFailure>> => {
        const tx = staffRepository(c);
        const updated = await tx.updateAccount(
          account.principalId,
          account.version,
          {
            passwordHash,
            passwordChangedAt: iso(nowMs),
            mustChangePassword: false,
            temporaryPasswordExpiresAt: null,
          },
          true,
        );
        if (updated !== 'UPDATED')
          throw new Rollback(
            err({ kind: updated === 'CONFLICT' ? 'CONFLICT' : 'UNAVAILABLE' } as const),
          );
        const revoked = await tx.revokeAllSessions(
          account.principalId,
          iso(nowMs),
          'PASSWORD_CHANGED',
        );
        if (!revoked.ok) throw new Rollback(err({ kind: 'UNAVAILABLE' } as const));
        const session = await this.issueSession(
          tx,
          account,
          account.sessionEpoch + 1,
          false,
          nowMs,
        );
        if (session === null) throw new Rollback(err({ kind: 'UNAVAILABLE' } as const));
        const audited = await tx.audit(
          this.draft(
            'staff.password.changed',
            account.principalId,
            account.principalId,
            { wasTemporary: account.mustChangePassword },
            facts.requestId,
          ),
        );
        if (!audited.ok) throw new Rollback(err({ kind: 'UNAVAILABLE' } as const));
        return ok(session);
      },
    );
    if (outcome.ok) await recordSuccess(repo, keys);
    return outcome;
  }
}
