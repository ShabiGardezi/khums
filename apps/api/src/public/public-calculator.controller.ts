import { Controller, Get, Param } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import type { PublicMarjaListResponse, PublicVerifiedPackResponse } from '@khums/validation';

import {
  ApiContractResponse,
  ApiProblemResponses,
} from '../common/decorators/api-responses.decorator';
import { PublicMarjaParamsDto } from './dto';
import { PublicCalculatorService } from './public-calculator.service';

/**
 * Public calculator reads (decision 65). Unauthenticated and read-only: no session, no cookie,
 * no request body. Thin: the verified-pack rule lives in `@khums/core`.
 */
@ApiTags('public')
@Controller('public/marjas')
export class PublicCalculatorController {
  constructor(private readonly calculator: PublicCalculatorService) {}

  @Get()
  @ApiOperation({
    summary: 'Marjas and the trace of their verified rule pack, if any',
    operationId: 'listPublicMarjas',
  })
  @ApiContractResponse(200, 'PublicMarjaListResponse', 'Every catalogue Marja.')
  @ApiProblemResponses(503)
  list(): Promise<PublicMarjaListResponse> {
    return this.calculator.list();
  }

  @Get(':marjaId/pack')
  @ApiOperation({
    summary: 'The verified (governed, published, activated, ready) rule pack of a Marja',
    operationId: 'getPublicVerifiedPack',
  })
  @ApiContractResponse(
    200,
    'PublicVerifiedPackResponse',
    'The verified pack with its governance ledger, or NOT_AVAILABLE.',
  )
  @ApiProblemResponses(400, 503)
  pack(@Param() params: PublicMarjaParamsDto): Promise<PublicVerifiedPackResponse> {
    return this.calculator.pack(params.marjaId);
  }
}
