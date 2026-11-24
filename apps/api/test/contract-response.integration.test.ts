import { Controller, Get, HttpCode, Module } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR, NestFactory } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { problemDetailsSchema } from '@khums/validation';

import { ApiContractResponse } from '../src/common/decorators/api-responses.decorator';
import { ProblemDetailsFilter } from '../src/common/filters/problem-details.filter';
import { ContractResponseInterceptor } from '../src/common/interceptors/contract-response.interceptor';

const validHealth = {
  status: 'ok',
  service: 'khums-api',
  uptimeSeconds: 1,
  timestamp: '2026-11-19T10:00:00.000Z',
};

@Controller('probe')
class ProbeController {
  @Get('extra')
  @ApiContractResponse(200, 'HealthResponse', 'test')
  extra() {
    // Simulates a handler accidentally returning an internal field (e.g. from a DB document).
    return { ...validHealth, passwordHash: 'secret-hash', internal: { note: 'x' } };
  }

  @Get('invalid')
  @ApiContractResponse(200, 'HealthResponse', 'test')
  invalid() {
    return { status: 'broken' };
  }

  @Get('undeclared')
  undeclared() {
    return { anything: true };
  }

  @Get('empty')
  @HttpCode(204)
  empty(): void {
    return undefined;
  }
}

@Module({
  imports: [LoggerModule.forRoot({ pinoHttp: { level: 'silent' } })],
  controllers: [ProbeController],
  providers: [
    { provide: APP_INTERCEPTOR, useClass: ContractResponseInterceptor },
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

describe('response contract serialization (integration)', () => {
  it('strips undeclared (potentially sensitive) properties', async () => {
    const response = await fetch(`${baseUrl}/probe/extra`);
    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body).toEqual(validHealth);
    expect(JSON.stringify(body)).not.toContain('secret-hash');
  });

  it.each(['invalid', 'undeclared'])(
    'fails closed for %s responses with a generic 500',
    async (path) => {
      const response = await fetch(`${baseUrl}/probe/${path}`);
      expect(response.status).toBe(500);
      const problem = problemDetailsSchema.parse(await response.json());
      expect(problem.code).toBe('INTERNAL_ERROR');
      expect(JSON.stringify(problem)).not.toMatch(/contract|ProbeController/);
    },
  );

  it('allows handlers that return no body', async () => {
    const response = await fetch(`${baseUrl}/probe/empty`);
    expect(response.status).toBe(204);
  });
});
