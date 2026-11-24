import { z } from 'zod';

/**
 * Public (browser-exposed) environment, validated once. Next.js only inlines NEXT_PUBLIC_*
 * variables that are referenced literally, so each one is listed explicitly below.
 */
const publicEnvSchema = z.object({
  NEXT_PUBLIC_SITE_URL: z.url().default('http://localhost:3000'),
  NEXT_PUBLIC_API_BASE_URL: z.url().default('http://localhost:4000/api/v1'),
});

/** Empty strings (e.g. `KEY=` in .env files) count as unset so defaults apply. */
const unsetIfEmpty = (value: string | undefined): string | undefined =>
  value === '' ? undefined : value;

export const publicEnv = publicEnvSchema.parse({
  NEXT_PUBLIC_SITE_URL: unsetIfEmpty(process.env.NEXT_PUBLIC_SITE_URL),
  NEXT_PUBLIC_API_BASE_URL: unsetIfEmpty(process.env.NEXT_PUBLIC_API_BASE_URL),
});
