import { Body, Controller, Get, HttpCode, Param, Post, Req } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

import type {
  StaffAccount,
  StaffAccountListResponse,
  TemporaryCredentialResponse,
} from '@khums/validation';

import {
  ApiContractResponse,
  ApiProblemResponses,
} from '../common/decorators/api-responses.decorator';
import {
  CreateStaffAccountDto,
  GrantStaffRoleDto,
  ReplaceStaffRoleDto,
  SetStaffAccountStatusDto,
  StaffAccountParamsDto,
  StaffReasonDto,
  StaffRoleParamsDto,
} from './dto';
import { requestFacts } from './staff-auth.guard';
import { StaffAdministrationService } from './staff-administration.service';
import { StaffAuthenticated } from './staff-authenticated.decorator';

const body = (id: string) => ApiBody({ schema: { $ref: `#/components/schemas/${id}` } });
const requestIdOf = (request: Request) => requestFacts(request, null, 0).requestId;

/**
 * Staff account administration (M4.6.2b). Thin: authorization and rules live in the service and
 * `@khums/core`. Responses that carry a temporary password are `no-store` (the guard sets it on
 * every staff response).
 */
@ApiTags('admin')
@Controller('admin/staff/accounts')
@StaffAuthenticated()
export class StaffAccountsController {
  constructor(private readonly admin: StaffAdministrationService) {}

  @Get()
  @ApiOperation({
    summary: 'List staff accounts and their roles',
    operationId: 'listStaffAccounts',
  })
  @ApiContractResponse(200, 'StaffAccountListResponse', 'Staff accounts.')
  @ApiProblemResponses(401, 403, 503)
  async list(@Req() request: Request): Promise<StaffAccountListResponse> {
    return { accounts: await this.admin.list(request) };
  }

  @Post()
  @HttpCode(201)
  @ApiOperation({
    summary: 'Create a staff account with a temporary password',
    operationId: 'createStaffAccount',
  })
  @body('CreateStaffAccountRequest')
  @ApiContractResponse(
    201,
    'TemporaryCredentialResponse',
    'Created; the temporary password is shown once.',
  )
  @ApiProblemResponses(400, 401, 403, 409, 422, 503)
  create(
    @Req() request: Request,
    @Body() input: CreateStaffAccountDto,
  ): Promise<TemporaryCredentialResponse> {
    return this.admin.create(request, input, requestIdOf(request));
  }

  @Post(':principalId/password-reset')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Issue a new temporary password (revokes every session)',
    operationId: 'resetStaffPassword',
  })
  @body('StaffAdministrationReasonRequest')
  @ApiContractResponse(
    200,
    'TemporaryCredentialResponse',
    'Reset; the temporary password is shown once.',
  )
  @ApiProblemResponses(400, 401, 403, 404, 409, 503)
  resetPassword(
    @Req() request: Request,
    @Param() params: StaffAccountParamsDto,
    @Body() input: StaffReasonDto,
  ): Promise<TemporaryCredentialResponse> {
    return this.admin.resetPassword(
      request,
      params.principalId,
      input.reason,
      requestIdOf(request),
    );
  }

  @Post(':principalId/status')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Suspend, reactivate or deactivate an account',
    operationId: 'setStaffAccountStatus',
  })
  @body('SetStaffAccountStatusRequest')
  @ApiContractResponse(200, 'StaffAccount', 'The updated account.')
  @ApiProblemResponses(400, 401, 403, 404, 409, 503)
  setStatus(
    @Req() request: Request,
    @Param() params: StaffAccountParamsDto,
    @Body() input: SetStaffAccountStatusDto,
  ): Promise<StaffAccount> {
    return this.admin.setStatus(request, params.principalId, input, requestIdOf(request));
  }

  @Post(':principalId/roles')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Grant a role with its scope (revokes the target’s sessions)',
    operationId: 'grantStaffRole',
  })
  @body('GrantStaffRoleRequest')
  @ApiContractResponse(200, 'StaffAccount', 'The updated account.')
  @ApiProblemResponses(400, 401, 403, 404, 409, 422, 503)
  grantRole(
    @Req() request: Request,
    @Param() params: StaffAccountParamsDto,
    @Body() input: GrantStaffRoleDto,
  ): Promise<StaffAccount> {
    return this.admin.grantRole(request, params.principalId, input, requestIdOf(request));
  }

  @Post(':principalId/roles/:assignmentId/revoke')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Revoke a role assignment (revokes the target’s sessions)',
    operationId: 'revokeStaffRole',
  })
  @body('StaffAdministrationReasonRequest')
  @ApiContractResponse(200, 'StaffAccount', 'The updated account.')
  @ApiProblemResponses(400, 401, 403, 404, 409, 503)
  revokeRole(
    @Req() request: Request,
    @Param() params: StaffRoleParamsDto,
    @Body() input: StaffReasonDto,
  ): Promise<StaffAccount> {
    return this.admin.revokeRole(
      request,
      params.principalId,
      params.assignmentId,
      input.reason,
      requestIdOf(request),
    );
  }

  @Post(':principalId/roles/:assignmentId/replace')
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Replace a role assignment in one audited step: change a scholar’s Marjas or convert a legacy role (revokes the target’s sessions)',
    operationId: 'replaceStaffRole',
  })
  @body('ReplaceStaffRoleRequest')
  @ApiContractResponse(200, 'StaffAccount', 'The updated account.')
  @ApiProblemResponses(400, 401, 403, 404, 409, 422, 503)
  replaceRole(
    @Req() request: Request,
    @Param() params: StaffRoleParamsDto,
    @Body() input: ReplaceStaffRoleDto,
  ): Promise<StaffAccount> {
    return this.admin.replaceRole(
      request,
      params.principalId,
      params.assignmentId,
      input,
      requestIdOf(request),
    );
  }

  @Post(':principalId/sessions/revoke')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Revoke every session of an account',
    operationId: 'revokeStaffSessions',
  })
  @body('StaffAdministrationReasonRequest')
  @ApiContractResponse(200, 'StaffAccount', 'The account.')
  @ApiProblemResponses(400, 401, 403, 404, 409, 503)
  revokeSessions(
    @Req() request: Request,
    @Param() params: StaffAccountParamsDto,
    @Body() input: StaffReasonDto,
  ): Promise<StaffAccount> {
    return this.admin.revokeSessions(
      request,
      params.principalId,
      input.reason,
      requestIdOf(request),
    );
  }

  @Post(':principalId/throttle/clear')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Clear the account’s sign-in throttle',
    operationId: 'clearStaffThrottle',
  })
  @body('StaffAdministrationReasonRequest')
  @ApiContractResponse(200, 'StaffAccount', 'The account.')
  @ApiProblemResponses(400, 401, 403, 404, 503)
  clearThrottle(
    @Req() request: Request,
    @Param() params: StaffAccountParamsDto,
    @Body() input: StaffReasonDto,
  ): Promise<StaffAccount> {
    return this.admin.clearThrottle(
      request,
      params.principalId,
      input.reason,
      requestIdOf(request),
    );
  }
}
