import { describe, expect, it } from 'vitest';

import { loadConfig } from './app-config';

describe('loadConfig', () => {
  it('applies safe defaults', () => {
    const result = loadConfig({});
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toMatchObject({
      env: 'development',
      port: 4000,
      cors: { origins: [] },
      logging: { level: 'info', format: 'json' },
      swagger: { enabled: true },
      trustProxy: false,
      mongodb: { uri: undefined, databaseName: 'khums' },
      // Development without a secret gets a random per-process one (never production).
      staffAuth: {
        secureCookies: true,
        sessionIdleMs: 30 * 60_000,
        sessionAbsoluteMs: 8 * 3_600_000,
      },
    });
  });

  it('parses CORS origins and treats empty strings as unset', () => {
    const result = loadConfig({
      CORS_ORIGINS: 'http://localhost:3000, https://app.example.com',
      MONGODB_URI: '',
    });
    expect(result.ok && result.value.cors.origins).toEqual([
      'http://localhost:3000',
      'https://app.example.com',
    ]);
  });

  it.each(['*', 'https://app.example.com/path', 'ftp://example.com', 'not-a-url'])(
    'rejects invalid CORS origin %s',
    (origin) => {
      expect(loadConfig({ CORS_ORIGINS: origin }).ok).toBe(false);
    },
  );

  it('enforces production rules', () => {
    const result = loadConfig({
      NODE_ENV: 'production',
      LOG_FORMAT: 'pretty',
      CORS_ORIGINS: 'http://insecure.example.com',
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toEqual([
      'LOG_FORMAT: must be "json" in production',
      'CORS_ORIGINS.0: must use https:// in production',
    ]);
  });

  it('disables Swagger by default in production', () => {
    const result = loadConfig({ NODE_ENV: 'production' });
    expect(result.ok && result.value.swagger.enabled).toBe(false);
  });

  it('never echoes secret values in error messages', () => {
    const secret = 'postgres://user:SuperSecret@host/db';
    const result = loadConfig({ MONGODB_URI: secret });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.join('\n')).not.toContain('SuperSecret');
  });

  it('rejects invalid ports', () => {
    expect(loadConfig({ PORT: '70000' }).ok).toBe(false);
    expect(loadConfig({ PORT: 'abc' }).ok).toBe(false);
  });

  describe('staff authentication (M4.6.2b)', () => {
    const secret = 's'.repeat(40);
    const prod = {
      NODE_ENV: 'production',
      LOG_FORMAT: 'json',
      CORS_ORIGINS: 'https://app.example.com',
    };

    it('is off (null) in production without STAFF_AUTH_SECRET or STAFF_EDGE_SECRET (fail closed)', () => {
      expect(((r) => r.ok && r.value.staffAuth)(loadConfig(prod))).toBeNull();
      expect(
        ((r) => r.ok && r.value.staffAuth)(loadConfig({ ...prod, STAFF_AUTH_SECRET: secret })),
      ).toBeNull();
    });

    it('reads the secret, cookie and session settings, with origins from CORS_ORIGINS', () => {
      const result = loadConfig({
        ...prod,
        STAFF_AUTH_SECRET: secret,
        STAFF_EDGE_SECRET: `edge-${secret}`,
        STAFF_SESSION_IDLE_MINUTES: '20',
        STAFF_SESSION_ABSOLUTE_HOURS: '4',
      });
      expect(result.ok && result.value.staffAuth).toEqual({
        secret,
        edgeSecret: `edge-${secret}`,
        secureCookies: true,
        sessionIdleMs: 20 * 60_000,
        sessionAbsoluteMs: 4 * 3_600_000,
        allowedOrigins: ['https://app.example.com'],
        e2eFixtureFile: undefined,
      });
    });

    it('uses a random secret per process outside production', () => {
      const a = loadConfig({});
      const b = loadConfig({});
      expect(a.ok && a.value.staffAuth?.secret).toHaveLength(43);
      expect(a.ok && b.ok && a.value.staffAuth?.secret !== b.value.staffAuth?.secret).toBe(true);
    });

    it('refuses short secrets, insecure cookies in production and out-of-range sessions', () => {
      expect(loadConfig({ STAFF_AUTH_SECRET: 'short' }).ok).toBe(false);
      expect(
        loadConfig({ ...prod, STAFF_AUTH_SECRET: secret, STAFF_COOKIE_SECURE: 'false' }).ok,
      ).toBe(false);
      expect(loadConfig({ STAFF_COOKIE_SECURE: 'false' }).ok).toBe(true);
      expect(loadConfig({ STAFF_SESSION_IDLE_MINUTES: '1' }).ok).toBe(false);
      expect(loadConfig({ STAFF_SESSION_ABSOLUTE_HOURS: '48' }).ok).toBe(false);
    });

    it('refuses the test-only e2e fixture in production and with a database', () => {
      const inProd = loadConfig({
        ...prod,
        STAFF_AUTH_SECRET: secret,
        STAFF_E2E_FIXTURE_FILE: 'x.json',
      });
      expect(inProd.ok).toBe(false);
      if (!inProd.ok) expect(inProd.error.join('\n')).toContain('STAFF_E2E_FIXTURE_FILE');
      expect(
        loadConfig({ STAFF_E2E_FIXTURE_FILE: 'x.json', MONGODB_URI: 'mongodb://localhost:27017' })
          .ok,
      ).toBe(false);
      expect(loadConfig({ STAFF_E2E_FIXTURE_FILE: 'x.json' }).ok).toBe(true);
    });

    it('ignores the removed Auth0 staff variables (no Auth0 staff path exists)', () => {
      const result = loadConfig({
        AUTH0_DOMAIN: 'dev-tenant.us.auth0.com',
        AUTH_DEV_IDENTITIES_FILE: 'x',
      });
      expect(result.ok && Object.keys(result.value)).not.toContain('auth0');
    });
  });

  describe('operational state (M4.5a)', () => {
    it('defaults to DEVELOPMENT outside production and is unconfigured (null) in production', () => {
      const dev = loadConfig({ NODE_ENV: 'test' });
      expect(dev.ok && dev.value.operationalState).toBe('DEVELOPMENT');
      const prod = loadConfig({ NODE_ENV: 'production' });
      expect(prod.ok && prod.value.operationalState).toBeNull();
    });

    it('reads SCHOLAR_REVIEW and PRODUCTION_APPROVED, refuses unknown values and DEVELOPMENT in production', () => {
      const edge = {
        STAFF_EDGE_SECRET: 'e'.repeat(32),
        KHUMS_REQUIRE_EDGE_SIGNATURE: 'true',
      };
      for (const state of ['SCHOLAR_REVIEW', 'PRODUCTION_APPROVED'] as const) {
        const result = loadConfig({
          NODE_ENV: 'production',
          KHUMS_OPERATIONAL_STATE: state,
          ...edge,
        });
        expect(result.ok && result.value.operationalState).toBe(state);
      }
      expect(loadConfig({ KHUMS_OPERATIONAL_STATE: 'STAGING' }).ok).toBe(false);
      expect(
        loadConfig({ NODE_ENV: 'production', KHUMS_OPERATIONAL_STATE: 'DEVELOPMENT' }),
      ).toEqual({
        ok: false,
        error: ['KHUMS_OPERATIONAL_STATE: DEVELOPMENT is not allowed in production'],
      });
    });
  });

  describe('edge signature requirement (M4.7)', () => {
    const secret = 'e'.repeat(32);
    it('is off by default and reads the shared secret', () => {
      const off = loadConfig({ NODE_ENV: 'test' });
      expect(off.ok && off.value.edgeSignature).toEqual({ required: false, secret: null });
      const on = loadConfig({
        NODE_ENV: 'test',
        STAFF_EDGE_SECRET: secret,
        KHUMS_REQUIRE_EDGE_SIGNATURE: 'true',
      });
      expect(on.ok && on.value.edgeSignature).toEqual({ required: true, secret });
    });

    it('needs the secret, and is mandatory for a production SCHOLAR_REVIEW deployment', () => {
      expect(loadConfig({ NODE_ENV: 'test', KHUMS_REQUIRE_EDGE_SIGNATURE: 'true' })).toEqual({
        ok: false,
        error: ['KHUMS_REQUIRE_EDGE_SIGNATURE: needs STAFF_EDGE_SECRET'],
      });
      expect(
        loadConfig({
          NODE_ENV: 'production',
          KHUMS_OPERATIONAL_STATE: 'SCHOLAR_REVIEW',
          STAFF_EDGE_SECRET: secret,
        }),
      ).toEqual({
        ok: false,
        error: [
          'KHUMS_REQUIRE_EDGE_SIGNATURE: must be true for a private SCHOLAR_REVIEW deployment',
        ],
      });
      // Decision 65: the public deployment hosts staff testing too, so it needs the signature.
      expect(
        loadConfig({
          NODE_ENV: 'production',
          KHUMS_OPERATIONAL_STATE: 'PRODUCTION_APPROVED',
          STAFF_EDGE_SECRET: secret,
        }),
      ).toEqual({
        ok: false,
        error: [
          'KHUMS_REQUIRE_EDGE_SIGNATURE: must be true for a PRODUCTION_APPROVED deployment (staff testing on it)',
        ],
      });
      // Secret values never appear in errors.
      const bad = loadConfig({ NODE_ENV: 'test', KHUMS_REQUIRE_EDGE_SIGNATURE: 'maybe' });
      expect(bad.ok).toBe(false);
    });
  });
});
