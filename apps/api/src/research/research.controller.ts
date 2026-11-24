import { randomUUID } from 'node:crypto';

import { Body, Controller, Get, HttpCode, Param, Post, Query, Req, Res } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';

import type {
  EvidenceArtefactResponse,
  EvidenceContentResponse,
  EvidenceListResponse,
  ResearchListResponse,
  ResearchMarjasResponse,
  ResearchMetadataItem,
  ResearchMetadataListResponse,
  ResearchRecordResponse,
  ResearchRevisionResponse,
  RulingVersionsResponse,
} from '@khums/validation';

import { requestFacts } from '../auth/staff-auth.guard';
import { StaffAuthenticated } from '../auth/staff-authenticated.decorator';
import {
  ApiContractResponse,
  ApiProblemResponses,
} from '../common/decorators/api-responses.decorator';
import {
  CreateResearchRecordDto,
  CreateRulingVersionDto,
  EvidenceListQueryDto,
  EvidenceParamsDto,
  ResearchEntityParamsDto,
  ResearchListQueryDto,
  ResearchRevisionParamsDto,
  ResearchTransitionDto,
  ResearchTransitionParamsDto,
  ResearchTypeParamsDto,
  ReviseResearchRecordDto,
  RulingParamsDto,
  UploadEvidenceDto,
} from './dto';
import { EvidenceService } from './evidence.service';
import { ResearchService } from './research.service';

const body = (id: string) => ApiBody({ schema: { $ref: `#/components/schemas/${id}` } });
/** The request's correlation id, or a server one (research records always carry one). */
const requestIdOf = (request: Request) =>
  requestFacts(request, null, 0).requestId ?? `server:${randomUUID()}`;

/**
 * Evidence files of research sources (M5.3.3). Registered BEFORE the generic research routes so
 * `/admin/research/evidence` is never read as a record type. Uploads have their own 3 MB JSON
 * body limit (bytes as base64, at most 2 MiB); every other route keeps the 100 kB limit.
 */
@ApiTags('research')
@Controller('admin/research/evidence')
@StaffAuthenticated()
export class EvidenceController {
  constructor(private readonly evidence: EvidenceService) {}

  @Post()
  @HttpCode(201)
  @ApiOperation({
    summary: 'Attach an evidence file to a source (stored encrypted; SHA-256 verified)',
    operationId: 'uploadEvidence',
  })
  @body('UploadEvidenceRequest')
  @ApiContractResponse(201, 'EvidenceArtefactResponse', 'Stored (write-once metadata).')
  @ApiContractResponse(
    200,
    'EvidenceArtefactResponse',
    'Already attached to this source: the existing artefact (idempotent; nothing new recorded).',
  )
  @ApiProblemResponses(400, 401, 403, 404, 409, 413, 422, 503)
  async upload(
    @Req() request: Request,
    @Body() input: UploadEvidenceDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<EvidenceArtefactResponse> {
    const { artefact, created } = await this.evidence.upload(request, input, requestIdOf(request));
    if (!created) response.status(200);
    return artefact;
  }

  @Get()
  @ApiOperation({ summary: 'The evidence files of one source', operationId: 'listEvidence' })
  @ApiContractResponse(200, 'EvidenceListResponse', 'Metadata only (no bytes).')
  @ApiProblemResponses(400, 401, 403, 404, 503)
  async list(
    @Req() request: Request,
    @Query() query: EvidenceListQueryDto,
  ): Promise<EvidenceListResponse> {
    return { items: await this.evidence.list(request, query.sourceId) };
  }

  @Get(':artefactId')
  @ApiOperation({ summary: 'Metadata of one evidence file', operationId: 'getEvidence' })
  @ApiContractResponse(200, 'EvidenceArtefactResponse', 'The metadata.')
  @ApiProblemResponses(400, 401, 403, 404, 503)
  get(
    @Req() request: Request,
    @Param() params: EvidenceParamsDto,
  ): Promise<EvidenceArtefactResponse> {
    return this.evidence.get(request, params.artefactId);
  }

  @Get(':artefactId/content')
  @ApiOperation({
    summary: 'The bytes of one evidence file, re-verified against its SHA-256',
    operationId: 'getEvidenceContent',
  })
  @ApiContractResponse(200, 'EvidenceContentResponse', 'The verified bytes (base64).')
  @ApiProblemResponses(400, 401, 403, 404, 503)
  content(
    @Req() request: Request,
    @Param() params: EvidenceParamsDto,
  ): Promise<EvidenceContentResponse> {
    return this.evidence.content(request, params.artefactId);
  }
}

/**
 * Research records of the evidence layer (M5.3.3): sources, passages and translations. Thin: the
 * authorization, lifecycle, chain, AI and reference rules live in `@khums/core`. Staff routes
 * only; nothing here is a ruling and nothing is reachable from the public calculator.
 */
@ApiTags('research')
@Controller('admin/research')
@StaffAuthenticated()
export class ResearchController {
  constructor(private readonly research: ResearchService) {}

