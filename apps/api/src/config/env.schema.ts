import { z } from 'zod';

import { OPERATIONAL_STATES } from '@khums/validation';

/**
 * Runtime environment variables of the API. Internal to the API (not an API contract), so it
 * lives here rather than in @khums/validation. Documented in apps/api/.env.example.
 */
const LOG_LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'] as const;

const isExactOrigin = (value: string): boolean => {
  try {
    const url = new URL(value);
    return (url.protocol === 'http:' || url.protocol === 'https:') && url.origin === value;
  } catch {
    return false;
  }
};

export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    HOST: z.string().min(1).default('0.0.0.0'),
    PORT: z.coerce.number().int().min(1).max(65_535).default(4000),
    CORS_ORIGINS: z
      .string()
      .default('')
      .transform((value) =>
        value
          .split(',')
          .map((origin) => origin.trim())
          .filter((origin) => origin.length > 0),
      )
      .pipe(
        z.array(
          z.string().refine(isExactOrigin, {
            message: 'must be an exact origin such as https://app.example.com (no path or "*")',
          }),
        ),
      ),
    LOG_LEVEL: z.enum(LOG_LEVELS).default('info'),
    LOG_FORMAT: z.enum(['json', 'pretty']).default('json'),
    SWAGGER_ENABLED: z.stringbool().optional(),
    TRUST_PROXY: z.stringbool().default(false),
    MONGODB_URI: z
      .string()
      .regex(/^mongodb(\+srv)?:\/\/\S+$/, 'must be a mongodb:// or mongodb+srv:// URI')
      .optional(),
    /** Database name inside the cluster (M4.6.3a). Not secret. */
    MONGODB_DATABASE: z
      .string()
      .regex(/^[A-Za-z0-9_-]{1,38}$/, 'must be a MongoDB database name (letters, digits, _ -)')
      .default('khums'),
    // Staff authentication (M4.6.2b: username/password, server-side sessions). Staff routes refuse
    // every request (503) when the secret is missing in production; public routes never need it.
    /** Keys the HMAC of sign-in throttle keys (usernames, client IPs). Secret, ≥ 32 characters. */
    STAFF_AUTH_SECRET: z.string().min(32, 'must be at least 32 characters').optional(),
    /**
     * Shared with the web tier, which signs the client IP it takes from Vercel's edge header.
     * Secret, ≥ 32 characters. Required in production (otherwise staff routes stay closed);
     * without it the API throttles on the TCP peer address (local development).
     */
    STAFF_EDGE_SECRET: z.string().min(32, 'must be at least 32 characters').optional(),
    /**
     * M4.7: refuse every request (except the health check) that does not carry a valid, fresh
     * signature from the web tier (`STAFF_EDGE_SECRET`), so the API host's own public URL is
     * useless when reached directly. Required (true) for a production-mode SCHOLAR_REVIEW
     * deployment; needs `STAFF_EDGE_SECRET`.
     */
    KHUMS_REQUIRE_EDGE_SIGNATURE: z.stringbool().default(false),
    /** `__Host-` Secure cookies. Must stay true in production; false only for plain-http dev. */
    STAFF_COOKIE_SECURE: z.stringbool().default(true),
    STAFF_SESSION_IDLE_MINUTES: z.coerce.number().int().min(5).max(120).default(30),
    STAFF_SESSION_ABSOLUTE_HOURS: z.coerce.number().int().min(1).max(24).default(8),
    /**
     * TEST ONLY: path of the fixed Playwright staff fixture (apps/api/test/fixtures/e2e-staff.json),
     * seeded into process memory. Refused in production and together with MONGODB_URI.
     */
    STAFF_E2E_FIXTURE_FILE: z.string().min(1).optional(),
    /**
     * Operational state enforced server-side (M4.5a): DEVELOPMENT | SCHOLAR_REVIEW |
     * PRODUCTION_APPROVED. Unset: DEVELOPMENT in development/test, unconfigured in production
     * (every provisional action is then refused). DEVELOPMENT is refused in production.
     * Decision 65: PRODUCTION_APPROVED serves verified packs publicly AND lets signed-in staff
     * test provisional packs (staff routes only); like SCHOLAR_REVIEW it requires the edge
     * signature in production.
     */
    KHUMS_OPERATIONAL_STATE: z.enum(OPERATIONAL_STATES).optional(),
    /**
     * Evidence storage (M5.3.3): directory for AES-256-GCM evidence files (absolute path). Only
     * for development and maintainer machines whose disk is persistent and backed up. REFUSED in
     * production: the private deployment (Render Free) has an ephemeral filesystem, so no durable
     * evidence provider exists there yet; evidence uploads then answer 503.
     */
    KHUMS_EVIDENCE_DIR: z.string().regex(/^\//, 'must be an absolute path').optional(),
    /** Secret: base64 of exactly 32 random bytes (AES-256 key). Needs KHUMS_EVIDENCE_DIR. */
    KHUMS_EVIDENCE_KEY: z
      .string()
      .refine((value) => {
        try {
          return Buffer.from(value, 'base64').length === 32 && /^[A-Za-z0-9+/]{43}=$/.test(value);
        } catch {
          return false;
        }
      }, 'must be base64 of exactly 32 bytes')
      .optional(),
  })
  .superRefine((env, ctx) => {
    if (env.STAFF_E2E_FIXTURE_FILE !== undefined && env.MONGODB_URI !== undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['STAFF_E2E_FIXTURE_FILE'],
        message: 'is a test-only in-memory fixture and cannot be combined with MONGODB_URI',
      });
    }
    if (env.KHUMS_REQUIRE_EDGE_SIGNATURE && env.STAFF_EDGE_SECRET === undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['KHUMS_REQUIRE_EDGE_SIGNATURE'],
        message: 'needs STAFF_EDGE_SECRET',
      });
    }
    if ((env.KHUMS_EVIDENCE_DIR === undefined) !== (env.KHUMS_EVIDENCE_KEY === undefined)) {
      ctx.addIssue({
        code: 'custom',
        path: ['KHUMS_EVIDENCE_KEY'],
        message: 'KHUMS_EVIDENCE_DIR and KHUMS_EVIDENCE_KEY must be set together',
      });
    }
    if (env.NODE_ENV !== 'production') return;
    if (env.KHUMS_EVIDENCE_DIR !== undefined || env.KHUMS_EVIDENCE_KEY !== undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['KHUMS_EVIDENCE_DIR'],
        message:
          'local evidence storage is not durable on this deployment and is not allowed in production',
      });
    }
    if (env.KHUMS_OPERATIONAL_STATE === 'SCHOLAR_REVIEW' && !env.KHUMS_REQUIRE_EDGE_SIGNATURE) {
      ctx.addIssue({
        code: 'custom',
        path: ['KHUMS_REQUIRE_EDGE_SIGNATURE'],
        message: 'must be true for a private SCHOLAR_REVIEW deployment',
      });
    }
    // Decision 65: the public deployment also hosts staff testing of provisional packs, so its API
    // answers only the signed web tier too (public pages reach it through the web rewrite).
    if (
      env.KHUMS_OPERATIONAL_STATE === 'PRODUCTION_APPROVED' &&
      !env.KHUMS_REQUIRE_EDGE_SIGNATURE
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['KHUMS_REQUIRE_EDGE_SIGNATURE'],
        message: 'must be true for a PRODUCTION_APPROVED deployment (staff testing on it)',
      });
    }
    if (env.KHUMS_OPERATIONAL_STATE === 'DEVELOPMENT') {
      ctx.addIssue({
        code: 'custom',
        path: ['KHUMS_OPERATIONAL_STATE'],
        message: 'DEVELOPMENT is not allowed in production',
      });
    }
    if (env.STAFF_E2E_FIXTURE_FILE !== undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['STAFF_E2E_FIXTURE_FILE'],
        message: 'is test-only and is not allowed in production',
      });
    }
    if (!env.STAFF_COOKIE_SECURE) {
      ctx.addIssue({
        code: 'custom',
        path: ['STAFF_COOKIE_SECURE'],
        message: 'must be true in production',
      });
    }
    if (env.LOG_FORMAT === 'pretty') {
      ctx.addIssue({
        code: 'custom',
        path: ['LOG_FORMAT'],
        message: 'must be "json" in production',
      });
    }
    env.CORS_ORIGINS.forEach((origin, index) => {
      if (!origin.startsWith('https://')) {
        ctx.addIssue({
          code: 'custom',
          path: ['CORS_ORIGINS', index],
          message: 'must use https:// in production',
        });
      }
    });
  });

export type Env = z.infer<typeof envSchema>;
export type LogLevel = (typeof LOG_LEVELS)[number];
