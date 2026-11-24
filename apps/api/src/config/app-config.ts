import type { OperationalState } from '@khums/shared-types';
import { err, ok, type Result } from '@khums/utils';

import { randomBytes } from 'node:crypto';

import { envSchema, type Env, type LogLevel } from './env.schema';

/** Typed, validated, immutable configuration. Injected with `@InjectAppConfig()`. */
export interface AppConfig {
  readonly env: 'development' | 'test' | 'production';
  readonly host: string;
  readonly port: number;
  readonly cors: { readonly origins: readonly string[] };
  readonly logging: { readonly level: LogLevel; readonly format: 'json' | 'pretty' };
  readonly swagger: { readonly enabled: boolean };
  readonly trustProxy: boolean;
  /**
   * M4.7: every request except the health check must carry the web tier's valid, fresh signature
   * (`KHUMS_REQUIRE_EDGE_SIGNATURE`). `secret` is `STAFF_EDGE_SECRET`: never logged.
   */
  readonly edgeSignature: { readonly required: boolean; readonly secret: string | null };
  /**
   * MongoDB (M4.6.3a). `uri` contains credentials: never log it. Without it, production stores
   * are unavailable (fail closed) and development/test use process memory.
   */
  readonly mongodb: { readonly uri: string | undefined; readonly databaseName: string };
  /** Staff authentication (M4.6.2b). `null` when not configured: staff routes then fail closed. */
  readonly staffAuth: StaffAuthConfig | null;
  /**
   * Operational state (M4.5a), enforced server-side. `null` = unconfigured (production without
   * `KHUMS_OPERATIONAL_STATE`): every provisional action is refused.
   */
  readonly operationalState: OperationalState | null;
  /**
   * Local encrypted evidence storage (M5.3.3; development and maintainer machines only, never
   * production). `key` is the AES-256 key: secret, never logged. `null`: memory in
   * development/test, unavailable in production.
   */
  readonly evidence: { readonly dir: string; readonly key: Uint8Array } | null;
}

export interface StaffAuthConfig {
  /** HMAC key for throttle keys. Secret: never logged. */
  readonly secret: string;
  /**
   * Verifies the web tier's signed client IP (`STAFF_EDGE_SECRET`). `null` only outside
   * production: then the TCP peer address is used. `X-Forwarded-For` is never trusted.
   */
  readonly edgeSecret: string | null;
  /** `__Host-` prefixed, Secure cookies (always in production). */
  readonly secureCookies: boolean;
  readonly sessionIdleMs: number;
  readonly sessionAbsoluteMs: number;
  /**
   * Exact browser origins allowed to send unsafe staff requests (the web app, through the Vercel
   * rewrite). Taken from `CORS_ORIGINS`; empty means no unsafe staff request is ever accepted.
   */
  readonly allowedOrigins: readonly string[];
  /** TEST ONLY in-memory fixture file for Playwright; never in production. */
  readonly e2eFixtureFile: string | undefined;
}

export const APP_CONFIG = Symbol('APP_CONFIG');

/**
 * Parse configuration from an environment map. Empty strings count as "unset".
 * Error messages name the variable and the rule only — never the (possibly secret) value.
 */
export function loadConfig(
  source: Readonly<Record<string, string | undefined>>,
): Result<AppConfig, string[]> {
  const cleaned = Object.fromEntries(
    Object.entries(source).filter(([, value]) => value !== undefined && value !== ''),
  );
  const parsed = envSchema.safeParse(cleaned);
  if (!parsed.success) {
    return err(parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`));
  }
  const env = parsed.data;
  return ok(
    Object.freeze({
      env: env.NODE_ENV,
      host: env.HOST,
      port: env.PORT,
      cors: Object.freeze({ origins: Object.freeze([...env.CORS_ORIGINS]) }),
      logging: Object.freeze({ level: env.LOG_LEVEL, format: env.LOG_FORMAT }),
      swagger: Object.freeze({ enabled: env.SWAGGER_ENABLED ?? env.NODE_ENV !== 'production' }),
      trustProxy: env.TRUST_PROXY,
      edgeSignature: Object.freeze({
        required: env.KHUMS_REQUIRE_EDGE_SIGNATURE,
        secret: env.STAFF_EDGE_SECRET ?? null,
      }),
      mongodb: Object.freeze({ uri: env.MONGODB_URI, databaseName: env.MONGODB_DATABASE }),
      staffAuth: staffAuthConfig(env),
      operationalState:
        env.KHUMS_OPERATIONAL_STATE ?? (env.NODE_ENV === 'production' ? null : 'DEVELOPMENT'),
      evidence:
        env.KHUMS_EVIDENCE_DIR === undefined || env.KHUMS_EVIDENCE_KEY === undefined
          ? null
          : Object.freeze({
              dir: env.KHUMS_EVIDENCE_DIR,
              key: new Uint8Array(Buffer.from(env.KHUMS_EVIDENCE_KEY, 'base64')),
            }),
    }),
  );
}

/**
 * Production needs `STAFF_AUTH_SECRET` and `STAFF_EDGE_SECRET` (otherwise staff routes refuse
 * everything). Development and
 * test use a random per-process secret when none is set (throttle keys then reset on restart).
 */
function staffAuthConfig(env: Env): StaffAuthConfig | null {
  const production = env.NODE_ENV === 'production';
  const secret =
    env.STAFF_AUTH_SECRET ?? (production ? null : randomBytes(32).toString('base64url'));
  if (secret === null) return null;
  // Production must know the real client IP (signed by the web tier); otherwise fail closed.
  if (production && env.STAFF_EDGE_SECRET === undefined) return null;
  return Object.freeze({
    secret,
    edgeSecret: env.STAFF_EDGE_SECRET ?? null,
    secureCookies: env.STAFF_COOKIE_SECURE,
    sessionIdleMs: env.STAFF_SESSION_IDLE_MINUTES * 60_000,
    sessionAbsoluteMs: env.STAFF_SESSION_ABSOLUTE_HOURS * 3_600_000,
    allowedOrigins: Object.freeze([...env.CORS_ORIGINS]),
    e2eFixtureFile: env.STAFF_E2E_FIXTURE_FILE,
  });
}
