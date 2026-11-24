import { Body, Controller, Get, HttpCode, Param, Post, Query, Req } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

import type { GovernancePackListResponse, GovernancePackVersion } from '@khums/validation';

import { requestFacts } from '../auth/staff-auth.guard';
import { StaffAuthenticated } from '../auth/staff-authenticated.decorator';
import {
  ApiContractResponse,
  ApiProblemResponses,
} from '../common/decorators/api-responses.decorator';
import {
  GovernanceCommandDto,
  GovernanceEvidenceCommandDto,
  GovernancePackListQueryDto,
  GovernancePackVersionParamsDto,
  SubmitGovernancePackDto,
  SupersedeGovernancePackDto,
  WithdrawGovernancePackDto,
  EmergencyWithdrawGovernancePackDto,
  BindGovernancePolicyDto,
} from './dto';
import { GovernanceService, type GovernanceCommandInput } from './governance.service';

const body = (id: string) => ApiBody({ schema: { $ref: `#/components/schemas/${id}` } });
const requestIdOf = (request: Request) => requestFacts(request, null, 0).requestId;

/**
 * Rule-pack governance (M4.6.4a). Thin: authorization, separation of duties, lifecycle and
 * publication rules live in `@khums/core`; content, atomicity and audit in `GovernanceService`.
 * No request carries an actor, time, Marja or policy: the server derives all of them.
 */
@ApiTags('governance')
@Controller('admin/governance/packs')
@StaffAuthenticated()
export class GovernanceController {
  constructor(private readonly governance: GovernanceService) {}

  private command(
    request: Request,
    params: GovernancePackVersionParamsDto,
    input: GovernanceCommandInput,
  ): Promise<GovernancePackVersion> {
    return this.governance.execute(
      request,
      params.packId,
      params.version,
      input,
      requestIdOf(request),
    );
  }

  @Get()
  @ApiOperation({
    summary: 'List the pack versions you may read',
    operationId: 'listGovernancePacks',
  })
  @ApiContractResponse(200, 'GovernancePackListResponse', 'Pack versions in your scope.')
  @ApiProblemResponses(400, 401, 403, 503)
  async list(
    @Req() request: Request,
    @Query() query: GovernancePackListQueryDto,
  ): Promise<GovernancePackListResponse> {
    return { packs: await this.governance.list(request, query.marjaId) };
  }

  @Get(':packId/versions/:version')
  @ApiOperation({
    summary: 'A pack version with its verified ledger',
    operationId: 'getGovernancePackVersion',
  })
  @ApiContractResponse(200, 'GovernancePackVersion', 'The pack version.')
  @ApiProblemResponses(400, 401, 403, 404, 503)
  get(
    @Req() request: Request,
    @Param() params: GovernancePackVersionParamsDto,
  ): Promise<GovernancePackVersion> {
    return this.governance.get(request, params.packId, params.version);
  }

