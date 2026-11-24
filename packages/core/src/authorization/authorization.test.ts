import { describe, expect, it } from 'vitest';

import type {
  AuthorizationDecision,
  AuthorizationResource,
  GovernancePermission,
  GovernanceRole,
} from '@khums/shared-types';

import * as core from '../index';
import {
  ANY_MARJA_PERMISSIONS,
  CROSS_MARJA_READ_ONLY_PERMISSIONS,
  DUAL_CONTROL_ROLES,
  GOVERNANCE_PERMISSIONS,
  MARJA_SCOPED_ROLES,
  PERMISSION_REQUIREMENTS,
  PRINCIPAL_MAX_AGE_MS,
  ROLE_PERMISSIONS,
} from './catalogue';
import { authorize } from './evaluate';
import * as principalModule from './principal';
import { establishPrincipal, isTrustedPrincipal } from './principal';
import {
  context,
  ledgerUnderReview,
  ledgerWithResubmission,
  marjaScope,
  MARJA,
  MINUTE,
  NOW,
  packResource,
  principal,
  principalInput,
  shift,
  testPack,
} from './test-support';

/**
 * Adversarial authorization tests (M4.6.1). Security policy only; no religious content.
 * Every fixture identity is a test value.
 */

const ROLES = Object.keys(ROLE_PERMISSIONS) as GovernanceRole[];
const OTHER = 'test-other-person';
const SUBJECT = 'test-subject';

const RESOURCES: Readonly<Record<AuthorizationResource['type'], AuthorizationResource>> = {
  RULE_PACK_VERSION: packResource(),
  MARJA_RESEARCH: { type: 'MARJA_RESEARCH', marjaId: MARJA },
  ACCOUNT: { type: 'ACCOUNT', targetPrincipalId: OTHER },
  SESSION: { type: 'SESSION', targetPrincipalId: OTHER },
  ROLE_ASSIGNMENT: {
    type: 'ROLE_ASSIGNMENT',
    targetPrincipalId: OTHER,
    role: 'AUDITOR',
    scope: { kind: 'ALL', marjaIds: [] },
    stage: 'PROPOSE',
    proposedBy: null,
  },
  AUDIT_LOG: { type: 'AUDIT_LOG' },
  GOVERNANCE_POLICY: { type: 'GOVERNANCE_POLICY', marjaId: MARJA },
};

// Ledgers where SUBJECT is not an author; for CURRENT_REVIEWER permissions, SUBJECT is the
// current reviewer. Built once.
const NEUTRAL_LEDGER = ledgerUnderReview('test-author', 'test-reviewer', true);
const SUBJECT_REVIEWS_LEDGER = ledgerUnderReview('test-author', SUBJECT);
const ledgerFor = (permission: GovernancePermission) =>
  PERMISSION_REQUIREMENTS[permission].separation === 'CURRENT_REVIEWER'
    ? SUBJECT_REVIEWS_LEDGER
    : NEUTRAL_LEDGER;

const decide = (
  who: unknown,
  permission: unknown,
  resource: unknown,
  ctx: unknown,
): AuthorizationDecision => authorize({ principal: who, permission, resource, context: ctx });

const reasonOf = (d: AuthorizationDecision) => (d.allowed ? 'ALLOWED' : d.reason);

/** Standard request for `permission` by a principal; neutral separation context. */
function request(
  who: ReturnType<typeof principal>,
  permission: GovernancePermission,
  overrides: { resource?: unknown; ledger?: ReturnType<typeof ledgerUnderReview> | null } = {},
) {
  return decide(
    who,
    permission,
    overrides.resource ?? RESOURCES[PERMISSION_REQUIREMENTS[permission].resource],
    context(who, overrides.ledger === undefined ? ledgerFor(permission) : overrides.ledger),
  );
}

/** The scholar permissions (former GOVERNING_SCHOLAR, unchanged), within the assigned Marjas. */
const SCHOLAR_MATRIX: readonly GovernancePermission[] = [
  'research.read',
  'research.audit.read',
  'research.source.record',
  'research.source.verify',
  'research.translation.edit',
  'research.translation.review',
  'research.finding.edit',
  'research.finding.verify',
  'research.finding.approve',
  'research.ruling.edit',
  'research.ruling.approve',
  'research.ruling.withdraw',
  'pack.draft.create',
  'pack.draft.edit',
  'pack.seal',
  'governance.submit',
  'governance.review.start',
  'governance.review.requestChanges',
  'governance.review.complete',
  'governance.approve',
  'governance.publish',
  'governance.supersede',
  'governance.withdraw',
  'governance.activate',
  'governance.ledger.read',
  'provisional.pack.register',
  'provisional.pack.enable',
  'provisional.pack.disable',
  'provisional.pack.read',
  'provisional.calculate',
  'feedback.submit',
  'feedback.read',
  'feedback.respond',
  // Phase 2 steps 3–4: scholar rule builder.
  'builder.rule.read',
  'builder.rule.edit',
  'builder.rule.test',
  // Phase 2 step 5: source verification (decision 67), own Marjas only.
  'builder.rule.verify',
];

