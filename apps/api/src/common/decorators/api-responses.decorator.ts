import { applyDecorators, SetMetadata } from '@nestjs/common';
import { ApiResponse } from '@nestjs/swagger';

import type { ResponseContractId } from '../../shared/openapi/contract-schemas';

/** Metadata key read by `ContractResponseInterceptor`. */
export const RESPONSE_CONTRACT_KEY = 'khums:response-contract';

const ref = (id: ResponseContractId) => ({ $ref: `#/components/schemas/${id}` });

/**
 * Declares a JSON success response whose schema is a shared Zod contract: documents it in
 * OpenAPI *and* makes `ContractResponseInterceptor` serialize the handler's return value through
 * that schema (undeclared properties are stripped; contract violations become a logged 500).
 */
export const ApiContractResponse = (
  status: number,
  schemaId: ResponseContractId,
  description: string,
): MethodDecorator & ClassDecorator =>
  applyDecorators(
    ApiResponse({
      status,
      description,
      content: { 'application/json': { schema: ref(schemaId) } },
    }),
    SetMetadata(RESPONSE_CONTRACT_KEY, schemaId),
  );

/** Documents the standard RFC 9457 error responses an endpoint can return. */
export const ApiProblemResponses = (...statuses: number[]): MethodDecorator & ClassDecorator =>
  applyDecorators(
    ...[...statuses, 500].map((status) =>
      ApiResponse({
        status,
        description: 'Problem Details (RFC 9457)',
        content: { 'application/problem+json': { schema: ref('ProblemDetails') } },
      }),
    ),
  );
