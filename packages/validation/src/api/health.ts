import { z } from 'zod';

/** `GET /api/v1/health` — liveness probe. Contains no sensitive information. */
export const healthResponseSchema = z
  .object({
    status: z.literal('ok'),
    service: z.literal('khums-api'),
    uptimeSeconds: z.int().nonnegative(),
    timestamp: z.iso.datetime(),
  })
  .meta({ id: 'HealthResponse', title: 'HealthResponse' });

export type HealthResponse = z.infer<typeof healthResponseSchema>;
