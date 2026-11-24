import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { healthResponseSchema, problemDetailsSchema } from '@khums/validation';

import { AppModule } from '../src/app.module';
import { loadConfig, type AppConfig } from '../src/config';
import { configureApp } from '../src/shared/http/configure-app';

const loaded = loadConfig({
  NODE_ENV: 'test',
  LOG_LEVEL: 'silent',
  CORS_ORIGINS: 'http://localhost:3000',
  SWAGGER_ENABLED: 'true',
});
if (!loaded.ok) throw new Error(loaded.error.join('\n'));
const config: AppConfig = loaded.value;

let app: NestExpressApplication;
let baseUrl: string;

beforeAll(async () => {
  app = await NestFactory.create<NestExpressApplication>(AppModule.register(config), {
    logger: false,
  });
  configureApp(app, config);
  await app.listen(0, '127.0.0.1');
  baseUrl = await app.getUrl();
});

afterAll(async () => {
  await app.close();
});

describe('API (integration)', () => {
  it('GET /api/v1/health returns the shared health contract', async () => {
    const response = await fetch(`${baseUrl}/api/v1/health`);
    expect(response.status).toBe(200);
    expect(healthResponseSchema.safeParse(await response.json()).success).toBe(true);
    expect(response.headers.get('x-request-id')).toMatch(/^[\w-]+$/);
    expect(response.headers.get('content-security-policy')).toContain("default-src 'none'");
    expect(response.headers.get('x-powered-by')).toBeNull();
  });

  it('propagates a well-formed incoming request id', async () => {
    const response = await fetch(`${baseUrl}/api/v1/health`, {
      headers: { 'x-request-id': 'trace-123' },
    });
    expect(response.headers.get('x-request-id')).toBe('trace-123');
  });

  it('serves routes only under the /api/v1 prefix', async () => {
    const response = await fetch(`${baseUrl}/health`);
    expect(response.status).toBe(404);
  });

  it('returns RFC 9457 problems for unknown routes', async () => {
    const response = await fetch(`${baseUrl}/api/v1/does-not-exist`);
    expect(response.status).toBe(404);
    expect(response.headers.get('content-type')).toContain('application/problem+json');
    const problem = problemDetailsSchema.parse(await response.json());
    expect(problem.code).toBe('NOT_FOUND');
    expect(problem.requestId).toBeTruthy();
    expect(problem.instance).toBe('/api/v1/does-not-exist');
  });

  it('returns MALFORMED_REQUEST for invalid JSON bodies', async () => {
    const response = await fetch(`${baseUrl}/api/v1/health`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{"broken": ',
    });
    expect(response.status).toBe(400);
    expect(problemDetailsSchema.parse(await response.json()).code).toBe('MALFORMED_REQUEST');
  });

  it('rejects bodies over the size limit', async () => {
    const response = await fetch(`${baseUrl}/api/v1/health`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ data: 'x'.repeat(200_000) }),
    });
    expect(response.status).toBe(413);
    expect(problemDetailsSchema.parse(await response.json()).code).toBe('PAYLOAD_TOO_LARGE');
  });

  it('keeps the 100 kB JSON body limit on staff routes (decision 80: no pack registration)', async () => {
    const response = await fetch(`${baseUrl}/api/v1/admin/rules`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ data: 'x'.repeat(200_000) }),
    });
    expect(response.status).toBe(413);
  });

  it('allows configured CORS origins only', async () => {
    const allowed = await fetch(`${baseUrl}/api/v1/health`, {
      headers: { origin: 'http://localhost:3000' },
    });
    expect(allowed.headers.get('access-control-allow-origin')).toBe('http://localhost:3000');

    const denied = await fetch(`${baseUrl}/api/v1/health`, {
      headers: { origin: 'https://evil.example.com' },
    });
    expect(denied.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('serves the OpenAPI document when Swagger is enabled', async () => {
    const response = await fetch(`${baseUrl}/api/docs/openapi.json`);
    expect(response.status).toBe(200);
    const document = (await response.json()) as { paths: Record<string, unknown> };
    expect(Object.keys(document.paths)).toContain('/api/v1/health');
  });
});
