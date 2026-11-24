import type { IncomingMessage } from 'node:http';

import type { NestExpressApplication } from '@nestjs/platform-express';
import { SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';

import type { AppConfig } from '../../config';
import { createOpenApiDocument } from '../openapi/create-openapi-document';
import {
  API_PREFIX,
  DOCS_PATH,
  EVIDENCE_JSON_BODY_LIMIT,
  EVIDENCE_UPLOAD_PATH,
  JSON_BODY_LIMIT,
} from './constants';

/** True only for a JSON evidence upload (the single route with the larger body limit). */
const isEvidenceUpload = (req: IncomingMessage) =>
  req.method === 'POST' &&
  (req.url ?? '').split('?')[0] === EVIDENCE_UPLOAD_PATH &&
  (req.headers['content-type'] ?? '').toLowerCase().startsWith('application/json');

/**
 * HTTP-level setup shared by main.ts, the OpenAPI generator and integration tests, so they
 * all exercise exactly the same configuration.
 */
export function configureApp(app: NestExpressApplication, config: AppConfig): void {
  app.set('trust proxy', config.trustProxy);
  app.disable('x-powered-by');
  // Registered first: parses evidence uploads with their own limit; the general parser below then
  // skips the already-parsed body. Every other request keeps the 100 kB limit.
  app.useBodyParser('json', { limit: EVIDENCE_JSON_BODY_LIMIT, type: isEvidenceUpload });
  app.useBodyParser('json', { limit: JSON_BODY_LIMIT });
  app.setGlobalPrefix(API_PREFIX);

  // Strict headers for a JSON API: nothing may be framed, scripted or embedded.
  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: false,
        directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] },
      },
      crossOriginResourcePolicy: { policy: 'same-site' },
    }),
  );

  if (config.cors.origins.length > 0) {
    app.enableCors({
      origin: [...config.cors.origins],
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['content-type', 'authorization', 'x-request-id'],
      exposedHeaders: ['x-request-id'],
      maxAge: 600,
    });
  }

  if (config.swagger.enabled) {
    // Swagger UI needs its own (still restrictive) CSP to load its scripts and styles.
    app.use(
      `/${DOCS_PATH}`,
      helmet({
        contentSecurityPolicy: {
          useDefaults: false,
          directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", 'data:'],
            frameAncestors: ["'none'"],
          },
        },
      }),
    );
    SwaggerModule.setup(DOCS_PATH, app, () => createOpenApiDocument(app), {
      jsonDocumentUrl: `${DOCS_PATH}/openapi.json`,
    });
  }

  app.enableShutdownHooks();
}
