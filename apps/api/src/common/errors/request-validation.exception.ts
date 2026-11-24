import { BadRequestException } from '@nestjs/common';

import type { ProblemFieldError } from '@khums/validation';

/** Thrown by `ZodValidationPipe`; rendered by `ProblemDetailsFilter` as `VALIDATION_FAILED`. */
export class RequestValidationException extends BadRequestException {
  constructor(readonly fieldErrors: readonly ProblemFieldError[]) {
    super('Request validation failed.');
  }
}
