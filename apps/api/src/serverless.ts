import 'reflect-metadata';

import type { IncomingMessage, ServerResponse } from 'node:http';

import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Logger } from 'nestjs-pino';

import { API_ERROR_CODES } from '@khums/validation';

import { AppModule } from './app.module';
import {
  hasBackupKey,
  hasCheckpointSigningKey,
  hasEvidenceRotationKey,
  loadConfig,
} from './config';
import { configureApp } from './shared/http/configure-app';

/**
 * Vercel Functions entry (decision 84): the same Nest application as `main.ts`, without
 * `listen()`. Built once per warm instance and reused, so the MongoDB pool is shared between
 * invocations. Operator commands never run here (they stay on the maintainer's machine), the
 * environment comes only from the host (no `.env` file), and the API refuses to serve when a
 * maintainer-only key is present, exactly as `main.ts` does.
 */

type Handler = (request: IncomingMessage, response: ServerResponse) => void;

let instance: Promise<Handler> | null = null;

async function create(): Promise<Handler> {
  for (const [present, name] of [
    [hasBackupKey(process.env), 'KHUMS_BACKUP_KEY'],
    [hasEvidenceRotationKey(process.env), 'KHUMS_EVIDENCE_NEW_KEY'],
    [hasCheckpointSigningKey(process.env), 'AUDIT_CHECKPOINT_SIGNING_KEY'],
  ] as const) {
    if (present)
      throw new Error(`Refusing to start: ${name} must not be present in the API runtime.`);
  }
  const config = loadConfig(process.env);
  if (!config.ok) throw new Error(`Invalid API configuration: ${config.error.join('; ')}`);
  const app = await NestFactory.create<NestExpressApplication>(AppModule.register(config.value), {
    bufferLogs: true,
  });
  app.useLogger(app.get(Logger));
  configureApp(app, config.value);
  await app.init();
  return app.getHttpAdapter().getInstance() as Handler;
}

export default async function handler(
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  instance ??= create().catch((error: unknown) => {
    // A failed start is retried on the next request, never cached.
    instance = null;
    throw error;
  });
  let app: Handler;
  try {
    app = await instance;
  } catch (error: unknown) {
    // Configuration problems are reported in the host's log only (no details in the response).
    process.stderr.write(
      `API start failed: ${error instanceof Error ? error.message : 'unknown'}\n`,
    );
    response.statusCode = 503;
    response.setHeader('content-type', 'application/problem+json');
    response.end(
      JSON.stringify({
        type: 'about:blank',
        title: 'Service Unavailable',
        status: 503,
        code: API_ERROR_CODES.SERVICE_UNAVAILABLE,
      }),
    );
    return;
  }
  app(request, response);
}