describe('permission catalogue (docs/AUTH_ARCHITECTURE.md §5.2)', () => {
  it('matches the documented role → permission matrix exactly', () => {
    // Decision 64 (owner decision 2026-11-23): SUPER_ADMIN holds every permission; SCHOLAR is the
    // former GOVERNING_SCHOLAR, which stays readable and grants exactly the same permissions.
    expect(ROLE_PERMISSIONS).toEqual({
      SUPER_ADMIN: [...GOVERNANCE_PERMISSIONS],
      SCHOLAR: SCHOLAR_MATRIX,
      RULE_PACK_AUTHOR: [
        'pack.draft.create',
        'pack.draft.edit',
        'pack.seal',
        'governance.submit',
        'governance.ledger.read',
        'provisional.pack.register',
        'provisional.pack.read',
        'provisional.calculate',
        'feedback.read',
        'feedback.respond',
      ],
      RELIGIOUS_RESEARCHER: [
        'governance.ledger.read',
        'provisional.pack.read',
        'provisional.calculate',
        'feedback.submit',
        'feedback.read',
      ],
      SCHOLAR_REVIEWER: [
        'governance.review.start',
        'governance.review.requestChanges',
        'governance.review.complete',
        'governance.ledger.read',
        'provisional.pack.disable',
        'provisional.pack.read',
        'provisional.calculate',
        'feedback.submit',
        'feedback.read',
      ],
      INDEPENDENT_APPROVER: [
        'governance.approve',
        'governance.publish',
        'governance.supersede',
        'governance.withdraw',
        'governance.ledger.read',
        'provisional.pack.read',
        'provisional.calculate',
        'feedback.submit',
        'feedback.read',
      ],
      AUDITOR: [
        'research.audit.read',
        'governance.ledger.read',
        'audit.log.read',
        'identity.user.read',
        'provisional.pack.read',
        'feedback.read',
      ],
      GOVERNING_SCHOLAR: SCHOLAR_MATRIX,
    });
  });

  it('requires a password sign-in (AAL1) for every permission: no mandatory MFA, no step-up', () => {
    for (const p of GOVERNANCE_PERMISSIONS) {
      expect(PERMISSION_REQUIREMENTS[p], p).toEqual({
        resource: PERMISSION_REQUIREMENTS[p].resource,
        assurance: 'AAL1',
        separation: PERMISSION_REQUIREMENTS[p].separation,
      });
    }
  });

  it('keeps every separation-of-duties rule (the 2026-11-21 decisions change only MFA)', () => {
    const separation = Object.fromEntries(
      GOVERNANCE_PERMISSIONS.map((p) => [p, PERMISSION_REQUIREMENTS[p].separation]),
    );
    expect(separation).toEqual({
      'pack.draft.create': 'NONE',
      'pack.draft.edit': 'NONE',
      'pack.seal': 'NONE',
      'governance.submit': 'NONE',
      'research.read': 'NONE',
      'research.audit.read': 'NONE',
      'research.source.record': 'NONE',
      'research.source.verify': 'NONE',
      'research.translation.edit': 'NONE',
      'research.translation.review': 'NONE',
      'research.finding.edit': 'NONE',
      'research.finding.verify': 'NONE',
      'research.finding.approve': 'NONE',
      'research.ruling.edit': 'NONE',
      'research.ruling.approve': 'NONE',
      'research.ruling.withdraw': 'NONE',
      'governance.review.start': 'NOT_AN_AUTHOR',
      'governance.review.requestChanges': 'CURRENT_REVIEWER',
      'governance.review.complete': 'CURRENT_REVIEWER',
      'governance.approve': 'INDEPENDENT_OF_AUTHORS_AND_REVIEWER',
      'governance.publish': 'INDEPENDENT_OF_AUTHORS_AND_REVIEWER',
      'governance.supersede': 'INDEPENDENT_OF_AUTHORS_AND_REVIEWER',
      'governance.withdraw': 'NONE',
      'governance.withdraw.emergency': 'NONE',
      'governance.activate': 'INDEPENDENT_OF_APPROVAL_CHAIN',
      'governance.ledger.read': 'NONE',
      'audit.log.read': 'NONE',
      'identity.user.read': 'NONE',
      'identity.user.invite': 'NOT_SELF',
      'identity.user.suspend': 'NOT_SELF',
      'identity.role.assign': 'DUAL_CONTROL',
      'identity.session.revoke': 'NONE',
      'governance.policy.change': 'NONE',
      'governance.policy.bindLegacy': 'NONE',
      'provisional.pack.register': 'NONE',
      'provisional.pack.enable': 'NONE',
      'provisional.pack.disable': 'NONE',
      'provisional.pack.emergencyDisable': 'NONE',
      'provisional.pack.read': 'NONE',
      'provisional.calculate': 'NONE',
      'feedback.submit': 'NONE',
      'feedback.read': 'NONE',
      'feedback.respond': 'NONE',
      'builder.rule.read': 'NONE',
      'builder.rule.edit': 'NONE',
      'builder.rule.test': 'NONE',
      'builder.rule.verify': 'NONE',
    });
  });

  it('gives SUPER_ADMIN complete platform access (decision 64 supersedes decisions 37/56/57)', () => {
    // Policy change: administrators formerly held no review, approval, publication, research or
    // provisional permission. The owner decision of 2026-11-23 gives SUPER_ADMIN every permission.
    expect(ROLE_PERMISSIONS.SUPER_ADMIN).toEqual(GOVERNANCE_PERMISSIONS);
  });

  it('keeps the five non-scholar legacy roles exactly as before (no broadening)', () => {
    // Unchanged from the pre-Phase-2 matrix above; asserted again as the legacy guarantee.
    expect(ROLE_PERMISSIONS.AUDITOR).not.toContain('research.read');
    expect(ROLE_PERMISSIONS.RELIGIOUS_RESEARCHER).not.toContain('research.read');
    expect(ROLE_PERMISSIONS.RULE_PACK_AUTHOR).not.toContain('provisional.pack.enable');
    for (const role of [
      'RULE_PACK_AUTHOR',
      'RELIGIOUS_RESEARCHER',
      'SCHOLAR_REVIEWER',
      'INDEPENDENT_APPROVER',
      'AUDITOR',
    ] as const) {
      expect(ANY_MARJA_PERMISSIONS[role], role).toEqual([]);
    }
    expect(ROLE_PERMISSIONS.GOVERNING_SCHOLAR).toEqual(ROLE_PERMISSIONS.SCHOLAR);
    expect(ANY_MARJA_PERMISSIONS.GOVERNING_SCHOLAR).toEqual(ANY_MARJA_PERMISSIONS.SCHOLAR);
  });

  it('cross-Marja access is read-only and held only by the scholar roles', () => {
    expect(CROSS_MARJA_READ_ONLY_PERMISSIONS).toEqual([
      'research.read',
      'provisional.pack.read',
      'provisional.calculate',
      'builder.rule.read',
      'builder.rule.test',
    ]);
    for (const role of ROLES) {
      for (const p of ANY_MARJA_PERMISSIONS[role]) {
        expect(ROLE_PERMISSIONS[role], `${role} ${p}`).toContain(p);
        expect(CROSS_MARJA_READ_ONLY_PERMISSIONS, `${role} ${p}`).toContain(p);
        expect(PERMISSION_REQUIREMENTS[p].separation).toBe('NONE');
      }
    }
    expect(ANY_MARJA_PERMISSIONS.SUPER_ADMIN).toEqual([]); // scope ALL already covers everything
    expect(Object.isFrozen(ANY_MARJA_PERMISSIONS.SCHOLAR)).toBe(true);
    expect(MARJA_SCOPED_ROLES).not.toContain('SUPER_ADMIN');
    expect(MARJA_SCOPED_ROLES).not.toContain('AUDITOR');
  });

  it('every catalogued permission is granted by at least one role, and catalogues are frozen', () => {
    for (const p of GOVERNANCE_PERMISSIONS) {
      expect(ROLES.some((r) => ROLE_PERMISSIONS[r].includes(p))).toBe(true);
    }
    expect(Object.isFrozen(ROLE_PERMISSIONS)).toBe(true);
    expect(Object.isFrozen(ROLE_PERMISSIONS.AUDITOR)).toBe(true);
    expect(Object.isFrozen(PERMISSION_REQUIREMENTS['governance.approve'])).toBe(true);
    expect(() => {
      (ROLE_PERMISSIONS.AUDITOR as GovernancePermission[]).push('governance.approve');
    }).toThrow(TypeError);
  });
});

