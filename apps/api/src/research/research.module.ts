import { Logger, Module, type Provider } from '@nestjs/common';
import type { Db } from 'mongodb';

import { AUDIT_COLLECTION } from '../audit/audit.service';
import { AuditModule } from '../audit/audit.module';
import { CLOCK, type Clock } from '../auth/auth.tokens';
import { AuthModule } from '../auth/auth.module';
import { APP_CONFIG, type AppConfig } from '../config';
import type { AppendOnlyCollection } from '../persistence/append-only-collection';
import { MONGO_DATABASE } from '../persistence/persistence.module';
import { EVIDENCE_STORAGE, selectEvidenceStorage } from './evidence-tokens';
import { EvidenceService } from './evidence.service';
import { RESEARCH_ID_SOURCE, uuidV7Source } from './research-common';
import { EvidenceController, ResearchController } from './research.controller';
import {
  inMemoryResearchStore,
  mongoResearchStore,
  RESEARCH_STORE,
  unavailableResearchStore,
  type ResearchStore,
} from './research-store';
import { ResearchService } from './research.service';

/**
 * Chooses the research store: MongoDB transactions with a database; fail closed in production
 * without one; process memory (sharing the audit chain) in development and test.
 */
export function selectResearchStore(
  config: AppConfig,
  db: Db | null,
  audit: AppendOnlyCollection,
): ResearchStore {
  if (db !== null) return mongoResearchStore(db);
  return config.env === 'production' ? unavailableResearchStore() : inMemoryResearchStore(audit);
}

const providers: Provider[] = [
  {
    provide: RESEARCH_STORE,
    inject: [APP_CONFIG, MONGO_DATABASE, AUDIT_COLLECTION],
    useFactory: selectResearchStore,
  },
  {
    provide: EVIDENCE_STORAGE,
    inject: [APP_CONFIG],
    useFactory: (config: AppConfig) => {
      const storage = selectEvidenceStorage(config);
      if (storage.kind === 'UNAVAILABLE') {
        new Logger('Research').warn(
          'No durable evidence storage on this deployment; evidence uploads answer 503.',
        );
      }
      return storage;
    },
  },
  {
    provide: RESEARCH_ID_SOURCE,
    inject: [CLOCK],
    useFactory: (clock: Clock) => uuidV7Source(() => clock.now()),
  },
  ResearchService,
  EvidenceService,
];

/**
 * Scholar research management, evidence layer (M5.3.3): sources, evidence artefacts, passages and
 * translations. Staff routes only; research records are never religious guidance and are never
 * served by public routes.
 */
@Module({
  imports: [AuthModule, AuditModule],
  // Evidence first: `/admin/research/evidence` must not be matched as a record type.
  controllers: [EvidenceController, ResearchController],
  providers,
  // Governance and provisional registration resolve rule-pack ruling references (M5.3.6).
  exports: [RESEARCH_STORE],
})
export class ResearchModule {}
