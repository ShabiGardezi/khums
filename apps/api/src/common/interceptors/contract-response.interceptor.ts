import {
  Injectable,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { map, type Observable } from 'rxjs';

import { InvariantError } from '@khums/utils';

import { RESPONSE_CONTRACTS, type ResponseContractId } from '../../shared/openapi/contract-schemas';
import { RESPONSE_CONTRACT_KEY } from '../decorators/api-responses.decorator';

/**
 * Serializes every HTTP response body through its declared response contract.
 *
 * - Undeclared properties are stripped, so an additive (open) OpenAPI schema can never leak
 *   internal or sensitive fields (e.g. from a database document).
 * - A body that violates its contract is a server bug → `InvariantError` → logged 500.
 * - Fails closed: a handler that returns a body without `@ApiContractResponse` is rejected.
 *   Handlers returning nothing (e.g. 204) are allowed.
 */
@Injectable()
export class ContractResponseInterceptor implements NestInterceptor {
  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();

    const contractId = this.reflector.getAllAndOverride<ResponseContractId | undefined>(
      RESPONSE_CONTRACT_KEY,
      [context.getHandler(), context.getClass()],
    );
    const route = `${context.getClass().name}.${context.getHandler().name}`;

    return next.handle().pipe(
      map((body: unknown) => {
        if (contractId === undefined) {
          if (body === undefined) return body;
          throw new InvariantError(`${route} returns a body but declares no @ApiContractResponse`);
        }
        const result = RESPONSE_CONTRACTS[contractId].safeParse(body);
        if (!result.success) {
          throw new InvariantError(`${route} response violates contract ${contractId}`);
        }
        return result.data;
      }),
    );
  }
}
