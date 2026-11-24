import { STATUS_CODES } from 'node:http';

import { HttpException } from '@nestjs/common';

import { API_ERROR_CODES, type ApiErrorCode, type ProblemDetails } from '@khums/validation';

import { ApiProblemException } from '../errors/api-problem.exception';
import { RequestValidationException } from '../errors/request-validation.exception';

const CODE_BY_STATUS: Readonly<Partial<Record<number, ApiErrorCode>>> = {
  400: API_ERROR_CODES.BAD_REQUEST,
  401: API_ERROR_CODES.UNAUTHORIZED,
  403: API_ERROR_CODES.FORBIDDEN,
  404: API_ERROR_CODES.NOT_FOUND,
  405: API_ERROR_CODES.METHOD_NOT_ALLOWED,
  409: API_ERROR_CODES.CONFLICT,
  413: API_ERROR_CODES.PAYLOAD_TOO_LARGE,
  422: API_ERROR_CODES.UNPROCESSABLE_ENTITY,
  429: API_ERROR_CODES.TOO_MANY_REQUESTS,
  503: API_ERROR_CODES.SERVICE_UNAVAILABLE,
};

const GENERIC_SERVER_ERROR = 'An unexpected error occurred.';

export interface ProblemContext {
  readonly path: string;
  readonly requestId: string | undefined;
}

/** Errors raised by Express middleware such as body-parser (`http-errors` shape). */
const isMiddlewareHttpError = (value: unknown): value is { status: number; type?: string } =>
  typeof value === 'object' &&
  value !== null &&
  'status' in value &&
  typeof value.status === 'number' &&
  value.status >= 400 &&
  value.status < 500;

const messageOf = (exception: HttpException): string | undefined => {
  const response = exception.getResponse();
  if (typeof response === 'string') return response;
  if (typeof response === 'object' && 'message' in response) {
    if (typeof response.message === 'string') return response.message;
  }
  return undefined;
};

/**
 * Convert any thrown value into an RFC 9457 problem. Server errors never expose internal
 * details; client errors expose only messages we control.
 */
export function toProblemDetails(exception: unknown, context: ProblemContext): ProblemDetails {
  const build = (
    status: number,
    code: ApiErrorCode,
    detail: string | undefined,
    errors?: ProblemDetails['errors'],
  ): ProblemDetails => ({
    type: 'about:blank',
    title: STATUS_CODES[status] ?? 'Error',
    status,
    code,
    ...(detail === undefined ? {} : { detail }),
    instance: context.path,
    ...(context.requestId === undefined ? {} : { requestId: context.requestId }),
    ...(errors === undefined ? {} : { errors }),
  });

  if (exception instanceof RequestValidationException) {
    return build(400, API_ERROR_CODES.VALIDATION_FAILED, 'Request validation failed.', [
      ...exception.fieldErrors,
    ]);
  }

  if (exception instanceof ApiProblemException) {
    return build(exception.getStatus(), exception.code, exception.detail);
  }

  // Express/body-parser errors (malformed JSON, oversized body, bad URI encoding). Nest wraps
  // them in an HttpException whose message can echo fragments of the submitted body, so the
  // original message is never returned.
  const middlewareError = exception instanceof HttpException ? exception.cause : exception;
  if (isMiddlewareHttpError(middlewareError)) {
    return middlewareError.status === 413
      ? build(413, API_ERROR_CODES.PAYLOAD_TOO_LARGE, 'Request body is too large.')
      : build(
          middlewareError.status,
          API_ERROR_CODES.MALFORMED_REQUEST,
          'Request could not be parsed.',
        );
  }

  if (exception instanceof HttpException) {
    const status = exception.getStatus();
    if (status >= 500) {
      return build(
        status,
        CODE_BY_STATUS[status] ?? API_ERROR_CODES.INTERNAL_ERROR,
        GENERIC_SERVER_ERROR,
      );
    }
    return build(
      status,
      CODE_BY_STATUS[status] ?? API_ERROR_CODES.BAD_REQUEST,
      messageOf(exception),
    );
  }

  return build(500, API_ERROR_CODES.INTERNAL_ERROR, GENERIC_SERVER_ERROR);
}