  @Post(':packId/versions/:version/submit')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Submit sealed pack content for review (stored write-once)',
    operationId: 'submitGovernancePack',
  })
  @body('SubmitGovernancePackRequest')
  @ApiContractResponse(200, 'GovernancePackVersion', 'Submitted.')
  @ApiProblemResponses(400, 401, 403, 409, 413, 422, 503)
  submit(
    @Req() request: Request,
    @Param() params: GovernancePackVersionParamsDto,
    @Body() input: SubmitGovernancePackDto,
  ): Promise<GovernancePackVersion> {
    return this.command(request, params, {
      type: 'SUBMIT',
      expectedSequence: input.expectedSequence,
      pack: input.pack,
    });
  }

  @Post(':packId/versions/:version/review/start')
  @HttpCode(200)
  @ApiOperation({ summary: 'Start reviewing the submitted content', operationId: 'startReview' })
  @body('GovernanceCommandRequest')
  @ApiContractResponse(200, 'GovernancePackVersion', 'Review started.')
  @ApiProblemResponses(400, 401, 403, 404, 409, 503)
  startReview(
    @Req() request: Request,
    @Param() params: GovernancePackVersionParamsDto,
    @Body() input: GovernanceCommandDto,
  ): Promise<GovernancePackVersion> {
    return this.command(request, params, {
      type: 'START_REVIEW',
      expectedSequence: input.expectedSequence,
    });
  }

  @Post(':packId/versions/:version/review/request-changes')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Return the content to the author with review evidence',
    operationId: 'requestChanges',
  })
  @body('GovernanceEvidenceCommandRequest')
  @ApiContractResponse(200, 'GovernancePackVersion', 'Changes requested.')
  @ApiProblemResponses(400, 401, 403, 404, 409, 503)
  requestChanges(
    @Req() request: Request,
    @Param() params: GovernancePackVersionParamsDto,
    @Body() input: GovernanceEvidenceCommandDto,
  ): Promise<GovernancePackVersion> {
    return this.command(request, params, {
      type: 'REQUEST_CHANGES',
      expectedSequence: input.expectedSequence,
      evidence: input.evidence,
    });
  }

  @Post(':packId/versions/:version/review/complete')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Complete the review of this exact content',
    operationId: 'completeReview',
  })
  @body('GovernanceEvidenceCommandRequest')
  @ApiContractResponse(200, 'GovernancePackVersion', 'Review completed.')
  @ApiProblemResponses(400, 401, 403, 404, 409, 503)
  completeReview(
    @Req() request: Request,
    @Param() params: GovernancePackVersionParamsDto,
    @Body() input: GovernanceEvidenceCommandDto,
  ): Promise<GovernancePackVersion> {
    return this.command(request, params, {
      type: 'COMPLETE_REVIEW',
      expectedSequence: input.expectedSequence,
      evidence: input.evidence,
    });
  }

  @Post(':packId/versions/:version/approve')
  @HttpCode(200)
  @ApiOperation({ summary: 'Approve exactly the reviewed content', operationId: 'approvePack' })
  @body('GovernanceEvidenceCommandRequest')
  @ApiContractResponse(200, 'GovernancePackVersion', 'Approved.')
  @ApiProblemResponses(400, 401, 403, 404, 409, 503)
  approve(
    @Req() request: Request,
    @Param() params: GovernancePackVersionParamsDto,
    @Body() input: GovernanceEvidenceCommandDto,
  ): Promise<GovernancePackVersion> {
    return this.command(request, params, {
      type: 'APPROVE',
      expectedSequence: input.expectedSequence,
      evidence: input.evidence,
    });
  }

  @Post(':packId/versions/:version/publish')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Publish the approved content (stored write-once; never activates)',
    operationId: 'publishPack',
  })
  @body('GovernanceCommandRequest')
  @ApiContractResponse(200, 'GovernancePackVersion', 'Published.')
  @ApiProblemResponses(400, 401, 403, 404, 409, 422, 503)
  publish(
    @Req() request: Request,
    @Param() params: GovernancePackVersionParamsDto,
    @Body() input: GovernanceCommandDto,
  ): Promise<GovernancePackVersion> {
    return this.command(request, params, {
      type: 'PUBLISH',
      expectedSequence: input.expectedSequence,
    });
  }

  @Post(':packId/versions/:version/activate')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Record the activation of the published content (explicit, independent)',
    operationId: 'activatePack',
  })
  @body('GovernanceCommandRequest')
  @ApiContractResponse(200, 'GovernancePackVersion', 'Activation recorded.')
  @ApiProblemResponses(400, 401, 403, 404, 409, 422, 503)
  activate(
    @Req() request: Request,
    @Param() params: GovernancePackVersionParamsDto,
    @Body() input: GovernanceCommandDto,
  ): Promise<GovernancePackVersion> {
    return this.command(request, params, {
      type: 'ACTIVATE',
      expectedSequence: input.expectedSequence,
    });
  }

  @Post(':packId/versions/:version/withdraw')
  @HttpCode(200)
  @ApiOperation({ summary: 'Withdraw the pack version (terminal)', operationId: 'withdrawPack' })
  @body('WithdrawGovernancePackRequest')
  @ApiContractResponse(200, 'GovernancePackVersion', 'Withdrawn.')
  @ApiProblemResponses(400, 401, 403, 404, 409, 503)
  withdraw(
    @Req() request: Request,
    @Param() params: GovernancePackVersionParamsDto,
    @Body() input: WithdrawGovernancePackDto,
  ): Promise<GovernancePackVersion> {
    return this.command(request, params, {
      type: 'WITHDRAW',
      expectedSequence: input.expectedSequence,
      reason: input.reason,
    });
  }

  @Post(':packId/versions/:version/emergency-withdraw')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Administrative emergency withdrawal of a published pack version (reason required)',
    operationId: 'emergencyWithdrawPack',
  })
  @body('EmergencyWithdrawGovernancePackRequest')
  @ApiContractResponse(200, 'GovernancePackVersion', 'Withdrawn in an emergency.')
  @ApiProblemResponses(400, 401, 403, 404, 409, 503)
  emergencyWithdraw(
    @Req() request: Request,
    @Param() params: GovernancePackVersionParamsDto,
    @Body() input: EmergencyWithdrawGovernancePackDto,
  ): Promise<GovernancePackVersion> {
    return this.command(request, params, {
      type: 'EMERGENCY_WITHDRAW',
      expectedSequence: input.expectedSequence,
      reason: input.reason,
      note: input.note,
    });
  }

  @Post(':packId/versions/:version/bind-policy')
  @HttpCode(200)
  @ApiOperation({
    summary: "Bind a legacy pack version to its Marja's current governance policy",
    operationId: 'bindPackPolicy',
  })
  @body('BindGovernancePolicyRequest')
  @ApiContractResponse(200, 'GovernancePackVersion', 'Policy bound.')
  @ApiProblemResponses(400, 401, 403, 404, 409, 503)
  bindPolicy(
    @Req() request: Request,
    @Param() params: GovernancePackVersionParamsDto,
    @Body() input: BindGovernancePolicyDto,
  ): Promise<GovernancePackVersion> {
    return this.command(request, params, {
      type: 'BIND_POLICY',
      expectedSequence: input.expectedSequence,
      reason: input.reason,
    });
  }

  @Post(':packId/versions/:version/supersede')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Supersede this published version by a newer published version',
    operationId: 'supersedePack',
  })
  @body('SupersedeGovernancePackRequest')
  @ApiContractResponse(200, 'GovernancePackVersion', 'Superseded.')
  @ApiProblemResponses(400, 401, 403, 404, 409, 503)
  supersede(
    @Req() request: Request,
    @Param() params: GovernancePackVersionParamsDto,
    @Body() input: SupersedeGovernancePackDto,
  ): Promise<GovernancePackVersion> {
    return this.command(request, params, {
      type: 'SUPERSEDE',
      expectedSequence: input.expectedSequence,
      successorVersion: input.successorVersion,
    });
  }
}
