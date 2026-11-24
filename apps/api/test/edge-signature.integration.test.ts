import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { problemDetailsSchema } from '@khums/validation';

import { AppModule } from '../src/app.module';
import {
  CLIENT_IP_AT_HEADER,
  CLIENT_IP_HEADER,
  CLIENT_IP_MAX_SKEW_MS,
  CLIENT_IP_SIGNATURE_HEADER,
  signClientIp,
} from '../src/auth/client-ip';
import { loadConfig, type AppConfig } from '../src/config';
import { configureApp } from '../src/shared/http/configure-app';

/** M4.7: with KHUMS_REQUIRE_EDGE_SIGNATURE the API answers only the signed web tier. */

const SECRET = 'test-only-edge-secret-not-real-0123456789abcdef';
const loaded = loadConfig({
  NODE_ENV: 'test',
  LOG_LEVEL: 'silent',
  CORS_ORIGINS: 'http://localhost:3000',
  STAFF_EDGE_SECRET: SECRET,
  KHUMS_REQUIRE_EDGE_SIGNATURE: 'true',
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

const SESSION = '/api/v1/admin/session';

function signed(method: string, path: string, options: { at?: number; secret?: string } = {}) {
  const at = String(options.at ?? Date.now());
  return {
    [CLIENT_IP_HEADER]: '203.0.113.7',
    [CLIENT_IP_AT_HEADER]: at,
    [CLIENT_IP_SIGNATURE_HEADER]: signClientIp(
      options.secret ?? SECRET,
      '203.0.113.7',
      at,
      method,
      path,
    ),
  };
}

async function codeOf(response: Response) {
  return problemDetailsSchema.parse(await response.json()).code;
}

describe('edge signature enforcement (integration)', () => {
  it('keeps the health check reachable for the host probe', async () => {
    expect((await fetch(`${baseUrl}/api/v1/health`)).status).toBe(200);
    expect((await fetch(`${baseUrl}/api/v1/health`, { method: 'HEAD' })).status).toBe(200);
  });

  it('refuses unsigned requests before authentication', async () => {
    const response = await fetch(`${baseUrl}${SESSION}`);
    expect(response.status).toBe(403);
    expect(response.headers.get('content-type')).toContain('application/problem+json');
    expect(await codeOf(response)).toBe('EDGE_SIGNATURE_REQUIRED');
    // Sign-in too: a direct client cannot even try credentials against the API host.
    const login = await fetch(`${baseUrl}/api/v1/staff/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'someone', password: 'not a real password 000' }),
    });
    expect(login.status).toBe(403);
    expect(await codeOf(login)).toBe('EDGE_SIGNATURE_REQUIRED');
  });

  it('lets a valid signature through to the normal authentication (still required)', async () => {
    const response = await fetch(`${baseUrl}${SESSION}`, { headers: signed('GET', SESSION) });
    expect(response.status).toBe(401);
    expect(await codeOf(response)).toBe('AUTHENTICATION_REQUIRED');
  });

  it('refuses stale, forged, re-targeted and re-methoded signatures', async () => {
    const cases = [
      signed('GET', SESSION, { at: Date.now() - CLIENT_IP_MAX_SKEW_MS - 5_000 }),
      signed('GET', SESSION, { secret: 'another-secret-of-sufficient-length-0123456789' }),
      signed('GET', '/api/v1/admin/staff'),
      signed('POST', SESSION),
    ];
    for (const headers of cases) {
      const response = await fetch(`${baseUrl}${SESSION}`, { headers });
      expect(response.status).toBe(403);
      expect(await codeOf(response)).toBe('EDGE_SIGNATURE_REQUIRED');
    }
  });
});
