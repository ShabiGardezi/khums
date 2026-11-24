import { Body, Controller, Get, HttpCode, Param, Post, Query, Req } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

import type {
  BuilderPublicationListResponse,
  RuleInflationResponse,
  RuleRequestListResponse,
  RuleRequestResponse,
  RuleVerificationResponse,
  RuleVerificationStatusResponse,
  ScholarRuleCheckResponse,
  ScholarRuleListResponse,
  ScholarRuleResponse,
  ScholarRuleTestResponse,
} from '@khums/validation';

import { requestFacts } from '../auth/staff-auth.guard';
import { StaffAuthenticated } from '../auth/staff-authenticated.decorator';
import {
  ApiContractResponse,
  ApiProblemResponses,
} from '../common/decorators/api-responses.decorator';
import {
  CheckScholarRuleDto,
  CreateRuleRequestDto,
  ResolveRuleRequestDto,
  RuleInflationQueryDto,
  RuleRequestParamsDto,
  CreateScholarRuleDto,
  ReviseScholarRuleDto,
  ScholarRuleListQueryDto,
  ScholarRuleParamsDto,
  TestScholarRulesDto,
  VerifyScholarRuleDto,
} from './dto';
import { RuleBuilderService } from './rule-builder.service';
import { RuleVerificationService } from './rule-verification.service';

const body = (id: string) => ApiBody({ schema: { $ref: `#/components/schemas/${id}` } });
const requestIdOf = (request: Request) => requestFacts(request, null, 0).requestId;

/**
 * Scholar rule builder (Phase 2 steps 3–5): predefined rule fields per Marja, append-only
 * revisions, the developer-requirement check, staff-only PROVISIONAL test calculations, and source
 * verification (step 5): recording the four attestations approves that revision and publishes a
 * new builder pack version automatically (decisions 63, 67). Thin: authorization, validation, the
 * capability check, compilation and the ledger live in `@khums/core`. Staff routes only.
 */
