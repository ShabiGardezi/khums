import type { PinoLogger } from 'nestjs-pino';
import { describe, expect, it, vi } from 'vitest';

import { findMarjaCatalogueEntry, replayPolicyRegistry, verifyAuditChain } from '@khums/core';
import { establishPrincipal } from '@khums/core/trusted-principal';
import type { GovernancePolicyRegistry, VerifiedPrincipal } from '@khums/shared-types';

import { readAuditChain } from '../audit/audit-event.store';
import { StaffAuthorizationService } from '../auth/staff-authorization.service';
import { attachStaffAuthentication } from '../auth/staff-request';
import type { AppConfig } from '../config';
import { inMemoryAppendOnlyCollection } from '../persistence/append-only-collection';
import { COLLECTIONS } from '../persistence/collections';
import { selectGovernancePolicyStore } from './governance.module';
import { inMemoryGovernanceStore } from './governance-store';
import { GovernancePolicyService } from './governance-policy.service';
import { INITIAL_GOVERNANCE_POLICIES } from './initial-governance-policies';
import { INITIAL_RESEARCH_MARJAS } from '@khums/core';
import {
  inMemoryGovernancePolicyStore,
  unavailableGovernancePolicyStore,
  type GovernancePolicyStore,
} from './governance-policy.store';

/** API side of per-Marja governance policy configuration (single-scholar stage 4). */

const NOW = Date.parse('2026-11-21T10:00:00.000Z');
const iso = (ms: number) => new Date(ms).toISOString();
const config = (env: AppConfig['env']) => ({ env }) as unknown as AppConfig;

function staff(principalId: string, role: 'SUPER_ADMIN' | 'AUDITOR' | 'GOVERNING_SCHOLAR') {
  const established = establishPrincipal({
    principalId,
    establishedAt: iso(NOW),
    identity: { issuer: 'https://t.invalid/', subject: `sub-${principalId}`, emailVerified: false },
    accountStatus: 'ACTIVE',
    roles: [
      {
        assignmentId: `${principalId}-0`,
        principalId,
        role,
        scope: { kind: 'ALL', marjaIds: [] },
        grantedBy: 'test-admin-0',
        grantedAt: '2026-01-01T00:00:00.000Z',
        revokedBy: null,
        revokedAt: null,
      },
    ],
    authentication: {
      authenticatedAt: iso(NOW - 60_000),
      methods: ['PASSWORD', 'TOTP'],
      assurance: 'AAL2',
    },
    session: {
      sessionId: `session-${principalId}`,
      issuedAt: iso(NOW - 60_000),
      idleExpiresAt: iso(NOW + 600_000),
      absoluteExpiresAt: iso(NOW + 3_600_000),
    },
  });
  if (!established.ok) throw new Error(established.error);
  return established.value;
}

function requestFor(principal: VerifiedPrincipal | null): object {
  const request = {};
  if (principal !== null) {
    attachStaffAuthentication(request, {
      principal,
      sessionState: 'ACTIVE',
      session: {
        sessionIdHash: 'a'.repeat(64),
        passwordChangeOnly: false,
        expiresAt: iso(NOW + 600_000),
      },
      account: { username: principal.principalId },
    });
  }
  return request;
}

function service(store: GovernancePolicyStore) {
  const logger = { info: vi.fn() };
  const audit = inMemoryAppendOnlyCollection(COLLECTIONS.auditEvents);
  return {
    logger,
    audit,
    svc: new GovernancePolicyService(
      inMemoryGovernanceStore(audit, store),
      { now: () => NOW },
      logger as unknown as PinoLogger,
      new StaffAuthorizationService({ now: () => NOW }),
    ),
  };
}

const devStore = () =>
  selectGovernancePolicyStore(config('development'), NOW - 3_600_000, [
    { marjaId: 'sistani', policy: 'SINGLE_SCHOLAR_V1' },
  ]);

