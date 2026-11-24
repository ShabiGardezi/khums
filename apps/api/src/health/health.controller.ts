import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import type { HealthResponse } from '@khums/validation';

import {
  ApiContractResponse,
  ApiProblemResponses,
} from '../common/decorators/api-responses.decorator';

/** Liveness probe for load balancers and orchestrators. Reports no internal details. */
@ApiTags('health')
@Controller('health')
export class HealthController {
  private readonly startedAt = Date.now();

  @Get()
  @ApiOperation({ summary: 'Liveness check', operationId: 'getHealth' })
  @ApiContractResponse(200, 'HealthResponse', 'The API process is running.')
  @ApiProblemResponses()
  check(): HealthResponse {
    const now = Date.now();
    return {
      status: 'ok',
      service: 'khums-api',
      uptimeSeconds: Math.floor((now - this.startedAt) / 1000),
      timestamp: new Date(now).toISOString(),
    };
  }
}