describe('all permissions × all role combinations', () => {
  it('allows exactly what the union of held roles grants (every combination × every permission)', () => {
    // Decision 64: no role combination is forbidden any more (formerly SUPER_ADMIN with a
    // religious role was refused); every one of the 2^8 combinations is established.
    let checked = 0;
    for (let mask = 0; mask < 1 << ROLES.length; mask += 1) {
      const held = ROLES.filter((_, i) => (mask & (1 << i)) !== 0);
      const who = principal(SUBJECT, { roles: held });
      expect(who.permissions).toEqual(
        GOVERNANCE_PERMISSIONS.filter((p) => held.some((r) => ROLE_PERMISSIONS[r].includes(p))),
      );
      for (const permission of GOVERNANCE_PERMISSIONS) {
        const granted = held.some((r) => ROLE_PERMISSIONS[r].includes(permission));
        expect([mask, permission, reasonOf(request(who, permission))]).toEqual([
          mask,
          permission,
          granted ? 'ALLOWED' : 'MISSING_PERMISSION',
        ]);
        checked += 1;
      }
    }
    expect(ROLES).toHaveLength(8);
    expect(checked).toBe(256 * GOVERNANCE_PERMISSIONS.length);
    expect(GOVERNANCE_PERMISSIONS).toHaveLength(47);
    // Exhaustive (256 role combinations × every permission): slow under the parallel full suite.
  }, 180_000);
});

describe('roles × permissions × Marja scope (decision 64)', () => {
  const OWN = MARJA;
  const ELSEWHERE = 'test-elsewhere-marja';
  const ownPack = packResource(OWN);
  const otherPack = packResource(ELSEWHERE);
  const forMarja = (
    type: AuthorizationResource['type'],
    marjaId: string,
  ): AuthorizationResource => {
    switch (type) {
      case 'RULE_PACK_VERSION':
        return packResource(marjaId);
      case 'MARJA_RESEARCH':
      case 'GOVERNANCE_POLICY':
        return { type, marjaId };
      case 'ACCOUNT':
      case 'SESSION':
      case 'ROLE_ASSIGNMENT':
      case 'AUDIT_LOG':
        return RESOURCES[type];
    }
  };
  // Ledger separation needs a ledger for the requested pack; the cross-Marja pack has none, so
  // only separation-free permissions are compared there (all ANY_MARJA permissions are).
  const ledgerOf = (resource: AuthorizationResource, permission: GovernancePermission) =>
    resource.type === 'RULE_PACK_VERSION' && resource.marjaId === OWN
      ? ledgerFor(permission)
      : null;

  it('every role with a MARJA scope: full permissions in its Marja, read-only elsewhere', () => {
    for (const role of MARJA_SCOPED_ROLES) {
      const who = principal(SUBJECT, { roles: [[role, marjaScope(OWN)]] });
      for (const permission of GOVERNANCE_PERMISSIONS) {
        const type = PERMISSION_REQUIREMENTS[permission].resource;
        const own = forMarja(type, OWN);
        const other = forMarja(type, ELSEWHERE);
        const held = ROLE_PERMISSIONS[role].includes(permission);
        const marjaTyped =
          type === 'RULE_PACK_VERSION' || type === 'MARJA_RESEARCH' || type === 'GOVERNANCE_POLICY';
        const expectedOwn = !held ? 'MISSING_PERMISSION' : marjaTyped ? 'ALLOWED' : 'OUT_OF_SCOPE';
        expect([
          role,
          permission,
          reasonOf(request(who, permission, { resource: own, ledger: ledgerOf(own, permission) })),
        ]).toEqual([role, permission, expectedOwn]);
        if (PERMISSION_REQUIREMENTS[permission].separation !== 'NONE') continue;
        const expectedOther = !held
          ? 'MISSING_PERMISSION'
          : ANY_MARJA_PERMISSIONS[role].includes(permission) && type !== 'GOVERNANCE_POLICY'
            ? 'ALLOWED'
            : 'OUT_OF_SCOPE';
        expect([
          role,
          permission,
          'other',
          reasonOf(request(who, permission, { resource: other, ledger: null })),
        ]).toEqual([role, permission, 'other', expectedOther]);
      }
    }
  });

  it('SCHOLAR tests other Marjas read-only: calculate and read allowed, every write denied', () => {
    for (const role of ['SCHOLAR', 'GOVERNING_SCHOLAR'] as const) {
      const scholar = principal('test-scholar', { roles: [[role, marjaScope(OWN)]] });
      for (const p of ['provisional.calculate', 'provisional.pack.read'] as const) {
        expect(reasonOf(request(scholar, p, { resource: otherPack, ledger: null })), p).toBe(
          'ALLOWED',
        );
        expect(reasonOf(request(scholar, p, { resource: ownPack, ledger: null })), p).toBe(
          'ALLOWED',
        );
      }
      expect(
        reasonOf(
          request(scholar, 'research.read', {
            resource: { type: 'MARJA_RESEARCH', marjaId: ELSEWHERE },
          }),
        ),
      ).toBe('ALLOWED');
      for (const p of [
        'provisional.pack.register',
        'provisional.pack.enable',
        'provisional.pack.disable',
        'feedback.submit',
        'feedback.read',
        'feedback.respond',
        'governance.ledger.read',
        'governance.withdraw',
        'governance.submit',
        'pack.seal',
      ] as const) {
        expect(reasonOf(request(scholar, p, { resource: otherPack, ledger: null })), p).toBe(
          'OUT_OF_SCOPE',
        );
      }
      for (const p of [
        'research.audit.read',
        'research.source.record',
        'research.source.verify',
        'research.translation.edit',
        'research.translation.review',
        'research.finding.edit',
        'research.finding.verify',
        'research.finding.approve',
        'research.ruling.edit',
        'research.ruling.approve',
        'research.ruling.withdraw',
      ] as const) {
        expect(
          reasonOf(
            request(scholar, p, { resource: { type: 'MARJA_RESEARCH', marjaId: ELSEWHERE } }),
          ),
          p,
        ).toBe('OUT_OF_SCOPE');
      }
      for (const p of [
        'governance.review.start',
        'governance.approve',
        'governance.publish',
        'governance.activate',
      ] as const) {
        expect(reasonOf(request(scholar, p, { resource: otherPack })), p).toBe('OUT_OF_SCOPE');
      }
      expect(
        reasonOf(
          request(scholar, 'governance.policy.change', {
            resource: { type: 'GOVERNANCE_POLICY', marjaId: ELSEWHERE },
          }),
        ),
      ).toBe('MISSING_PERMISSION');
      // No identity or audit access at all.
      for (const p of ['identity.user.read', 'identity.role.assign', 'audit.log.read'] as const) {
        expect(reasonOf(request(scholar, p)), p).toBe('MISSING_PERMISSION');
      }
    }
  });

  it('SCHOLAR with several Marjas covers each of them fully', () => {
    const scholar = principal('test-scholar', {
      roles: [['SCHOLAR', marjaScope(ELSEWHERE, OWN)]],
    });
    expect(reasonOf(request(scholar, 'provisional.pack.enable', { resource: otherPack }))).toBe(
      'ALLOWED',
    );
    expect(reasonOf(request(scholar, 'provisional.pack.enable', { resource: ownPack }))).toBe(
      'ALLOWED',
    );
  });

  it('SUPER_ADMIN (scope ALL) is allowed every permission on every Marja', () => {
    // SUBJECT is the current reviewer in the review-continuation ledgers (separation still applies).
    const admin = principal(SUBJECT, { roles: ['SUPER_ADMIN'] });
    for (const permission of GOVERNANCE_PERMISSIONS) {
      expect(reasonOf(request(admin, permission)), permission).toBe('ALLOWED');
      if (PERMISSION_REQUIREMENTS[permission].separation === 'NONE') {
        const type = PERMISSION_REQUIREMENTS[permission].resource;
        expect(
          reasonOf(
            request(admin, permission, { resource: forMarja(type, ELSEWHERE), ledger: null }),
          ),
          permission,
        ).toBe('ALLOWED');
      }
    }
  });
});