@ApiTags('rule-builder')
@Controller('admin/rules')
@StaffAuthenticated()
export class RuleBuilderController {
  constructor(
    private readonly rules: RuleBuilderService,
    private readonly verification: RuleVerificationService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'The builder rules of one Marja', operationId: 'listScholarRules' })
  @ApiContractResponse(200, 'ScholarRuleListResponse', 'Rules with their derived status.')
  @ApiProblemResponses(400, 401, 403, 503)
  list(
    @Req() request: Request,
    @Query() query: ScholarRuleListQueryDto,
  ): Promise<ScholarRuleListResponse> {
    return this.rules.list(request, query.marjaId);
  }

  @Post()
  @HttpCode(201)
  @ApiOperation({ summary: 'Create a builder rule (revision 0)', operationId: 'createScholarRule' })
  @body('CreateScholarRuleRequest')
  @ApiContractResponse(201, 'ScholarRuleResponse', 'Created.')
  @ApiProblemResponses(400, 401, 403, 409, 413, 422, 503)
  create(
    @Req() request: Request,
    @Body() input: CreateScholarRuleDto,
  ): Promise<ScholarRuleResponse> {
    return this.rules.create(request, input, requestIdOf(request));
  }

  // Fixed paths before `:ruleId`.
  @Post('check')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Check unsaved rule content (developer-requirement check; nothing is stored)',
    operationId: 'checkScholarRule',
  })
  @body('CheckScholarRuleRequest')
  @ApiContractResponse(200, 'ScholarRuleCheckResponse', 'The check.')
  @ApiProblemResponses(400, 401, 403, 413)
  check(@Req() request: Request, @Body() input: CheckScholarRuleDto): ScholarRuleCheckResponse {
    return this.rules.check(request, input);
  }

  @Post('test')
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Compile the Marja’s latest rule revisions into a test pack and run a PROVISIONAL test calculation',
    operationId: 'testScholarRules',
  })
  @body('TestScholarRulesRequest')
  @ApiContractResponse(200, 'ScholarRuleTestResponse', 'PROVISIONAL — FOR SCHOLAR REVIEW ONLY.')
  @ApiProblemResponses(400, 401, 403, 413, 422, 503)
  test(
    @Req() request: Request,
    @Body() input: TestScholarRulesDto,
  ): Promise<ScholarRuleTestResponse> {
    return this.rules.test(request, input, requestIdOf(request));
  }

  @Get('inflation')
  @ApiOperation({
    summary:
      'Official monthly-CPI inflation between two dates for a currency (a suggestion the staff test panel pre-fills)',
    operationId: 'ruleInflation',
  })
  @ApiContractResponse(200, 'RuleInflationResponse', 'The figure, or not available.')
  @ApiProblemResponses(400, 401, 403)
  inflation(@Req() request: Request, @Query() query: RuleInflationQueryDto): RuleInflationResponse {
    return this.rules.inflation(request, query);
  }

  @Get('requests')
  @ApiOperation({
    summary: 'Scholar requests (missing rules, calculation changes) of one Marja',
    operationId: 'listRuleRequests',
  })
  @ApiContractResponse(200, 'RuleRequestListResponse', 'Requests, newest first.')
  @ApiProblemResponses(400, 401, 403, 503)
  listRequests(
    @Req() request: Request,
    @Query() query: ScholarRuleListQueryDto,
  ): Promise<RuleRequestListResponse> {
    return this.rules.listRequests(request, query.marjaId);
  }

  @Post('requests')
  @HttpCode(201)
  @ApiOperation({
    summary: 'Ask for a missing rule or a calculation change',
    operationId: 'createRuleRequest',
  })
  @body('CreateRuleRequestRequest')
  @ApiContractResponse(201, 'RuleRequestResponse', 'Created.')
  @ApiProblemResponses(400, 401, 403, 404, 413, 422, 503)
  createRequest(
    @Req() request: Request,
    @Body() input: CreateRuleRequestDto,
  ): Promise<RuleRequestResponse> {
    return this.rules.createRequest(request, input, requestIdOf(request));
  }

  @Post('requests/:requestId/resolve')
  @HttpCode(200)
  @ApiOperation({ summary: 'Resolve a scholar request', operationId: 'resolveRuleRequest' })
  @body('ResolveRuleRequestRequest')
  @ApiContractResponse(200, 'RuleRequestResponse', 'Resolved.')
  @ApiProblemResponses(400, 401, 403, 404, 409, 413, 503)
  resolveRequest(
    @Req() request: Request,
    @Param() params: RuleRequestParamsDto,
    @Body() input: ResolveRuleRequestDto,
  ): Promise<RuleRequestResponse> {
    return this.rules.resolveRequest(request, params.requestId, input, requestIdOf(request));
  }

  @Get('publications')
  @ApiOperation({
    summary: 'The active (public) builder pack version of each Marja you may read',
    operationId: 'listBuilderPublications',
  })
  @ApiContractResponse(200, 'BuilderPublicationListResponse', 'Builder pack versions per Marja.')
  @ApiProblemResponses(401, 403, 503)
  publications(@Req() request: Request): Promise<BuilderPublicationListResponse> {
    return this.verification.publications(request);
  }

  @Get(':ruleId')
  @ApiOperation({ summary: 'One builder rule with its history', operationId: 'getScholarRule' })
  @ApiContractResponse(200, 'ScholarRuleResponse', 'The rule.')
  @ApiProblemResponses(400, 401, 403, 404, 503)
  get(
    @Req() request: Request,
    @Param() params: ScholarRuleParamsDto,
  ): Promise<ScholarRuleResponse> {
    return this.rules.get(request, params.ruleId);
  }

  @Post(':ruleId/revise')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Save a new revision of a builder rule',
    operationId: 'reviseScholarRule',
  })
  @body('ReviseScholarRuleRequest')
  @ApiContractResponse(200, 'ScholarRuleResponse', 'The new revision.')
  @ApiProblemResponses(400, 401, 403, 404, 409, 413, 422, 503)
  revise(
    @Req() request: Request,
    @Param() params: ScholarRuleParamsDto,
    @Body() input: ReviseScholarRuleDto,
  ): Promise<ScholarRuleResponse> {
    return this.rules.revise(request, params.ruleId, input, requestIdOf(request));
  }

  @Get(':ruleId/verification')
  @ApiOperation({
    summary: 'Source verification status, preconditions, history and public status of a rule',
    operationId: 'getScholarRuleVerification',
  })
  @ApiContractResponse(200, 'RuleVerificationStatusResponse', 'The verification status.')
  @ApiProblemResponses(400, 401, 403, 404, 503)
  verificationStatus(
    @Req() request: Request,
    @Param() params: ScholarRuleParamsDto,
  ): Promise<RuleVerificationStatusResponse> {
    return this.verification.status(request, params.ruleId);
  }

  @Post(':ruleId/verify')
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Record the source verification of the current revision (four attestations); publishes a new builder pack version automatically',
    operationId: 'verifyScholarRule',
  })
  @body('VerifyScholarRuleRequest')
  @ApiContractResponse(200, 'RuleVerificationResponse', 'Verified, approved and published.')
  @ApiProblemResponses(400, 401, 403, 404, 409, 413, 422, 503)
  verify(
    @Req() request: Request,
    @Param() params: ScholarRuleParamsDto,
    @Body() input: VerifyScholarRuleDto,
  ): Promise<RuleVerificationResponse> {
    return this.verification.verify(request, params.ruleId, input, requestIdOf(request));
  }
}
