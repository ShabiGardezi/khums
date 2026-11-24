import { Module } from '@nestjs/common';

import { HealthController } from './health.controller';

/** Readiness checks (e.g. MongoDB) will be added here in Milestone 6. */
@Module({ controllers: [HealthController] })
export class HealthModule {}
