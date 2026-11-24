import {
  Inject,
  Injectable,
  Logger,
  Module,
  type OnModuleInit,
  type Provider,
} from '@nestjs/common';
import type { Db } from 'mongodb';

import { AuditModule } from '../audit/audit.module';
import { AUDIT_COLLECTION } from '../audit/audit.service';
import { APP_CONFIG, type AppConfig } from '../config';
import type { AppendOnlyCollection } from '../persistence/append-only-collection';
import { MONGO_DATABASE } from '../persistence/persistence.module';
import { AdminSessionController } from './admin-session.controller';
import { CLOCK, type Clock } from './auth.tokens';
import { seedE2eFixture } from './e2e-fixture';
import {
  argon2idHasher,
  PASSWORD_HASHER,
  PRODUCTION_ARGON2,
  TEST_ARGON2,
  type PasswordHasher,
} from './password-hasher';
import { StaffAccountsController } from './staff-accounts.controller';
import { StaffAdministrationService } from './staff-administration.service';
import { StaffAuthController } from './staff-auth.controller';
import { StaffAuthGuard } from './staff-auth.guard';
import { StaffAuthService } from './staff-auth.service';
import { StaffAuthorizationService } from './staff-authorization.service';
import { StaffNamesService } from './staff-names.service';
import {
  inMemoryStaffStore,
  mongoStaffStore,
  STAFF_STORE,
  unavailableStaffStore,
  type StaffStore,
} from './staff-store';

/**
 * Chooses the staff store: MongoDB when configured; otherwise unavailable in production (every
 * staff request fails closed) and process memory in development and test, sharing the in-memory
 * audit collection with `AuditModule` so there is one audit chain.
 */
export function selectStaffStore(
  config: AppConfig,
  db: Db | null,
  audit?: AppendOnlyCollection,
): StaffStore {
  if (db !== null) return mongoStaffStore(db);
  return config.env === 'production' ? unavailableStaffStore() : inMemoryStaffStore(audit);
}

/** TEST ONLY: seeds the Playwright fixture when `STAFF_E2E_FIXTURE_FILE` is set (never production). */
@Injectable()
class StaffStartup implements OnModuleInit {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(STAFF_STORE) private readonly store: StaffStore,
    @Inject(PASSWORD_HASHER) private readonly hasher: PasswordHasher,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async onModuleInit(): Promise<void> {
    const logger = new Logger('StaffAuth');
    if (this.config.staffAuth === null) {
      logger.warn('STAFF_AUTH_SECRET is not set; staff routes refuse all requests.');
      return;
    }
    if (!this.store.durable && this.config.env === 'production') {
      logger.warn('No database configured; staff routes refuse all requests.');
    }
    const fixture = this.config.staffAuth.e2eFixtureFile;
    if (fixture !== undefined && this.config.env !== 'production') {
      logger.warn('TEST ONLY: seeding the in-memory e2e staff fixture.');
      await seedE2eFixture(fixture, this.store, this.hasher, this.clock.now());
    }
  }
}

const providers: Provider[] = [
  {
    provide: PASSWORD_HASHER,
    inject: [APP_CONFIG],
    // Test runs use small Argon2id parameters for speed; development and production never do.
    useFactory: (config: AppConfig) =>
      argon2idHasher(config.env === 'test' ? TEST_ARGON2 : PRODUCTION_ARGON2),
  },
  {
    provide: STAFF_STORE,
    inject: [APP_CONFIG, MONGO_DATABASE, AUDIT_COLLECTION],
    useFactory: (config: AppConfig, db: Db | null, audit: AppendOnlyCollection) =>
      selectStaffStore(config, db, audit),
  },
  StaffAuthService,
  StaffAuthGuard,
  StaffAuthorizationService,
  StaffAdministrationService,
  StaffStartup,
  StaffNamesService,
];

/** Staff authentication and administration (M4.6.2b). Public modules do not import it. */
@Module({
  imports: [AuditModule],
  controllers: [StaffAuthController, AdminSessionController, StaffAccountsController],
  providers,
  exports: [StaffAuthGuard, StaffAuthService, StaffAuthorizationService, StaffNamesService],
})
export class AuthModule {}
