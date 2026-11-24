import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule, type OpenAPIObject } from '@nestjs/swagger';

import { contractComponentSchemas } from './contract-schemas';

type ComponentSchemas = NonNullable<NonNullable<OpenAPIObject['components']>['schemas']>;

/** Builds the OpenAPI 3 document: routes from Nest decorators, schemas from shared Zod contracts. */
export function createOpenApiDocument(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('Khums Platform API')
    .setDescription(
      'Shared REST API for the Khums web, mobile and admin applications. ' +
        'Errors use RFC 9457 Problem Details (application/problem+json).',
    )
    .setVersion('1.0.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description:
          'Staff routes only: an Auth0 access token for the Khums API audience, obtained ' +
          'server-side by the admin web application. Public routes need no credentials.',
      },
      'staff-access-token',
    )
    .build();

  const document = SwaggerModule.createDocument(app, config);
  document.components = {
    ...document.components,
    schemas: {
      ...document.components?.schemas,
      ...(contractComponentSchemas() as ComponentSchemas),
    },
  };
  return document;
}