describe('store selection', () => {
  it('has no store in production, so every lookup fails closed', async () => {
    const store = selectGovernancePolicyStore(config('production'), NOW, [
      { marjaId: 'sistani', policy: 'SINGLE_SCHOLAR_V1' },
    ]);
    expect(store).toBe(unavailableGovernancePolicyStore);
    const { svc } = service(store);
    expect(await svc.activePolicy('sistani')).toEqual({
      ok: false,
      error: 'POLICY_STORE_UNAVAILABLE',
    });
  });

  it('seeds development from the version-controlled initial configuration', async () => {
    const { svc } = service(devStore());
    expect(await svc.activePolicy('sistani')).toEqual({ ok: true, value: 'SINGLE_SCHOLAR_V1' });
    // Not every Marja shares the policy: an unlisted Marja is not configured (fail closed).
    expect(await svc.activePolicy('khamenei')).toEqual({
      ok: false,
      error: 'POLICY_NOT_CONFIGURED',
    });
  });

  it('refuses initial configuration naming an unknown Marja', () => {
    expect(() =>
      selectGovernancePolicyStore(config('development'), NOW, [
        { marjaId: 'no-such-marja', policy: 'SINGLE_SCHOLAR_V1' },
      ]),
    ).toThrow(/unknown Marja/);
  });

  it('ships only the initial research scope (Sistani, Khamenei) under SINGLE_SCHOLAR_V1', async () => {
    expect(INITIAL_GOVERNANCE_POLICIES.map((a) => a.marjaId)).toEqual(['sistani', 'khamenei']);
    // Identical to the initial research scope: no other Marja is configured silently.
    expect(INITIAL_GOVERNANCE_POLICIES.map((a) => a.marjaId)).toEqual([...INITIAL_RESEARCH_MARJAS]);
    for (const { marjaId, policy } of INITIAL_GOVERNANCE_POLICIES) {
      expect(findMarjaCatalogueEntry(marjaId), marjaId).toBeDefined();
      expect(policy).toBe('SINGLE_SCHOLAR_V1');
    }
    const { svc } = service(selectGovernancePolicyStore(config('development'), NOW));
    for (const { marjaId } of INITIAL_GOVERNANCE_POLICIES) {
      expect(await svc.activePolicy(marjaId)).toEqual({ ok: true, value: 'SINGLE_SCHOLAR_V1' });
    }
    // Not every Marja is configured: the others stay closed until two administrators set them.
    // Including the four catalogue Marjas outside the initial scope (no silent activation).
    for (const marjaId of [
      'makarem-shirazi',
      'wahid-khorasani',
      'najafi',
      'fayyadh',
      'sadiq-shirazi',
      'sobhani',
      'hakim',
      'fadlallah',
    ]) {
      expect(await svc.activePolicy(marjaId)).toEqual({
        ok: false,
        error: 'POLICY_NOT_CONFIGURED',
      });
    }
  });
});

