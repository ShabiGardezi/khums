import { readFile } from 'node:fs/promises';

import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { describe, expect, it } from 'vitest';

import { AppModule } from '../src/app.module';
import { loadConfig } from '../src/config';
import { configureApp } from '../src/shared/http/configure-app';
import { createOpenApiDocument } from '../src/shared/openapi/create-openapi-document';

/**
 * The committed apps/api/openapi.json is the published contract for client generation.
 * This test fails if code and the committed spec drift: run `pnpm --filter @khums/api openapi`.
 */
describe('OpenAPI contract', () => {
  it('matches the committed openapi.json and every $ref resolves', async () => {
    const loaded = loadConfig({ NODE_ENV: 'test', LOG_LEVEL: 'silent' });
    if (!loaded.ok) throw new Error(loaded.error.join('\n'));

    const app = await NestFactory.create<NestExpressApplication>(AppModule.register(loaded.value), {
      logger: false,
    });
    configureApp(app, { ...loaded.value, swagger: { enabled: false } });
    const generated = JSON.parse(JSON.stringify(createOpenApiDocument(app))) as Record<
      string,
      unknown
    >;
    await app.close();

    const committed = JSON.parse(
      await readFile(new URL('../openapi.json', import.meta.url), 'utf8'),
    ) as Record<string, unknown>;
    expect(generated).toEqual(committed);

    const text = JSON.stringify(generated);
    const schemas = (generated.components as { schemas: Record<string, unknown> }).schemas;
    for (const [, id] of text.matchAll(/"#\/components\/schemas\/([^"]+)"/g)) {
      expect(schemas, `unresolved $ref ${id ?? ''}`).toHaveProperty(id ?? '');
    }
  });
});
