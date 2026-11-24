import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module';
import { GovernanceModule } from '../governance/governance.module';
import { ResearchModule } from '../research/research.module';
import { LivePackResearch } from './live-pack-research.service';
import { PublicCalculatorController } from './public-calculator.controller';
import { PublicCalculatorService } from './public-calculator.service';

/**
 * Public calculator (decision 65): unauthenticated reads of each Marja's verified pack from the
 * governance stores, re-checked against the current research records on every serve (BLD-01).
 * No staff route, no user data; the only write is the `builder.pack.suspended` audit event.
 */
@Module({
  imports: [GovernanceModule, ResearchModule, AuditModule],
  controllers: [PublicCalculatorController],
  providers: [PublicCalculatorService, LivePackResearch],
})
export class PublicModule {}
