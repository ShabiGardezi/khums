import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';

import { healthResponseSchema } from '@khums/validation';

import { HealthController } from './health.controller';

describe('HealthController', () => {
  it('returns a payload that satisfies the shared contract', async () => {
    const moduleRef = await Test.createTestingModule({ controllers: [HealthController] }).compile();
    const response = moduleRef.get(HealthController).check();

    expect(healthResponseSchema.safeParse(response).success).toBe(true);
    expect(response.status).toBe('ok');
  });
});
