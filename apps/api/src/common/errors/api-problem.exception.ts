import { HttpException } from '@nestjs/common';

import type { ApiErrorCode } from '@khums/validation';

/**
 * An expected failure with a stable problem `code` (rendered by `ProblemDetailsFilter`). The
 * detail is a fixed message we control: never put submitted values, tokens or internals in it.
 */
export class ApiProblemException extends HttpException {
  constructor(
    status: number,
    readonly code: ApiErrorCode,
    readonly detail: string,
    /** RFC 6750 / RFC 9470 `WWW-Authenticate` challenge for 401 responses. */
    readonly wwwAuthenticate?: string,
  ) {
    super(detail, status);
  }
}
