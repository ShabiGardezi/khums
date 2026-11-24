import { Logger, Module, type Provider } from '@nestjs/common';
import type { Db } from 'mongodb';

import { findMarjaCatalogueEntry, initialPolicyRegistry } from '@khums/core';
import type { GovernancePolicyRegistry } from '@khums/shared-types';

import { CLOCK, type Clock } from '../auth/auth.tokens';
import { AuthModule } from '../auth/auth.module';
import { APP_CONFIG, type AppConfig } from '../config';
import { COLLECTIONS } from '../persistence/collections';
import { mongoAppendOnlyCollection } from '../persistence/mongo-append-only-collection';
import { MONGO_DATABASE } from '../persistence/persistence.module';
import { AUDIT_COLLECTION } from '../audit/audit.service';
import { AuditModule } from '../audit/audit.module';
import { ResearchModule } from '../research/research.module';
import type { AppendOnlyCollection } from '../persistence/append-only-collection';
import { AuditLogController } from './audit-log.controller';
import { GovernanceController } from './governance.controller';
import { GovernanceService } from './governance.service';
import { GovernancePolicyController } from './governance-policy.controller';
import { GovernancePolicyService } from './governance-policy.service';
import {
  appendOnlyGovernancePolicyStore,
  inMemoryGovernancePolicyStore,
  unavailableGovernancePolicyStore,
  type GovernancePolicyStore,
} from './governance-policy.store';
import {
  GOVERNANCE_STORE,
  inMemoryGovernanceStore,
  mongoGovernanceStore,
  unavailableGovernanceStore,
  type GovernanceStore,
} from './governance-store';
import {
  INITIAL_GOVERNANCE_POLICIES,
  INITIAL_GOVERNANCE_POLICY_REASON,
} from './initial-governance-policies';

/**
 * Chooses the governance policy store. With a database, the durable append-only store (seeded by
 * the migration command, never at startup). Without one, production has no authoritative store,
 * so every policy lookup fails closed; development and test use process memory seeded from the
 * version-controlled initial configuration (validated against the Marja catalogue).
 */
export function initialRegistryFor(
  now: number,
  initial = INITIAL_GOVERNANCE_POLICIES,
  requestId = 'startup:initial-configuration',
): GovernancePolicyRegistry {
  const unknown = initial.filter((a) => findMarjaCatalogueEntry(a.marjaId) === undefined);
  if (unknown.length > 0) {
    throw new Error(
      `Initial governance policies name unknown Marja ids (${String(unknown.length)})`,
    );
  }
  const registry = initialPolicyRegistry(
    initial,
    new Date(now).toISOString(),
    INITIAL_GOVERNANCE_POLICY_REASON,
    requestId,
  );
  if (!registry.ok) throw new Error(`Initial governance policies are invalid: ${registry.error}`);
  return registry.value;
}

export function selectGovernancePolicyStore(
  config: AppConfig,
  now: number,
  initial = INITIAL_GOVERNANCE_POLICIES,
  db: Db | null = null,
): GovernancePolicyStore {
  if (db !== null) {
    return appendOnlyGovernancePolicyStore(
      mongoAppendOnlyCollection(db, COLLECTIONS.governancePolicyRegistry),
    );
  }
  if (config.env === 'production') return unavailableGovernancePolicyStore;
  return inMemoryGovernancePolicyStore(initialRegistryFor(now, initial));
}

/**
 * Chooses the governance store (ledgers, pack content, policy registry, audit) for one unit of
 * work: MongoDB transactions when a database is configured; otherwise fail closed in production
 * and process memory in development and test (sharing the in-memory audit chain).
 */
export function selectGovernanceStore(
  config: AppConfig,
  now: number,
  db: Db | null,
  audit: AppendOnlyCollection,
  initial = INITIAL_GOVERNANCE_POLICIES,
): GovernanceStore {
  if (db !== null) return mongoGovernanceStore(db);
  const policies = selectGovernancePolicyStore(config, now, initial, null);
  return config.env === 'production'
    ? unavailableGovernanceStore(policies)
    : inMemoryGovernanceStore(audit, policies);
}

const providers: Provider[] = [
  {
    provide: GOVERNANCE_STORE,
    inject: [APP_CONFIG, CLOCK, MONGO_DATABASE, AUDIT_COLLECTION],
    useFactory: (config: AppConfig, clock: Clock, db: Db | null, audit: AppendOnlyCollection) => {
      const store = selectGovernanceStore(config, clock.now(), db, audit);
      if (!store.durable && config.env === 'production') {
        new Logger('Governance').warn(
          'No database configured; governance requests and new submissions are refused.',
        );
      }
      return store;
    },
  },
  GovernancePolicyService,
  GovernanceService,
];

/**
 * Governance API (M4.6.4a): pack-version ledgers and commands, per-Marja governance policies and
 * the audit log. Every route is a staff route (session, CSRF, authorization by `@khums/core`).
 */
@Module({
  imports: [AuthModule, AuditModule, ResearchModule],
  controllers: [GovernanceController, GovernancePolicyController, AuditLogController],
  providers,
  // GOVERNANCE_STORE: read by the public calculator (decision 65) for verified packs.
  exports: [GovernancePolicyService, GOVERNANCE_STORE],
})
export class GovernanceModule {}
