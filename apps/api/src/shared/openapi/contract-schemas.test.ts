import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import {
  contractComponentSchemas,
  REQUEST_CONTRACTS,
  toOpenApiComponents,
} from './contract-schemas';

describe('OpenAPI compatibility policy', () => {
  it('response schemas allow backward-compatible additive fields', () => {
    const components = contractComponentSchemas();
    expect(JSON.stringify(components.HealthResponse)).not.toContain('"additionalProperties":false');
    expect(JSON.stringify(components.ProblemDetails)).not.toContain('"additionalProperties":false');
    expect(components.HealthResponse).toMatchObject({
      required: ['status', 'service', 'uptimeSeconds', 'timestamp'],
    });
  });

  it('request schemas defined with z.strictObject reject unexpected fields, nested too', () => {
    const exampleRequest = z.strictObject({
      amount: z.string(),
      details: z.strictObject({ note: z.string() }),
    });
    const { ExampleRequest } = toOpenApiComponents(
      { ExampleRequest: exampleRequest },
      'input',
      false,
    );
    expect(ExampleRequest).toMatchObject({
      additionalProperties: false,
      properties: { details: { additionalProperties: false } },
    });
  });

  it('every registered request contract is strict', () => {
    for (const [id, schema] of Object.entries<z.ZodType>(REQUEST_CONTRACTS)) {
      const json = toOpenApiComponents({ [id]: schema }, 'input', false)[id];
      expect(json, id).toMatchObject({ additionalProperties: false });
    }
  });
});
