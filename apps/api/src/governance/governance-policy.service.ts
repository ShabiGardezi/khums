import { randomUUID } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import {
  activeGovernancePolicy,
  confirmGovernancePolicyChange,
  proposeGovernancePolicyChange,
  replayPolicyRegistry,
  type PolicyChangeOutcome,
  type PolicyConfirmationInput,
  type PolicyDecisionContext,
  type PolicyRegistryIssueCode,
} from '@khums/core';
import type { GovernancePolicyId, GovernancePolicyRegistry } from '@khums/shared-types';
import { err, ok, type Result } from '@khums/utils';

import type { GovernancePolicyRegistryResponse } from '@khums/validation';

import { CLOCK, type Clock } from '../auth/auth.tokens';
import { StaffAuthorizationService } from '../auth/staff-authorization.service';
import { staffAuthenticationOf } from '../auth/staff-request';
import { Rollback } from '../persistence/unit-of-work';
import { GOVERNANCE_STORE, type GovernanceStore } from './governance-store';

export interface PolicyServiceResult {
  readonly outcome: PolicyChangeOutcome | null;
  readonly failure: PolicyServiceFailure | null;
}

export type PolicyServiceFailure =
  PolicyRegistryIssueCode | 'POLICY_STORE_UNAVAILABLE' | 'POLICY_STORE_CONFLICT';

const failed = (failure: PolicyServiceFailure): PolicyServiceResult => ({ outcome: null, failure });

/**
 * Server-side access to the per-Marja governance policy registry (single-scholar stage 4).
 * The policy is resolved only from the server's store, never from a request. Changes need two
 * administrators (`proposeGovernancePolicyChange`, then `confirmGovernancePolicyChange` by
 * another), both authorized by `@khums/core` and stored with compare-and-append. Since M4.6.4a the
 * registry record and its audit event are written in one unit of work (all or nothing), and the
 * governance API exposes both steps.
 */
@Injectable()
export class GovernancePolicyService {
  constructor(
    @Inject(GOVERNANCE_STORE) private readonly store: GovernanceStore,
    @Inject(CLOCK) private readonly clock: Clock,
    @InjectPinoLogger(GovernancePolicyService.name) private readonly logger: PinoLogger,
    private readonly authz: StaffAuthorizationService,
  ) {}

