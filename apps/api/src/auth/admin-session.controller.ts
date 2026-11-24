import { Controller, Get, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

import type { AdminSessionResponse } from '@khums/validation';

import {
  ApiContractResponse,
  ApiProblemResponses,
} from '../common/decorators/api-responses.decorator';
import { authenticated } from './staff-auth.controller';
import { AllowPasswordChangeSession, StaffAuthenticated } from './staff-authenticated.decorator';

/**
 * The signed-in staff member's own principal, as the API established it (M4.6.2b).
 * Informational: it grants nothing, and every action is authorized again. Available to a
 * temporary-password session so the console can send it to the password change.
 */
@ApiTags('admin')
@Controller('admin/session')
@StaffAuthenticated()
@AllowPasswordChangeSession()
export class AdminSessionController {
  @Get()
  @ApiOperation({ summary: 'Current staff principal', operationId: 'getAdminSession' })
  @ApiContractResponse(200, 'AdminSessionResponse', 'The verified staff principal.')
  @ApiProblemResponses(401, 403, 503)
  current(@Req() request: Request): AdminSessionResponse {
    const { principal, session, account } = authenticated(request);
    const authn = principal.authentication;
    return {
      principalId: principal.principalId,
      username: account.username,
      accountStatus: principal.accountStatus,
      roles: principal.roles.map((r) => ({
        role: r.role,
        scope: { kind: r.scope.kind, marjaIds: [...r.scope.marjaIds] },
      })),
      permissions: [...principal.permissions],
      authentication: {
        assurance: authn.assurance,
        methods: [...authn.methods],
        authenticatedAt: authn.authenticatedAt,
      },
      mustChangePassword: session.passwordChangeOnly,
      sessionExpiresAt: session.expiresAt,
    };
  }
}
