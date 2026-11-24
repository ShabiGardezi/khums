import 'reflect-metadata';

import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * Decision 84: the Vercel Functions entry serves the same application as `main.ts` (in-memory
 * test database here), and fails closed — 503 with no details — on bad configuration or when a
 * maintainer-only key is present in the runtime.
 */

const ENV = {
  NODE_ENV: 'test',
  LOG_LEVEL: 'silent',
  CORS_ORIGINS: 'https://web.khums.test',
  STAFF_AUTH_SECRET: 'serverless-test-secret-0123456789abcdef',
  STAFF_EDGE_SECRET: 'serverless-edge-secret-0123456789abcdef',
  KHUMS_OPERATIONAL_STATE: 'SCHOLAR_REVIEW',
};

let server: Server | null = null;

async function serve(env: Record<string, string>) {
  vi.resetModules();
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
  const { default: handler } = await import('../src/serverless');
  server = createServer((req, res) => {
    void handler(req, res);
  });
  await new Promise<void>((resolve) => server?.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return (path: string) => fetch(`http://127.0.0.1:${String(port)}${path}`);
}

afterEach(async () => {
  vi.unstubAllEnvs();
  await new Promise<void>((resolve) => {
    if (server === null) resolve();
    else
      server.close(() => {
        resolve();
      });
  });
  server = null;
});

describe('serverless entry (decision 84)', () => {
  it('answers like the long-running server, reusing one application', async () => {
    const get = await serve(ENV);
    const first = await get('/api/v1/health');
    expect(first.status).toBe(200);
    expect((await get('/api/v1/health')).status).toBe(200);
    expect((await get('/api/v1/no-such-route')).status).toBe(404);
  }, 60_000);

  it('fails closed with 503 and no details on invalid configuration', async () => {
    const get = await serve({ ...ENV, KHUMS_OPERATIONAL_STATE: 'NOT_A_STATE' });
    const response = await get('/api/v1/health');
    expect(response.status).toBe(503);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body).toEqual({
      type: 'about:blank',
      title: 'Service Unavailable',
      status: 503,
      code: 'SERVICE_UNAVAILABLE',
    });
  }, 60_000);

  it('refuses to serve when a maintainer-only key is present', async () => {
    const get = await serve({ ...ENV, AUDIT_CHECKPOINT_SIGNING_KEY: 'x'.repeat(64) });
    expect((await get('/api/v1/health')).status).toBe(503);
  }, 60_000);
});
