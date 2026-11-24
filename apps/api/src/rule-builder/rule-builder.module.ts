import { Module, type Provider } from '@nestjs/common';
import type { Db } from 'mongodb';

import { AUDIT_COLLECTION } from '../audit/audit.service';
import { AuditModule } from '../audit/audit.module';
import { CLOCK, type Clock } from '../auth/auth.tokens';
import { AuthModule } from '../auth/auth.module';
import { APP_CONFIG, type AppConfig } from '../config';
import type { AppendOnlyCollection } from '../persistence/append-only-collection';
import { MONGO_DATABASE } from '../persistence/persistence.module';
import { RESEARCH_ID_SOURCE, uuidV7Source } from '../research/research-common';
import { ResearchModule } from '../research/research.module';
import { GovernanceModule } from '../governance/governance.module';
import { LivePackResearch } from '../public/live-pack-research.service';
import { GOVERNANCE_STORE, type GovernanceStore } from '../governance/governance-store';
import { RuleBuilderController } from './rule-builder.controller';
import { RuleVerificationService } from './rule-verification.service';
import {
  inMemoryRuleBuilderStore,
  mongoRuleBuilderStore,
  RULE_BUILDER_STORE,
  unavailableRuleBuilderStore,
  type RuleBuilderStore,
} from './rule-builder-store';
import { RuleBuilderService } from './rule-builder.service';

/**
 * Chooses the rule builder store: MongoDB transactions with a database; fail closed in production
 * without one; process memory (sharing the audit chain) in development and test.
 */
export function selectRuleBuilderStore(
  config: AppConfig,
  db: Db | null,
  audit: AppendOnlyCollection,
  governance: GovernanceStore,
): RuleBuilderStore {
  if (db !== null) return mongoRuleBuilderStore(db);
  return config.env === 'production'
    ? unavailableRuleBuilderStore(governance)
    : inMemoryRuleBuilderStore(audit, governance);
}

const providers: Provider[] = [
  {
    provide: RULE_BUILDER_STORE,
    inject: [APP_CONFIG, MONGO_DATABASE, AUDIT_COLLECTION, GOVERNANCE_STORE],
    useFactory: selectRuleBuilderStore,
  },
  {
    provide: RESEARCH_ID_SOURCE,
    inject: [CLOCK],
    useFactory: (clock: Clock) => uuidV7Source(() => clock.now()),
  },
  RuleBuilderService,
  RuleVerificationService,
  // The research re-check of live builder versions (BLD-01), shared with the public module.
  LivePackResearch,
];

/**
 * Scholar rule builder (Phase 2 steps 3–5). Staff routes only; reads research records to resolve
 * rulings and sources. Saving or testing a rule approves nothing; recording a source verification
 * (step 5, decision 67) approves that rule revision and publishes a new builder pack version
 * through the governance ledger in the same unit of work.
 */
@Module({
  imports: [AuthModule, AuditModule, ResearchModule, GovernanceModule],
  controllers: [RuleBuilderController],
  providers,
})
export class RuleBuilderModule {}