describe('principal trust', () => {
  const approver = principal('test-approver', { roles: ['INDEPENDENT_APPROVER'] });

  it('denies a missing principal', () => {
    for (const missing of [null, undefined]) {
      expect(
        reasonOf(decide(missing, 'governance.ledger.read', packResource(), context(approver))),
      ).toBe('NOT_AUTHENTICATED');
    }
  });

  it('denies principal look-alikes the server did not establish (forged role claims)', () => {
    const forgedAdmin = {
      ...principalInput('test-intruder', { roles: ['INDEPENDENT_APPROVER', 'SUPER_ADMIN'] }),
      kind: 'VERIFIED_PRINCIPAL',
      permissions: GOVERNANCE_PERMISSIONS,
    };
    for (const lookAlike of [
      { ...approver },
      JSON.parse(JSON.stringify(approver)) as unknown,
      Object.create(approver) as unknown,
      forgedAdmin,
      'test-approver',
      42,
    ]) {
      expect(isTrustedPrincipal(lookAlike)).toBe(false);
      expect(
        reasonOf(
          decide(
            lookAlike,
            'governance.approve',
            packResource(),
            context(approver, NEUTRAL_LEDGER),
          ),
        ),
      ).toBe('UNVERIFIED_PRINCIPAL');
    }
  });

  it('never accepts client-supplied permissions or another principal’s role assignments', () => {
    const input = principalInput('test-x', { roles: ['AUDITOR'] });
    expect(establishPrincipal({ ...input, permissions: ['governance.approve'] })).toEqual({
      ok: false,
      error: 'PRINCIPAL_MALFORMED',
    });
    expect(establishPrincipal({ ...input, kind: 'VERIFIED_PRINCIPAL' }).ok).toBe(false);
    const stolen = principalInput('test-y', { roles: ['INDEPENDENT_APPROVER'] }).roles;
    expect(establishPrincipal({ ...input, roles: [...input.roles, ...stolen] })).toEqual({
      ok: false,
      error: 'ROLE_ASSIGNMENT_MISMATCH',
    });
    const badRole = { ...input, roles: [{ ...input.roles[0], role: 'ROOT' }] };
    expect(establishPrincipal(badRole).ok).toBe(false);
    expect(establishPrincipal(null).ok).toBe(false);
    expect(establishPrincipal({ ...input, principalId: 'not valid!' }).ok).toBe(false);
  });

  it('freezes established principals so roles cannot be added afterwards', () => {
    const auditor = principal('test-auditor', { roles: ['AUDITOR'] });
    expect(Object.isFrozen(auditor)).toBe(true);
    expect(() => {
      (auditor.roles as unknown[]).push({ ...auditor.roles[0], role: 'INDEPENDENT_APPROVER' });
    }).toThrow(TypeError);
    expect(() => {
      (auditor.permissions as GovernancePermission[]).push('governance.approve');
    }).toThrow(TypeError);
    expect(reasonOf(request(auditor, 'governance.approve'))).toBe('MISSING_PERMISSION');
  });

  it('ignores revoked role assignments', () => {
    const who = principal('test-revoked', {
      roles: ['INDEPENDENT_APPROVER', 'AUDITOR'],
      revoked: ['INDEPENDENT_APPROVER'],
    });
    expect(who.roles.map((r) => r.role)).toEqual(['AUDITOR']);
    expect(reasonOf(request(who, 'governance.approve'))).toBe('MISSING_PERMISSION');
  });

  it('rejects inconsistent assurance and session claims', () => {
    const totpOnly = principalInput('test-z', { assurance: 'AAL3', methods: ['TOTP'] });
    expect(establishPrincipal(totpOnly)).toEqual({ ok: false, error: 'ASSURANCE_INCONSISTENT' });
    const passwordOnly = principalInput('test-z', { assurance: 'AAL2', methods: ['PASSWORD'] });
    expect(establishPrincipal(passwordOnly)).toEqual({
      ok: false,
      error: 'ASSURANCE_INCONSISTENT',
    });
    const disordered = principalInput('test-z', {
      session: { idleExpiresAt: shift(NOW, 9 * 60 * MINUTE) },
    });
    expect(establishPrincipal(disordered)).toEqual({ ok: false, error: 'SESSION_INCONSISTENT' });
  });
});

