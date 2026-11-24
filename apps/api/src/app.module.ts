import { Module, type DynamicModule } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';

import { ProblemDetailsFilter } from './common/filters/problem-details.filter';
import { EdgeSignatureGuard } from './common/guards/edge-signature.guard';
import { ContractResponseInterceptor } from './common/interceptors/contract-response.interceptor';
import { ZodValidationPipe } from './common/pipes/zod-validation.pipe';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { AppConfigModule, type AppConfig } from './config';
import { GovernanceModule } from './governance/governance.module';
import { PublicPackCacheModule } from './public/public-pack-cache';
import { PublicModule } from './public/public.module';
import { ResearchModule } from './research/research.module';
import { RuleBuilderModule } from './rule-builder/rule-builder.module';
import { HealthModule } from './health/health.module';
import { PersistenceModule } from './persistence/persistence.module';
import { ClockModule } from './shared/clock/clock.module';
import { ShutdownLoggerService } from './shared/lifecycle/shutdown-logger.service';
import { createLoggerParams } from './shared/logging/logger-params';

/**
 * Root module. Built from an already-validated config so tests and tools can supply their own.
 * Feature modules (Auth, Users, Marja, Calculation, …) are registered here as they are added —
 * see apps/api/README.md.
 */
@Module({})
export class AppModule {
  static register(config: AppConfig): DynamicModule {
    return {
      module: AppModule,
      imports: [
        AppConfigModule.forRoot(config),
        LoggerModule.forRoot(createLoggerParams(config)),
        ClockModule,
        PublicPackCacheModule,
        PersistenceModule,
        HealthModule,
        AuthModule,
        AuditModule,
        GovernanceModule,
        ResearchModule,
        RuleBuilderModule,
        PublicModule,
      ],
      providers: [
        { provide: APP_FILTER, useClass: ProblemDetailsFilter },
        // M4.7: first gate on every route (a no-op unless KHUMS_REQUIRE_EDGE_SIGNATURE).
        { provide: APP_GUARD, useClass: EdgeSignatureGuard },
        { provide: APP_PIPE, useClass: ZodValidationPipe },
        { provide: APP_INTERCEPTOR, useClass: ContractResponseInterceptor },
        ShutdownLoggerService,
      ],
    };
  }
}
