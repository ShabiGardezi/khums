import { Catch, type ArgumentsHost, type ExceptionFilter } from '@nestjs/common';
import type { Request, Response } from 'express';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import { ApiProblemException } from '../errors/api-problem.exception';
import { toProblemDetails } from './problem-details';

/** Global filter: every error leaves the API as `application/problem+json` (RFC 9457). */
@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  constructor(@InjectPinoLogger(ProblemDetailsFilter.name) private readonly logger: PinoLogger) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<Request & { id?: unknown }>();
    const response = http.getResponse<Response>();

    const problem = toProblemDetails(exception, {
      // originalUrl keeps the global prefix; the query string is dropped (may hold sensitive data).
      path: request.originalUrl.split('?')[0] ?? '/',
      requestId: typeof request.id === 'string' ? request.id : undefined,
    });

    if (problem.status >= 500 && !(exception instanceof ApiProblemException)) {
      this.logger.error({ err: exception }, 'Unhandled exception');
    }

    if (response.headersSent) return;
    if (exception instanceof ApiProblemException && exception.wwwAuthenticate !== undefined) {
      response.setHeader('WWW-Authenticate', exception.wwwAuthenticate);
    }
    response.status(problem.status).type('application/problem+json').json(problem);
  }
}