describe('trusted-principal registry (interim trust mechanism until M4.6.2)', () => {
  it('exposes no way to register, enumerate or clear trusted principals', () => {
    expect(Object.keys(principalModule).sort()).toEqual([
      'establishPrincipal',
      'isTrustedPrincipal',
    ]);
  });

  it('trusts each established object by identity; re-establishing yields a new trusted object', () => {
    const first = principal('test-a', { roles: ['AUDITOR'] });
    const second = principal('test-a', { roles: ['AUDITOR'] });
    expect(first).not.toBe(second);
    expect(first).toEqual(second);
    expect(isTrustedPrincipal(first) && isTrustedPrincipal(second)).toBe(true);
    expect(isTrustedPrincipal({ ...first })).toBe(false);
  });

  it('refuses principals older than the maximum age (per-request snapshots)', () => {
    expect(PRINCIPAL_MAX_AGE_MS).toBe(MINUTE);
    const atLimit = principal('test-a', {
      roles: ['AUDITOR'],
      establishedAt: shift(NOW, -PRINCIPAL_MAX_AGE_MS),
      authenticatedAt: shift(NOW, -2 * MINUTE),
    });
    expect(reasonOf(request(atLimit, 'governance.ledger.read'))).toBe('ALLOWED');
    const stale = principal('test-a', {
      roles: ['AUDITOR'],
      establishedAt: shift(NOW, -PRINCIPAL_MAX_AGE_MS - 1),
      authenticatedAt: shift(NOW, -2 * MINUTE),
    });
    expect(reasonOf(request(stale, 'governance.ledger.read'))).toBe('PRINCIPAL_STALE');
    const future = principal('test-a', {
      roles: ['AUDITOR'],
      establishedAt: shift(NOW, 1),
    });
    expect(reasonOf(request(future, 'governance.ledger.read'))).toBe('INVALID_REQUEST');
  });

  it('role revocation: an old snapshot keeps its roles only until it goes stale', () => {
    const establishedAt = shift(NOW, -30_000);
    const options = {
      roles: ['INDEPENDENT_APPROVER'] as const,
      establishedAt,
      authenticatedAt: shift(NOW, -MINUTE),
    };
    const before = principal('test-approver', options);
    // Revoked in the store after `before` was established; the API re-establishes per request.
    const after = principal('test-approver', {
      ...options,
      establishedAt: NOW,
      revoked: ['INDEPENDENT_APPROVER'],
    });
    expect(reasonOf(request(after, 'governance.approve'))).toBe('MISSING_PERMISSION');
    // The superseded snapshot is still within its 60-second window (documented residual)…
    expect(reasonOf(request(before, 'governance.approve'))).toBe('ALLOWED');
    // …and is refused once older than the maximum principal age.
    const later = {
      ...context(before, NEUTRAL_LEDGER),
      evaluatedAt: shift(establishedAt, MINUTE + 1),
    };
    expect(reasonOf(decide(before, 'governance.approve', packResource(), later))).toBe(
      'PRINCIPAL_STALE',
    );
  });

  it('suspension takes effect on the next establishment; session revocation immediately', () => {
    const active = principal('test-a', { roles: ['AUDITOR'] });
    const suspended = principal('test-a', { roles: ['AUDITOR'], accountStatus: 'SUSPENDED' });
    expect(reasonOf(request(suspended, 'governance.ledger.read'))).toBe('ACCOUNT_NOT_ACTIVE');
    // The session store is consulted on every decision, so an existing principal is refused at once.
    expect(
      reasonOf(
        decide(
          active,
          'governance.ledger.read',
          packResource(),
          context(active, null, { state: 'REVOKED' }),
        ),
      ),
    ).toBe('SESSION_REVOKED');
  });

  it('cannot be dated before its session or authentication', () => {
    expect(
      establishPrincipal(principalInput('test-a', { establishedAt: shift(NOW, -2 * MINUTE) })),
    ).toEqual({ ok: false, error: 'ESTABLISHED_TOO_EARLY' });
  });
});

describe('account and session', () => {
  it.each(['INVITED', 'SUSPENDED', 'DEACTIVATED'] as const)('denies a %s account', (status) => {
    const who = principal('test-a', { roles: ['AUDITOR'], accountStatus: status });
    expect(reasonOf(request(who, 'governance.ledger.read'))).toBe('ACCOUNT_NOT_ACTIVE');
  });

  it('denies a revoked session, and a session record for another session', () => {
    const who = principal('test-a', { roles: ['AUDITOR'] });
    const resource = packResource();
    expect(
      reasonOf(
        decide(who, 'governance.ledger.read', resource, context(who, null, { state: 'REVOKED' })),
      ),
    ).toBe('SESSION_REVOKED');
    expect(
      reasonOf(
        decide(who, 'governance.ledger.read', resource, context(who, null, { sessionId: 'other' })),
      ),
    ).toBe('INVALID_REQUEST');
  });

  it('denies idle-expired and absolutely expired sessions, and sessions not yet issued', () => {
    const idle = principal('test-a', {
      roles: ['AUDITOR'],
      session: { idleExpiresAt: NOW },
    });
    expect(reasonOf(request(idle, 'governance.ledger.read'))).toBe('SESSION_EXPIRED');
    const absolute = principal('test-a', {
      roles: ['AUDITOR'],
      session: { idleExpiresAt: shift(NOW, -MINUTE), absoluteExpiresAt: shift(NOW, -MINUTE) },
    });
    expect(reasonOf(request(absolute, 'governance.ledger.read'))).toBe('SESSION_EXPIRED');
    // A principal cannot be dated before its session; one dated after "now" is refused.
    expect(
      establishPrincipal(principalInput('test-a', { session: { issuedAt: shift(NOW, MINUTE) } })),
    ).toEqual({ ok: false, error: 'ESTABLISHED_TOO_EARLY' });
    const future = principal('test-a', {
      roles: ['AUDITOR'],
      session: { issuedAt: shift(NOW, MINUTE) },
      establishedAt: shift(NOW, MINUTE),
    });
    expect(reasonOf(request(future, 'governance.ledger.read'))).toBe('INVALID_REQUEST');
  });
});

describe('scope', () => {
  it('denies a role scoped to another Marja and allows the matching Marja', () => {
    const scoped = principal('test-r', {
      roles: [['SCHOLAR_REVIEWER', marjaScope('test-other-marja')]],
    });
    expect(reasonOf(request(scoped, 'governance.review.start'))).toBe('OUT_OF_SCOPE');
    const matching = principal('test-r', {
      roles: [['SCHOLAR_REVIEWER', marjaScope('test-other-marja', MARJA)]],
    });
    expect(reasonOf(request(matching, 'governance.review.start'))).toBe('ALLOWED');
    // M5.3.2: research permissions belong to governing scholars only, scoped per Marja.
    const research = principal('test-q', {
      roles: [['GOVERNING_SCHOLAR', marjaScope('test-other-marja')]],
    });
    expect(reasonOf(request(research, 'research.finding.edit'))).toBe('OUT_OF_SCOPE');
    const researcher = principal('test-q2', {
      roles: [['RELIGIOUS_RESEARCHER', marjaScope(MARJA)]],
    });
    expect(reasonOf(request(researcher, 'research.finding.edit'))).toBe('MISSING_PERMISSION');
  });

  it('requires scope ALL for non-Marja resources', () => {
    const scopedAdmin = principal('test-admin', { roles: [['SUPER_ADMIN', marjaScope(MARJA)]] });
    expect(reasonOf(request(scopedAdmin, 'audit.log.read'))).toBe('OUT_OF_SCOPE');
    expect(reasonOf(request(scopedAdmin, 'identity.role.assign'))).toBe('OUT_OF_SCOPE');
  });

  it('uses only the assignments that grant the permission for the scope check', () => {
    // An auditor role for ALL does not widen a reviewer role scoped elsewhere.
    const who = principal('test-r', {
      roles: ['AUDITOR', ['SCHOLAR_REVIEWER', marjaScope('test-other-marja')]],
    });
    expect(reasonOf(request(who, 'governance.review.start'))).toBe('OUT_OF_SCOPE');
  });
});

