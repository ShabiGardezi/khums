import { Body, Controller, Module, Param, Post } from '@nestjs/common';
import { APP_FILTER, APP_PIPE, NestFactory } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';

import { decimalStringSchema, problemDetailsSchema } from '@khums/validation';

import { ProblemDetailsFilter } from '../src/common/filters/problem-details.filter';
import { createZodDto, ZodValidationPipe } from '../src/common/pipes/zod-validation.pipe';

// Test-only fixtures: the schema stands in for a shared contract from @khums/validation.
class AmountDto extends createZodDto(z.strictObject({ amount: decimalStringSchema })) {}

const calls: string[] = [];

@Controller('probe')
class ProbeController {
  @Post('validated')
  validated(@Body() body: AmountDto) {
    calls.push('validated');
    return body;
  }

  @Post('unvalidated')
  unvalidated(@Body() body: unknown) {
    calls.push('unvalidated');
    return body;
  }

  @Post('numeric/:id')
  numeric(@Param('id') id: number) {
    calls.push('numeric');
    return { id };
  }
}

@Module({
  imports: [LoggerModule.forRoot({ pinoHttp: { level: 'silent' } })],
  controllers: [ProbeController],
  providers: [
    { provide: APP_PIPE, useClass: ZodValidationPipe },
    { provide: APP_FILTER, useClass: ProblemDetailsFilter },
  ],
})
class ProbeModule {}

let baseUrl: string;
let close: () => Promise<void>;

beforeAll(async () => {
  const app = await NestFactory.create(ProbeModule, { logger: false });
  await app.listen(0, '127.0.0.1');
  baseUrl = await app.getUrl();
  close = () => app.close();
});

afterAll(async () => {
  await close();
});

const post = (path: string, body: unknown) =>
  fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

describe('global validation pipeline (integration)', () => {
  it('accepts valid input', async () => {
    const response = await post('/probe/validated', { amount: '12.50' });
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ amount: '12.50' });
  });

  it('rejects unexpected fields (strict request contract)', async () => {
    const response = await post('/probe/validated', { amount: '12.50', admin: true });
    expect(response.status).toBe(400);
    expect(problemDetailsSchema.parse(await response.json()).errors?.[0]?.code).toBe(
      'unrecognized_keys',
    );
  });

  it('rejects invalid input with VALIDATION_FAILED before the handler runs', async () => {
    calls.length = 0;
    const response = await post('/probe/validated', { amount: 12.5 });
    expect(response.status).toBe(400);
    const problem = problemDetailsSchema.parse(await response.json());
    expect(problem.code).toBe('VALIDATION_FAILED');
    expect(problem.errors?.map((e) => e.path)).toEqual(['body.amount']);
    expect(calls).toEqual([]);
  });

  it.each([
    ['/probe/unvalidated', { amount: 12.5 }],
    ['/probe/numeric/abc', {}],
  ])('fails closed for %s: 500, handler never runs, no internals leaked', async (path, body) => {
    calls.length = 0;
    const response = await post(path, body);
    expect(response.status).toBe(500);
    const problem = problemDetailsSchema.parse(await response.json());
    expect(problem.code).toBe('INTERNAL_ERROR');
    expect(JSON.stringify(problem)).not.toContain('createZodDto');
    expect(calls).toEqual([]);
  });
});
