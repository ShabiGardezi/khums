import {
  BadRequestException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { describe, expect, it } from 'vitest';

import { problemDetailsSchema } from '@khums/validation';

import { RequestValidationException } from '../errors/request-validation.exception';
import { toProblemDetails } from './problem-details';

const ctx = { path: '/api/v1/things', requestId: 'req-1' };

describe('toProblemDetails', () => {
  it('maps validation failures with field errors', () => {
    const problem = toProblemDetails(
      new RequestValidationException([{ path: 'body.amount', message: 'Invalid', code: 'custom' }]),
      ctx,
    );
    expect(problem).toMatchObject({
      status: 400,
      code: 'VALIDATION_FAILED',
      title: 'Bad Request',
      instance: '/api/v1/things',
      requestId: 'req-1',
      errors: [{ path: 'body.amount' }],
    });
    expect(problemDetailsSchema.safeParse(problem).success).toBe(true);
  });

  it('maps HttpExceptions using stable codes', () => {
    expect(toProblemDetails(new NotFoundException('Thing not found'), ctx)).toMatchObject({
      status: 404,
      code: 'NOT_FOUND',
      detail: 'Thing not found',
    });
  });

  it('never leaks details of server errors', () => {
    const problem = toProblemDetails(new Error('db password is hunter2'), ctx);
    expect(problem).toMatchObject({ status: 500, code: 'INTERNAL_ERROR' });
    expect(JSON.stringify(problem)).not.toContain('hunter2');

    const http500 = toProblemDetails(new InternalServerErrorException('secret internals'), ctx);
    expect(JSON.stringify(http500)).not.toContain('secret internals');
  });

  it('maps body-parser errors', () => {
    expect(toProblemDetails({ status: 400, type: 'entity.parse.failed' }, ctx)).toMatchObject({
      status: 400,
      code: 'MALFORMED_REQUEST',
    });
    expect(toProblemDetails({ status: 413, type: 'entity.too.large' }, ctx)).toMatchObject({
      status: 413,
      code: 'PAYLOAD_TOO_LARGE',
    });
  });

  it('never echoes body-parser messages that can contain submitted data', () => {
    const cause = Object.assign(new SyntaxError('Unexpected token in "{"amount": 123456.78'), {
      status: 400,
    });
    const problem = toProblemDetails(new BadRequestException(cause.message, { cause }), ctx);
    expect(problem).toMatchObject({ status: 400, code: 'MALFORMED_REQUEST' });
    expect(JSON.stringify(problem)).not.toContain('123456.78');
  });

  it('omits requestId when unknown', () => {
    expect(
      toProblemDetails(new NotFoundException(), { path: '/', requestId: undefined }),
    ).not.toHaveProperty('requestId');
  });
});