describe('password sign-in (AAL1; no mandatory MFA, no per-action step-up)', () => {
  it('allows a password-only sign-in every permission its roles grant', () => {
    const aal1 = principal('test-a', {
      roles: ['AUDITOR', 'SCHOLAR_REVIEWER', 'INDEPENDENT_APPROVER'],
      assurance: 'AAL1',
      methods: ['PASSWORD'],
    });
    expect(reasonOf(request(aal1, 'governance.ledger.read'))).toBe('ALLOWED');
    expect(reasonOf(request(aal1, 'governance.review.start'))).toBe('ALLOWED');
    expect(reasonOf(request(aal1, 'audit.log.read'))).toBe('ALLOWED');
    const admin = principal('test-admin', {
      roles: ['SUPER_ADMIN'],
      assurance: 'AAL1',
      methods: ['PASSWORD'],
    });
    // Decision 64: SUPER_ADMIN may approve (formerly MISSING_PERMISSION).
    expect(reasonOf(request(admin, 'governance.approve'))).toBe('ALLOWED');
  });

  it('establishes SUPER_ADMIN together with any other role (decision 64)', () => {
    // Policy change: decision 37 refused SUPER_ADMIN with a religious role on one account. Since
    // SUPER_ADMIN now holds every permission, no combination is forbidden.
    for (const role of [
      'SCHOLAR',
      'GOVERNING_SCHOLAR',
      'SCHOLAR_REVIEWER',
      'INDEPENDENT_APPROVER',
      'RULE_PACK_AUTHOR',
      'RELIGIOUS_RESEARCHER',
      'AUDITOR',
    ] as const) {
      expect(
        establishPrincipal(principalInput('test-x', { roles: ['SUPER_ADMIN', role] })).ok,
        role,
      ).toBe(true);
    }
  });

  it('allows actions formerly needing AAL3 to an AAL2 (TOTP) sign-in', () => {
    const aal2 = principal('test-r', {
      roles: ['SCHOLAR_REVIEWER'],
      assurance: 'AAL2',
      methods: ['TOTP'],
    });
    expect(reasonOf(request(aal2, 'governance.review.start'))).toBe('ALLOWED');
    expect(reasonOf(request(aal2, 'governance.ledger.read'))).toBe('ALLOWED');
  });

  it('does not require recent re-authentication for any action', () => {
    const signedInLongAgo = principal('test-ap', {
      roles: ['INDEPENDENT_APPROVER'],
      authenticatedAt: shift(NOW, -50 * MINUTE),
    });
    expect(reasonOf(request(signedInLongAgo, 'governance.approve'))).toBe('ALLOWED');
    expect(reasonOf(request(signedInLongAgo, 'governance.publish'))).toBe('ALLOWED');
    const admin = principal('test-admin', {
      roles: ['SUPER_ADMIN'],
      authenticatedAt: shift(NOW, -50 * MINUTE),
    });
    expect(reasonOf(request(admin, 'governance.withdraw.emergency'))).not.toBe('STEP_UP_REQUIRED');
    expect(reasonOf(request(admin, 'identity.user.suspend'))).not.toBe('MFA_REQUIRED');
  });

  it('denies an authentication time in the future', () => {
    expect(
      establishPrincipal(principalInput('test-ap', { authenticatedAt: shift(NOW, MINUTE) })),
    ).toEqual({ ok: false, error: 'ESTABLISHED_TOO_EARLY' });
    const future = principal('test-ap', {
      roles: ['INDEPENDENT_APPROVER'],
      authenticatedAt: shift(NOW, MINUTE),
      establishedAt: shift(NOW, MINUTE),
    });
    expect(reasonOf(request(future, 'governance.ledger.read'))).toBe('INVALID_REQUEST');
  });
});

