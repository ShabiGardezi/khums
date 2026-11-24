import { Body, Controller, Get, HttpCode, Post, Req } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

import {
  API_ERROR_CODES,
  type GovernancePolicyChangeResponse,
  type GovernancePolicyRegistryResponse,
} from '@khums/validation';

import { requestFacts } from '../auth/staff-auth.guard';
import { StaffAuthenticated } from '../auth/staff-authenticated.decorator';
import { problemForDenial } from '../auth/staff-authorization.service';
import {
  ApiContractResponse,
  ApiProblemResponses,
} from '../common/decorators/api-responses.decorator';
import { ApiProblemException } from '../common/errors/api-problem.exception';
import { ConfirmGovernancePolicyDto, ProposeGovernancePolicyDto } from './dto';
import { GovernancePolicyService, type PolicyServiceResult } from './governance-policy.service';

const body = (id: string) => ApiBody({ schema: { $ref: `#/components/schemas/${id}` } });
const unavailable = () =>
  new ApiProblemException(
    503,
    API_ERROR_CODES.SERVICE_UNAVAILABLE,
    'Governance policies are currently unavailable.',
  );

/** Maps a policy-service result to the response or a problem (codes only, never content). */
function changeResponse(result: PolicyServiceResult): GovernancePolicyChangeResponse {
  if (result.failure === 'POLICY_STORE_CONFLICT') {
    throw new ApiProblemException(
      409,
      API_ERROR_CODES.GOVERNANCE_CONFLICT,
      'The policy registry changed meanwhile. Reload and try again.',
    );
  }
  const outcome = result.outcome;
  if (outcome === null) throw unavailable();
  if (outcome.status === 'DENIED') {
    throw problemForDenial(
      outcome.decision.allowed ? 'UNVERIFIED_PRINCIPAL' : outcome.decision.reason,
    );
  }
  if (outcome.status === 'REFUSED') {
    throw new ApiProblemException(
      outcome.issue === 'POLICY_CHANGE_INVALID' ? 422 : 409,
      API_ERROR_CODES.GOVERNANCE_REFUSED,
      `The policy change was refused (${outcome.issue}).`,
    );
  }
  const { record } = outcome;
  if (record.kind === 'INITIAL_CONFIGURATION') throw unavailable();
  return {
    recordId: record.recordId,
    kind: record.kind,
    marjaId: record.marjaId,
    previousPolicy: record.previousPolicy,
    newPolicy: record.newPolicy,
    requestId: record.requestId,
    recordedAt: record.recordedAt,
  };
}

/**
 * Per-Marja governance policies (M4.6.4a). A change needs two administrators: one proposes, a
 * different one confirms exactly what they were shown. Process configuration only: it grants no
 * religious authority, and it affects only pack versions submitted afterwards.
 */
@ApiTags('governance')
@Controller('admin/governance/policies')
@StaffAuthenticated()
export class GovernancePolicyController {
  constructor(private readonly policies: GovernancePolicyService) {}

  @Get()
  @ApiOperation({
    summary: 'Active policies and the pending proposal (Marjas you may administer)',
    operationId: 'getGovernancePolicies',
  })
  @ApiContractResponse(200, 'GovernancePolicyRegistryResponse', 'Policies in your scope.')
  @ApiProblemResponses(401, 403, 503)
  async view(@Req() request: Request): Promise<GovernancePolicyRegistryResponse> {
    const view = await this.policies.view(request);
    if (view.kind === 'UNAVAILABLE') throw unavailable();
    if (view.kind === 'DENIED') {
      throw problemForDenial(view.decision.allowed ? 'UNVERIFIED_PRINCIPAL' : view.decision.reason);
    }
    return view.value;
  }

  @Post('proposals')
  @HttpCode(201)
  @ApiOperation({
    summary: 'Propose a policy change for one Marja (step 1 of 2)',
    operationId: 'proposeGovernancePolicy',
  })
  @body('ProposeGovernancePolicyRequest')
  @ApiContractResponse(201, 'GovernancePolicyChangeResponse', 'Proposed (not yet in effect).')
  @ApiProblemResponses(400, 401, 403, 409, 422, 503)
  async propose(
    @Req() request: Request,
    @Body() input: ProposeGovernancePolicyDto,
  ): Promise<GovernancePolicyChangeResponse> {
    const requestId = requestFacts(request, null, 0).requestId ?? 'none';
    return changeResponse(await this.policies.proposePolicyChange(request, input, requestId));
  }

  @Post('proposals/confirm')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Confirm the pending proposal as a second administrator (step 2 of 2)',
    operationId: 'confirmGovernancePolicy',
  })
  @body('ConfirmGovernancePolicyRequest')
  @ApiContractResponse(
    200,
    'GovernancePolicyChangeResponse',
    'Confirmed; in effect for new versions.',
  )
  @ApiProblemResponses(400, 401, 403, 409, 422, 503)
  async confirm(
    @Req() request: Request,
    @Body() input: ConfirmGovernancePolicyDto,
  ): Promise<GovernancePolicyChangeResponse> {
    const requestId = requestFacts(request, null, 0).requestId ?? 'none';
    return changeResponse(await this.policies.confirmPolicyChange(request, input, requestId));
  }
}