  /**
   * The active policies and the pending proposal, limited to the Marjas the caller may administer
   * (`governance.policy.change`). `null` when the registry is unavailable or fails verification;
   * `DENIED` (with the first denial) when the caller may administer none.
   */
  async view(request: object): Promise<
    | { readonly kind: 'VIEW'; readonly value: GovernancePolicyRegistryResponse }
    | {
        readonly kind: 'DENIED';
        readonly decision: ReturnType<StaffAuthorizationService['decide']>;
      }
    | { readonly kind: 'UNAVAILABLE' }
  > {
    const registry = await this.registry();
    if (!registry.ok) return { kind: 'UNAVAILABLE' };
    const replayed = replayPolicyRegistry(registry.value);
    if (!replayed.ok) return { kind: 'UNAVAILABLE' };
    const { policies, pending } = replayed.value;
    const decided = Object.entries(policies)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([marjaId, policy]) => ({
        marjaId,
        policy,
        decision: this.authz.decide(request, 'governance.policy.change', {
          type: 'GOVERNANCE_POLICY',
          marjaId,
        }),
      }));
    const visible = decided
      .filter((d) => d.decision.allowed)
      .map(({ marjaId, policy }) => ({ marjaId, policy }));
    const firstDenial = decided.find((d) => !d.decision.allowed)?.decision;
    if (visible.length === 0 && firstDenial !== undefined) {
      return { kind: 'DENIED', decision: firstDenial };
    }
    return {
      kind: 'VIEW',
      value: {
        policies: visible,
        pending:
          pending !== null && visible.some((p) => p.marjaId === pending.marjaId)
            ? {
                proposalRecordId: pending.recordId,
                marjaId: pending.marjaId,
                previousPolicy: pending.previousPolicy,
                newPolicy: pending.newPolicy,
                reason: pending.reason,
                proposalRequestId: pending.requestId,
                proposedBy: pending.proposedBy,
              }
            : null,
      },
    };
  }

  /** The registry for governance commands (`context.policyRegistry`). Fails closed. */
  async registry(): Promise<Result<GovernancePolicyRegistry, PolicyServiceFailure>> {
    const loaded = await this.store.stores.policies.load();
    return loaded.kind === 'FOUND' ? ok(loaded.value) : err('POLICY_STORE_UNAVAILABLE');
  }

  /** The active policy for a Marja, from the verified registry. Never a default. */
  async activePolicy(marjaId: string): Promise<Result<GovernancePolicyId, PolicyServiceFailure>> {
    const registry = await this.registry();
    return registry.ok ? activeGovernancePolicy(registry.value, marjaId) : registry;
  }

  /**
   * Step 1 of 2: the request's verified principal proposes a policy change for one Marja. The
   * policy does not change until a different administrator confirms. `requestId` is the server's
   * correlation id.
   */
  async proposePolicyChange(
    request: object,
    input: { readonly marjaId: string; readonly newPolicy: unknown; readonly reason: unknown },
    requestId: string,
  ): Promise<PolicyServiceResult> {
    return this.mutate(request, requestId, (registry, principal, context) =>
      proposeGovernancePolicyChange({ principal, registry, ...input, context }),
    );
  }

  /**
   * Step 2 of 2: a DIFFERENT administrator confirms the pending proposal, binding exactly what
   * they were shown. Applies the change for new pack versions only.
   */
  async confirmPolicyChange(
    request: object,
    expected: PolicyConfirmationInput['expected'],
    requestId: string,
  ): Promise<PolicyServiceResult> {
    return this.mutate(request, requestId, (registry, principal, context) =>
      confirmGovernancePolicyChange({ principal, registry, expected, context }),
    );
  }

  private async mutate(
    request: object,
    requestId: string,
    decide: (
      registry: GovernancePolicyRegistry,
      principal: unknown,
      context: PolicyDecisionContext,
    ) => PolicyChangeOutcome,
  ): Promise<PolicyServiceResult> {
    const authentication = staffAuthenticationOf(request);
    const result = await this.store.atomically(async (s): Promise<PolicyServiceResult> => {
      const loaded = await s.policies.load();
      if (loaded.kind !== 'FOUND') throw new Rollback(failed('POLICY_STORE_UNAVAILABLE'));
      const evaluatedAt = new Date(this.clock.now()).toISOString();
      const outcome = decide(loaded.value, authentication?.principal ?? null, {
        decisionId: randomUUID(),
        evaluatedAt,
        session: {
          sessionId: authentication?.principal.session.sessionId ?? 'none',
          state: authentication?.sessionState ?? 'REVOKED',
        },
        requestId,
      });
      if (outcome.status !== 'APPLIED') return { outcome, failure: null };
      const stored = await s.policies.append(loaded.value.records.length, outcome.registry);
      if (stored !== 'APPLIED') {
        throw new Rollback(
          failed(stored === 'CONFLICT' ? 'POLICY_STORE_CONFLICT' : 'POLICY_STORE_UNAVAILABLE'),
        );
      }
      const { record } = outcome;
      const audited = await s.audit({
        eventId: randomUUID(),
        type:
          record.kind === 'CHANGE_CONFIRMED'
            ? 'governance.policy.changeConfirmed'
            : 'governance.policy.changeProposed',
        actor: record.actor.subject,
        targets: [{ kind: 'governancePolicy', id: record.marjaId }],
        marjaIds: [record.marjaId],
        details: {
          recordId: record.recordId,
          recordDigest: record.recordDigest,
          previousPolicy: record.previousPolicy,
          newPolicy: record.newPolicy,
          decisionId: record.decisionId,
          proposalRecordId: record.proposal?.recordId ?? null,
        },
        requestId,
        occurredAt: evaluatedAt,
      });
      if (!audited.ok) throw new Rollback(failed('POLICY_STORE_UNAVAILABLE'));
      return { outcome, failure: null };
    });
    const { outcome } = result;
    if (outcome?.status !== 'APPLIED') return result;
    // Recorded in the registry and the audit chain; the log carries no personal data.
    this.logger.info(
      {
        event:
          outcome.record.kind === 'CHANGE_CONFIRMED'
            ? 'governance.policy.change.confirmed'
            : 'governance.policy.change.proposed',
        marjaId: outcome.record.marjaId,
        previousPolicy: outcome.record.previousPolicy,
        newPolicy: outcome.record.newPolicy,
        recordId: outcome.record.recordId,
        requestId,
      },
      'Governance policy change recorded',
    );
    return { outcome, failure: null };
  }
}