describe('separation of duties (policy pre-check; the domain stays authoritative)', () => {
  const AUTHOR = 'test-author';
  const REVIEWER = 'test-reviewer';

  it('an author cannot review their own submission', () => {
    const authorReviewer = principal(AUTHOR, { roles: ['RULE_PACK_AUTHOR', 'SCHOLAR_REVIEWER'] });
    const submittedOnly = ledgerUnderReview(AUTHOR, REVIEWER);
    expect(
      reasonOf(request(authorReviewer, 'governance.review.start', { ledger: submittedOnly })),
    ).toBe('SEPARATION_OF_DUTIES');
  });

  it('every past submitter counts as an author (resubmission by someone else)', () => {
    const ledger = ledgerWithResubmission(AUTHOR, 'test-author-2', REVIEWER);
    const firstAuthor = principal(AUTHOR, { roles: ['INDEPENDENT_APPROVER', 'SCHOLAR_REVIEWER'] });
    expect(reasonOf(request(firstAuthor, 'governance.approve', { ledger }))).toBe(
      'SEPARATION_OF_DUTIES',
    );
    const independent = principal('test-approver', { roles: ['INDEPENDENT_APPROVER'] });
    expect(reasonOf(request(independent, 'governance.approve', { ledger }))).toBe('ALLOWED');
  });

  it('an author cannot approve or publish their own content', () => {
    const authorApprover = principal(AUTHOR, { roles: ['INDEPENDENT_APPROVER'] });
    for (const p of ['governance.approve', 'governance.publish', 'governance.supersede'] as const) {
      expect(reasonOf(request(authorApprover, p))).toBe('SEPARATION_OF_DUTIES');
    }
  });

  it('a reviewer cannot approve or publish their own review', () => {
    const reviewerApprover = principal(REVIEWER, {
      roles: ['SCHOLAR_REVIEWER', 'INDEPENDENT_APPROVER'],
    });
    expect(reasonOf(request(reviewerApprover, 'governance.approve'))).toBe('SEPARATION_OF_DUTIES');
    expect(reasonOf(request(reviewerApprover, 'governance.publish'))).toBe('SEPARATION_OF_DUTIES');
  });

  it('only the reviewer who started the review can complete it or request changes', () => {
    const otherReviewer = principal('test-reviewer-2', { roles: ['SCHOLAR_REVIEWER'] });
    const ledger = ledgerUnderReview(AUTHOR, REVIEWER);
    for (const p of ['governance.review.complete', 'governance.review.requestChanges'] as const) {
      expect(reasonOf(request(otherReviewer, p, { ledger }))).toBe('SEPARATION_OF_DUTIES');
    }
    const theReviewer = principal(REVIEWER, { roles: ['SCHOLAR_REVIEWER'] });
    expect(reasonOf(request(theReviewer, 'governance.review.complete', { ledger }))).toBe(
      'ALLOWED',
    );
  });

  it('an independent approver is allowed', () => {
    const approver = principal('test-approver', { roles: ['INDEPENDENT_APPROVER'] });
    expect(reasonOf(request(approver, 'governance.approve'))).toBe('ALLOWED');
  });

  it('an activator must be outside the approval chain (independent review)', () => {
    // M5.2.1 (scholar authority); decision 64 lets SUPER_ADMIN activate too, outside the chain.
    const scholar = (id: string) =>
      principal(id, { roles: [['GOVERNING_SCHOLAR', marjaScope(MARJA)]] });
    expect(reasonOf(request(scholar(AUTHOR), 'governance.activate'))).toBe('SEPARATION_OF_DUTIES');
    expect(reasonOf(request(scholar(REVIEWER), 'governance.activate'))).toBe(
      'SEPARATION_OF_DUTIES',
    );
    expect(reasonOf(request(scholar('test-other-scholar'), 'governance.activate'))).toBe('ALLOWED');
    // Decision 64: SUPER_ADMIN holds activation now (formerly MISSING_PERMISSION), outside the chain.
    const admin = principal('test-admin', { roles: ['SUPER_ADMIN'] });
    expect(reasonOf(request(admin, 'governance.activate'))).toBe('ALLOWED');
  });

  it('separation checks need the matching, untampered ledger (fail closed)', () => {
    const approver = principal('test-approver', { roles: ['INDEPENDENT_APPROVER'] });
    expect(reasonOf(request(approver, 'governance.approve', { ledger: null }))).toBe(
      'INVALID_REQUEST',
    );
    expect(
      reasonOf(request(approver, 'governance.approve', { resource: packResource(MARJA, '2.0.0') })),
    ).toBe('INVALID_REQUEST');
    const tampered = {
      ...NEUTRAL_LEDGER,
      records: NEUTRAL_LEDGER.records.map((r, i) =>
        i === 0
          ? { ...r, actor: { kind: 'UNVERIFIED_REFERENCE' as const, subject: 'test-approver-x' } }
          : r,
      ),
    };
    expect(reasonOf(request(approver, 'governance.approve', { ledger: tampered }))).toBe(
      'INVALID_REQUEST',
    );
  });
});

describe('administrative privilege', () => {
  const superAdmin = principal('test-admin', { roles: ['SUPER_ADMIN', 'AUDITOR'] });

  it('may review, approve and publish, but separation of duties still applies (decision 64)', () => {
    // Policy change: formerly MISSING_PERMISSION for every one of these.
    for (const p of [
      'governance.review.start',
      'governance.approve',
      'governance.publish',
      'governance.supersede',
      'governance.submit',
    ] as const) {
      expect(reasonOf(request(superAdmin, p))).toBe('ALLOWED');
    }
    // Not the current reviewer: cannot complete someone else's review.
    expect(
      reasonOf(request(superAdmin, 'governance.review.complete', { ledger: NEUTRAL_LEDGER })),
    ).toBe('SEPARATION_OF_DUTIES');
  });

  it('cannot grant roles to, suspend or invite itself', () => {
    const self = (role: GovernanceRole) => ({
      ...RESOURCES.ROLE_ASSIGNMENT,
      targetPrincipalId: 'test-admin',
      role,
    });
    for (const role of ['SCHOLAR', 'SUPER_ADMIN', 'AUDITOR'] as const) {
      expect(reasonOf(request(superAdmin, 'identity.role.assign', { resource: self(role) }))).toBe(
        'SELF_ADMINISTRATION',
      );
    }
    const selfAccount = { type: 'ACCOUNT', targetPrincipalId: 'test-admin' };
    expect(reasonOf(request(superAdmin, 'identity.user.suspend', { resource: selfAccount }))).toBe(
      'SELF_ADMINISTRATION',
    );
    expect(reasonOf(request(superAdmin, 'identity.user.invite', { resource: selfAccount }))).toBe(
      'SELF_ADMINISTRATION',
    );
  });

  it('may revoke its own sessions (a safety action)', () => {
    const own = { type: 'SESSION', targetPrincipalId: 'test-admin' };
    expect(reasonOf(request(superAdmin, 'identity.session.revoke', { resource: own }))).toBe(
      'ALLOWED',
    );
  });

  it('approved policy 3: an administrator grant needs a second, independent administrator', () => {
    const adminGrant = (stage: 'PROPOSE' | 'CONFIRM', proposedBy: string | null) => ({
      ...RESOURCES.ROLE_ASSIGNMENT,
      role: 'SUPER_ADMIN' as const,
      stage,
      proposedBy,
    });
    const assign = (resource: unknown, who = superAdmin) =>
      reasonOf(request(who, 'identity.role.assign', { resource }));
    expect(assign(adminGrant('PROPOSE', null))).toBe('ALLOWED');
    expect(assign(adminGrant('CONFIRM', 'test-admin'))).toBe('SEPARATION_OF_DUTIES');
    expect(assign(adminGrant('CONFIRM', OTHER))).toBe('SEPARATION_OF_DUTIES');
    expect(assign({ ...adminGrant('PROPOSE', null), targetPrincipalId: 'test-admin' })).toBe(
      'SELF_ADMINISTRATION',
    );
    const secondAdmin = principal('test-admin-2', { roles: ['SUPER_ADMIN'] });
    expect(assign(adminGrant('CONFIRM', 'test-admin'), secondAdmin)).toBe('ALLOWED');
    // Not an administrator: no grant at any stage.
    const approver = principal('test-approver', { roles: ['INDEPENDENT_APPROVER'] });
    expect(assign(adminGrant('CONFIRM', 'test-admin'), approver)).toBe('MISSING_PERMISSION');
  });

  it('needs a second administrator to confirm dual-control role grants', () => {
    const grant = (
      stage: 'PROPOSE' | 'CONFIRM',
      proposedBy: string | null,
      role: GovernanceRole,
    ) => ({
      ...RESOURCES.ROLE_ASSIGNMENT,
      role,
      stage,
      proposedBy,
    });
    expect(DUAL_CONTROL_ROLES).toEqual([
      'SUPER_ADMIN',
      'SCHOLAR',
      'SCHOLAR_REVIEWER',
      'INDEPENDENT_APPROVER',
      'GOVERNING_SCHOLAR',
    ]);
    for (const role of DUAL_CONTROL_ROLES) {
      expect(
        reasonOf(
          request(superAdmin, 'identity.role.assign', { resource: grant('PROPOSE', null, role) }),
        ),
      ).toBe('ALLOWED');
      // Confirming one's own proposal.
      expect(
        reasonOf(
          request(superAdmin, 'identity.role.assign', {
            resource: grant('CONFIRM', 'test-admin', role),
          }),
        ),
      ).toBe('SEPARATION_OF_DUTIES');
      // A proposal made by the person receiving the role.
      expect(
        reasonOf(
          request(superAdmin, 'identity.role.assign', { resource: grant('CONFIRM', OTHER, role) }),
        ),
      ).toBe('SEPARATION_OF_DUTIES');
      expect(
        reasonOf(
          request(superAdmin, 'identity.role.assign', {
            resource: grant('CONFIRM', 'test-admin-2', role),
          }),
        ),
      ).toBe('ALLOWED');
    }
    // Malformed: PROPOSE naming a proposer, CONFIRM without one.
    expect(
      reasonOf(
        request(superAdmin, 'identity.role.assign', {
          resource: grant('PROPOSE', 'test-admin-2', 'AUDITOR'),
        }),
      ),
    ).toBe('INVALID_REQUEST');
    expect(
      reasonOf(
        request(superAdmin, 'identity.role.assign', {
          resource: grant('CONFIRM', null, 'AUDITOR'),
        }),
      ),
    ).toBe('INVALID_REQUEST');
  });
});

