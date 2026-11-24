import { Injectable, type ArgumentMetadata, type PipeTransform } from '@nestjs/common';
import type { z } from 'zod';

import { InvariantError } from '@khums/utils';

import { RequestValidationException } from '../errors/request-validation.exception';

/**
 * Global validation convention: request DTOs are classes created from the *shared* Zod
 * contracts in @khums/validation, never hand-written interfaces or class-validator classes.
 * The pipe fails closed: any @Body/@Query (and any non-string @Param) without a Zod DTO is
 * rejected, so no endpoint can accidentally receive unvalidated input.
 *
 * @example
 * class CreateRecordDto extends createZodDto(createRecordRequestSchema) {}
 * \@Post() create(@Body() body: CreateRecordDto) { ... }
 */
export interface ZodDtoClass<S extends z.ZodType = z.ZodType> {
  new (): z.output<S>;
  readonly zodSchema: S;
}

export function createZodDto<S extends z.ZodType>(schema: S): ZodDtoClass<S> {
  // A class (not an object) is required: Nest passes the parameter's class as `metatype`.
  // eslint-disable-next-line @typescript-eslint/no-extraneous-class
  class ZodDto {
    static readonly zodSchema = schema;
  }
  return ZodDto as unknown as ZodDtoClass<S>;
}

const isZodDto = (metatype: unknown): metatype is ZodDtoClass =>
  typeof metatype === 'function' && 'zodSchema' in metatype;

@Injectable()
export class ZodValidationPipe implements PipeTransform<unknown> {
  transform(value: unknown, metadata: ArgumentMetadata): unknown {
    if (metadata.type === 'custom') return value;

    if (!isZodDto(metadata.metatype)) {
      // A plain path segment typed as `string` is truthful as-is.
      if (metadata.type === 'param' && metadata.metatype === String) return value;
      // Fail closed: un-validated request input is a programming error. It surfaces as a
      // logged 500 (and fails the endpoint's tests) instead of silently reaching handlers.
      const name = metadata.data === undefined ? '' : ` "${metadata.data}"`;
      throw new InvariantError(
        `Unvalidated ${metadata.type} parameter${name}: declare it with a createZodDto() class`,
      );
    }

    const result = metadata.metatype.zodSchema.safeParse(value);
    if (result.success) return result.data;

    // Messages describe the rule, never the submitted value (it may be financial data).
    throw new RequestValidationException(
      result.error.issues.map((issue) => ({
        path: [metadata.type, ...issue.path.map(String)].join('.'),
        message: issue.message,
        code: issue.code,
      })),
    );
  }
}