describe('changing a policy through the service (two administrators)', () => {
  const input = {
    marjaId: 'sistani',
    newPolicy: 'INDEPENDENT_REVIEW_V1',
    reason: 'Second scholar joined',
  };

  async function pendingExpected(svc: GovernancePolicyService) {
    const registry = await svc.registry();
    if (!registry.ok) throw new Error('fixture');
    const view = replayPolicyRegistry(registry.value);
    const pending = view.ok ? view.value.pending : null;
    if (pending === null) throw new Error('nothing pending');
    return {
      proposalRecordId: pending.recordId,
      marjaId: pending.marjaId,
      previousPolicy: pending.previousPolicy,
      newPolicy: pending.newPolicy,
      reason: pending.reason,
      proposalRequestId: pending.requestId,
    };
  }

  it('one administrator proposes, another confirms; both records are stored', async () => {
    const store = devStore();
    const { svc, logger, audit } = service(store);
    const proposed = await svc.proposePolicyChange(
      requestFor(staff('test-admin', 'SUPER_ADMIN')),
      input,
      'req-41',
    );
    expect(proposed.outcome).toMatchObject({
      status: 'APPLIED',
      record: { kind: 'CHANGE_PROPOSED', previousPolicy: 'SINGLE_SCHOLAR_V1', requestId: 'req-41' },
    });
    expect(await svc.activePolicy('sistani')).toEqual({ ok: true, value: 'SINGLE_SCHOLAR_V1' });
    const confirmed = await svc.confirmPolicyChange(
      requestFor(staff('test-admin-2', 'SUPER_ADMIN')),
      await pendingExpected(svc),
      'req-42',
    );
    expect(confirmed.failure).toBeNull();
    expect(confirmed.outcome).toMatchObject({
      status: 'APPLIED',
      record: {
        kind: 'CHANGE_CONFIRMED',
        marjaId: 'sistani',
        previousPolicy: 'SINGLE_SCHOLAR_V1',
        newPolicy: 'INDEPENDENT_REVIEW_V1',
        actor: { subject: 'test-admin-2' },
        recordedAt: iso(NOW),
        reason: 'Second scholar joined',
        requestId: 'req-42',
        proposal: { requestId: 'req-41' },
      },
    });
    expect(await svc.activePolicy('sistani')).toEqual({ ok: true, value: 'INDEPENDENT_REVIEW_V1' });
    const loaded = await store.load();
    // Initial assignment, proposal, confirmation.
    expect(loaded.kind === 'FOUND' && loaded.value.records.length).toBe(3);
    // Each step is audited in the same unit of work as its registry record (M4.6.4a).
    const chain = await readAuditChain(audit);
    expect(chain.ok && verifyAuditChain(chain.value).ok).toBe(true);
    expect(chain.ok && chain.value.map((e) => (e as { type: string }).type)).toEqual([
      'governance.policy.changeProposed',
      'governance.policy.changeConfirmed',
    ]);
    const logged = JSON.stringify(logger.info.mock.calls);
    expect(logged).not.toContain('test-admin');
    expect(logged).not.toContain('Second scholar joined');
  });

  it('refuses self-confirmation and leaves the policy unchanged', async () => {
    const { svc } = service(devStore());
    const admin = requestFor(staff('test-admin', 'SUPER_ADMIN'));
    await svc.proposePolicyChange(admin, input, 'req-1');
    const result = await svc.confirmPolicyChange(admin, await pendingExpected(svc), 'req-2');
    expect(result.outcome).toMatchObject({ status: 'REFUSED', issue: 'POLICY_SELF_CONFIRMATION' });
    expect(await svc.activePolicy('sistani')).toEqual({ ok: true, value: 'SINGLE_SCHOLAR_V1' });
  });

  it('denies unauthenticated requests and non-administrators; nothing is stored', async () => {
    const store = devStore();
    const { svc } = service(store);
    const before = await store.load();
    for (const [who, expected] of [
      [null, 'NOT_AUTHENTICATED'],
      [staff('test-auditor', 'AUDITOR'), 'MISSING_PERMISSION'],
      [staff('test-scholar', 'GOVERNING_SCHOLAR'), 'MISSING_PERMISSION'],
    ] as const) {
      const result = await svc.proposePolicyChange(requestFor(who), input, 'req-1');
      expect(result.outcome).toMatchObject({ status: 'DENIED', decision: { reason: expected } });
    }
    expect(await store.load()).toEqual(before);
  });

  it('fails closed without a store, and on a concurrent change (no forked history)', async () => {
    const admin = requestFor(staff('test-admin', 'SUPER_ADMIN'));
    expect(
      await service(unavailableGovernancePolicyStore).svc.proposePolicyChange(admin, input, 'r'),
    ).toEqual({ outcome: null, failure: 'POLICY_STORE_UNAVAILABLE' });
    const inner = devStore();
    const racing: GovernancePolicyStore = {
      load: () => inner.load(),
      append: () => Promise.resolve('CONFLICT'),
    };
    expect(await service(racing).svc.proposePolicyChange(admin, input, 'r')).toEqual({
      outcome: null,
      failure: 'POLICY_STORE_CONFLICT',
    });
  });

  it('the in-memory store accepts only an append of exactly one record', async () => {
    const store = devStore();
    const loaded = await store.load();
    if (loaded.kind !== 'FOUND') throw new Error('fixture');
    const empty: GovernancePolicyRegistry = { records: [] };
    expect(await store.append(1, empty)).toBe('CONFLICT');
    expect(await store.append(0, loaded.value)).toBe('CONFLICT');
    const [first] = loaded.value.records;
    if (first === undefined) throw new Error('fixture');
    const rewritten = { records: [{ ...first, recordDigest: 'f'.repeat(64) }, first] };
    expect(await store.append(1, rewritten)).toBe('CONFLICT');
    expect(await inMemoryGovernancePolicyStore(empty).append(0, loaded.value)).toBe('APPLIED');
  });
});