describe('unauthorized publication and activation', () => {
  it.each([
    ['RULE_PACK_AUTHOR'],
    ['RELIGIOUS_RESEARCHER'],
    ['SCHOLAR_REVIEWER'],
    ['AUDITOR'],
    // Decision 64: SUPER_ADMIN may publish and activate now (removed from these lists).
  ] as const)('%s cannot publish', (role) => {
    expect(reasonOf(request(principal('test-p', { roles: [role] }), 'governance.publish'))).toBe(
      'MISSING_PERMISSION',
    );
  });

  it.each([
    ['RULE_PACK_AUTHOR'],
    ['RELIGIOUS_RESEARCHER'],
    ['SCHOLAR_REVIEWER'],
    ['INDEPENDENT_APPROVER'],
    ['AUDITOR'],
  ] as const)('%s cannot activate', (role) => {
    expect(reasonOf(request(principal('test-p', { roles: [role] }), 'governance.activate'))).toBe(
      'MISSING_PERMISSION',
    );
  });
});

describe('malformed requests fail closed', () => {
  const auditor = principal('test-auditor', { roles: ['AUDITOR'] });
  const good = context(auditor);

  it('denies a missing or malformed context', () => {
    for (const ctx of [
      undefined,
      null,
      {},
      { ...good, extra: true },
      { ...good, evaluatedAt: '2026-11-20T10:00:00Z' },
      { ...good, evaluatedAt: '2026-02-30T10:00:00.000Z' },
      { ...good, decisionId: '' },
      { ...good, session: { sessionId: auditor.session.sessionId } },
      { ...good, session: { ...good.session, state: 'active' } },
      { ...good, governance: { ledger: { packId: 'x' } } },
    ]) {
      const d = decide(auditor, 'governance.ledger.read', packResource(), ctx);
      expect(reasonOf(d)).toBe('INVALID_REQUEST');
    }
  });

  it('denies unknown permissions and resources of the wrong type or shape', () => {
    for (const permission of ['governance.everything', '', null, 'toString', '__proto__', 7]) {
      const d = decide(auditor, permission, packResource(), good);
      expect(d).toMatchObject({ allowed: false, reason: 'INVALID_REQUEST', permission: null });
    }
    for (const resource of [
      undefined,
      null,
      { type: 'AUDIT_LOG' },
      { ...packResource(), extra: 1 },
      { ...packResource(), marjaId: '' },
      { ...packResource(), contentDigest: 'ABC' },
      { type: 'EVERYTHING' },
    ]) {
      expect(reasonOf(decide(auditor, 'governance.ledger.read', resource, good))).toBe(
        'INVALID_REQUEST',
      );
    }
  });

  it('denies a null request, throwing proxies and hostile getters without throwing', () => {
    expect(reasonOf(authorize(null as never))).toBe('INVALID_REQUEST');
    const hostile = new Proxy(
      {},
      {
        get() {
          throw new Error('boom');
        },
      },
    );
    expect(reasonOf(authorize(hostile as never))).toBe('INVALID_REQUEST');
    expect(reasonOf(decide(auditor, 'governance.ledger.read', hostile, good))).toBe(
      'INVALID_REQUEST',
    );
    expect(reasonOf(decide(auditor, 'governance.ledger.read', packResource(), hostile))).toBe(
      'INVALID_REQUEST',
    );
  });

  it('is deterministic and returns frozen decisions carrying the decision id', () => {
    const a = decide(auditor, 'governance.ledger.read', packResource(), good);
    const b = decide(auditor, 'governance.ledger.read', packResource(), good);
    expect(a).toEqual(b);
    expect(a).toEqual({
      allowed: true,
      decisionId: 'decision-1',
      permission: 'governance.ledger.read',
      evaluatedAt: NOW,
    });
    expect(Object.isFrozen(a)).toBe(true);
  });
});

describe('public API surface', () => {
  it('exports the evaluator but neither the principal factory nor the raw governance commands', () => {
    expect(typeof core.authorize).toBe('function');
    expect(typeof core.executeGovernanceCommand).toBe('function');
    for (const name of [
      'establishPrincipal',
      'submit',
      'startReview',
      'requestChanges',
      'completeReview',
      'approve',
      'publish',
      'activate',
      'withdraw',
      'supersede',
      // No lower-level ledger mutation either (single-scholar stage 3 review).
      'append',
      'applyRecord',
      'replayDetached',
    ]) {
      expect(name in core).toBe(false);
    }
  });

  it('exposes governance policies only as frozen, read-only data', () => {
    expect(Object.isFrozen(core.GOVERNANCE_POLICIES)).toBe(true);
    for (const policy of Object.values(core.GOVERNANCE_POLICIES)) {
      expect(Object.isFrozen(policy)).toBe(true);
    }
    expect(() => {
      (
        core.GOVERNANCE_POLICIES.INDEPENDENT_REVIEW_V1 as { approverMustBeIndependent: boolean }
      ).approverMustBeIndependent = false;
    }).toThrow(TypeError);
  });

  it('has a sealed test pack fixture (sanity)', () => {
    expect(testPack().metadata.marjaId).toBe(MARJA);
  });
});