  @Get('marjas')
  @ApiOperation({
    summary: 'The research Marjas you hold research permissions for',
    operationId: 'listResearchMarjas',
  })
  @ApiContractResponse(200, 'ResearchMarjasResponse', 'Marjas and your permissions in each.')
  @ApiProblemResponses(401, 403)
  marjas(@Req() request: Request): ResearchMarjasResponse {
    return this.research.marjas(request);
  }

  // Ruling versions (M5.3.5), registered before the generic `:type/:id/:action` route.
  @Get('rulings/:id/versions')
  @ApiOperation({
    summary: 'Every version of a ruling series and the one current (approved) version',
    operationId: 'listRulingVersions',
  })
  @ApiContractResponse(200, 'RulingVersionsResponse', 'The series.')
  @ApiProblemResponses(400, 401, 403, 404, 503)
  rulingVersions(
    @Req() request: Request,
    @Param() params: RulingParamsDto,
  ): Promise<RulingVersionsResponse> {
    return this.research.versions(request, params.id);
  }

  @Post('rulings/:id/versions')
  @HttpCode(201)
  @ApiOperation({
    summary: 'Correct the current ruling version: a new DRAFT version in the same series',
    operationId: 'createRulingVersion',
  })
  @body('CreateRulingVersionRequest')
  @ApiContractResponse(201, 'ResearchRecordResponse', 'The new DRAFT version.')
  @ApiProblemResponses(400, 401, 403, 404, 409, 413, 422, 503)
  createRulingVersion(
    @Req() request: Request,
    @Param() params: RulingParamsDto,
    @Body() input: CreateRulingVersionDto,
  ): Promise<ResearchRecordResponse> {
    return this.research.createVersion(request, params.id, input, requestIdOf(request));
  }

  @Get(':type/metadata')
  @ApiOperation({
    summary: 'History metadata of records (auditors; no content)',
    operationId: 'listResearchMetadata',
  })
  @ApiContractResponse(200, 'ResearchMetadataListResponse', 'Records you may audit.')
  @ApiProblemResponses(400, 401, 403, 503)
  async metadata(
    @Req() request: Request,
    @Param() params: ResearchTypeParamsDto,
    @Query() query: ResearchListQueryDto,
  ): Promise<ResearchMetadataListResponse> {
    return this.research.metadata(request, params.type, query);
  }

  @Get(':type')
  @ApiOperation({ summary: 'Research records you may read', operationId: 'listResearchRecords' })
  @ApiContractResponse(200, 'ResearchListResponse', 'Records in your Marjas.')
  @ApiProblemResponses(400, 401, 403, 503)
  list(
    @Req() request: Request,
    @Param() params: ResearchTypeParamsDto,
    @Query() query: ResearchListQueryDto,
  ): Promise<ResearchListResponse> {
    return this.research.list(request, params.type, query);
  }

