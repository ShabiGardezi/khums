import { Controller, Get, Query, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

import type { AuditEventListResponse } from '@khums/validation';

import { StaffAuthenticated } from '../auth/staff-authenticated.decorator';
import {
  ApiContractResponse,
  ApiProblemResponses,
} from '../common/decorators/api-responses.decorator';
import { AuditEventListQueryDto } from './dto';
import { GovernanceService } from './governance.service';

/** The append-only, hash-chained audit log, read-only (M4.6.4a; `audit.log.read`). */
@ApiTags('governance')
@Controller('admin/audit/events')
@StaffAuthenticated()
export class AuditLogController {
  constructor(private readonly governance: GovernanceService) {}

  @Get()
  @ApiOperation({
    summary: 'Read the audit log in sequence order, with chain verification',
    operationId: 'listAuditEvents',
  })
  @ApiContractResponse(200, 'AuditEventListResponse', 'One page of audit events.')
  @ApiProblemResponses(400, 401, 403, 503)
  list(
    @Req() request: Request,
    @Query() query: AuditEventListQueryDto,
  ): Promise<AuditEventListResponse> {
    return this.governance.auditEvents(request, query.afterSequence, query.limit);
  }
}