  @Post(':type')
  @HttpCode(201)
  @ApiOperation({
    summary: 'Create a research record (revision 0, DRAFT)',
    operationId: 'createResearchRecord',
  })
  @body('CreateResearchRecordRequest')
  @ApiContractResponse(201, 'ResearchRecordResponse', 'Created.')
  @ApiProblemResponses(400, 401, 403, 409, 413, 422, 503)
  create(
    @Req() request: Request,
    @Param() params: ResearchTypeParamsDto,
    @Body() input: CreateResearchRecordDto,
  ): Promise<ResearchRecordResponse> {
    return this.research.create(request, params.type, input, requestIdOf(request));
  }

  @Get(':type/:id')
  @ApiOperation({
    summary: 'A research record: current content, history and AI provenance',
    operationId: 'getResearchRecord',
  })
  @ApiContractResponse(200, 'ResearchRecordResponse', 'The record.')
  @ApiProblemResponses(400, 401, 403, 404, 503)
  get(
    @Req() request: Request,
    @Param() params: ResearchEntityParamsDto,
  ): Promise<ResearchRecordResponse> {
    return this.research.get(request, params.type, params.id);
  }

  @Get(':type/:id/metadata')
  @ApiOperation({
    summary: 'History metadata of one record (auditors; no content)',
    operationId: 'getResearchRecordMetadata',
  })
  @ApiContractResponse(200, 'ResearchMetadataItem', 'The history metadata.')
  @ApiProblemResponses(400, 401, 403, 404, 503)
  recordMetadata(
    @Req() request: Request,
    @Param() params: ResearchEntityParamsDto,
  ): Promise<ResearchMetadataItem> {
    return this.research.recordMetadata(request, params.type, params.id);
  }

  @Get(':type/:id/revisions/:revision')
  @ApiOperation({
    summary: 'One exact revision and the content a reference to it pins',
    operationId: 'getResearchRevision',
  })
  @ApiContractResponse(200, 'ResearchRevisionResponse', 'The revision.')
  @ApiProblemResponses(400, 401, 403, 404, 503)
  revision(
    @Req() request: Request,
    @Param() params: ResearchRevisionParamsDto,
  ): Promise<ResearchRevisionResponse> {
    return this.research.revision(request, params.type, params.id, params.revision);
  }

  @Post(':type/:id/revise')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Revise a draft (full content snapshot; AI declarations are cumulative)',
    operationId: 'reviseResearchRecord',
  })
  @body('ReviseResearchRecordRequest')
  @ApiContractResponse(200, 'ResearchRecordResponse', 'Revised.')
  @ApiProblemResponses(400, 401, 403, 404, 409, 413, 422, 503)
  revise(
    @Req() request: Request,
    @Param() params: ResearchEntityParamsDto,
    @Body() input: ReviseResearchRecordDto,
  ): Promise<ResearchRecordResponse> {
    return this.research.revise(request, params.type, params.id, input, requestIdOf(request));
  }

  @Post(':type/:id/:action')
  @HttpCode(200)
  @ApiOperation({
    summary:
      'verify | review | approve | dispute | supersede | withdraw | delete-draft (reason for dispute, withdraw, delete)',
    operationId: 'transitionResearchRecord',
  })
  @body('ResearchTransitionRequest')
  @ApiContractResponse(200, 'ResearchRecordResponse', 'Applied.')
  @ApiProblemResponses(400, 401, 403, 404, 409, 422, 503)
  transition(
    @Req() request: Request,
    @Param() params: ResearchTransitionParamsDto,
    @Body() input: ResearchTransitionDto,
  ): Promise<ResearchRecordResponse> {
    return this.research.transition(
      request,
      params.type,
      params.id,
      params.action,
      input,
      requestIdOf(request),
    );
  }
}
