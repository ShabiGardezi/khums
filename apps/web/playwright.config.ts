import { fileURLToPath } from 'node:url';

import { defineConfig, devices } from '@playwright/test';

const PORT = 3100;
/** A second web server in SCHOLAR_REVIEW (M4.5.2); the first stays in DEVELOPMENT (mock results). */
const REVIEW_PORT = 3101;
/**
 * Decision 65 (one deployment): a third web server in PRODUCTION_APPROVED with public access —
 * the public calculator with verified packs only, and signed-in staff testing provisional packs.
 */
const PUBLIC_PORT = 3102;
const API_PORT = 4100;
/** Test-only value shared by the e2e web and API servers (not a real secret). */
const E2E_EDGE_SECRET = 'e2e-only-edge-signing-key-not-a-secret-0123456';
const isCI = Boolean(process.env.CI);

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  reporter: isCI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'on-first-retry',
  },
  // Responsive coverage: desktop, tablet (md breakpoint) and a phone. Chromium only (installed in CI).
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
    },
    {
      name: 'tablet',
      use: { ...devices['Desktop Chrome'], viewport: { width: 768, height: 1024 } },
    },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
  // Runs against the production builds (turbo runs `build` before `test:e2e`): the real API with
  // in-memory stores and the TEST ONLY staff fixture, and the web app rewriting /api/v1 to it.
  webServer: [
    {
      // Started from e2e/ so no local .env file is read by the API.
      command: 'node ../../api/dist/main.js',
      cwd: './e2e',
      url: `http://127.0.0.1:${String(API_PORT)}/api/v1/health`,
      reuseExistingServer: !isCI,
      timeout: 60_000,
      env: {
        NODE_ENV: 'test',
        HOST: '127.0.0.1',
        PORT: String(API_PORT),
        LOG_LEVEL: 'silent',
        LOG_FORMAT: 'json',
        // The web origin the browser uses: Origin and the staff CSRF checks are tied to it.
        CORS_ORIGINS: [PORT, REVIEW_PORT, PUBLIC_PORT]
          .map((port) => `http://localhost:${String(port)}`)
          .join(','),
        // Decision 65: the API of the one public deployment. It serves verified packs to the
        // public calculator and lets signed-in staff run the provisional (scholar-review) journeys
        // (enforced here too; the SCHOLAR_REVIEW web server stays whole-site private). The web
        // rewrite target is fixed at build time, so every e2e web server shares this one API.
        KHUMS_OPERATIONAL_STATE: 'PRODUCTION_APPROVED',
        // Never a real database or secret: in-memory stores and a throwaway test secret.
        MONGODB_URI: '',
        STAFF_AUTH_SECRET: 'e2e-only-throttle-key-not-a-secret-0123456789',
        STAFF_EDGE_SECRET: E2E_EDGE_SECRET,
        // M4.7: as on the private deployment, the API answers only the signed web tier (browser
        // requests through proxy.ts and Server Component requests alike).
        KHUMS_REQUIRE_EDGE_SIGNATURE: 'true',
        STAFF_E2E_FIXTURE_FILE: fileURLToPath(
          new URL('../api/test/fixtures/e2e-staff.json', import.meta.url),
        ),
      },
    },
    {
      command: `pnpm start --port ${String(PORT)}`,
      url: `http://localhost:${String(PORT)}`,
      reuseExistingServer: !isCI,
      timeout: 60_000,
      env: {
        // M4.5.1: the results dashboard's development-only mock pack (never on a hosted deployment).
        KHUMS_OPERATIONAL_STATE: 'DEVELOPMENT',
        // M4.6.2b: the /api/v1 rewrite target (read when the server starts).
        KHUMS_API_ORIGIN: `http://127.0.0.1:${String(API_PORT)}`,
        // Client-IP signing as on Vercel. Here Playwright plays Vercel's edge by sending
        // X-Forwarded-For; on Vercel the edge overwrites any client value.
        STAFF_EDGE_SECRET: E2E_EDGE_SECRET,
        KHUMS_CLIENT_IP_HEADER: 'x-forwarded-for',
      },
    },
    {
      // M4.5.2: the same build in SCHOLAR_REVIEW, for the provisional scholar review journeys.
      command: `pnpm start --port ${String(REVIEW_PORT)}`,
      url: `http://localhost:${String(REVIEW_PORT)}`,
      reuseExistingServer: !isCI,
      timeout: 60_000,
      env: {
        KHUMS_OPERATIONAL_STATE: 'SCHOLAR_REVIEW',
        KHUMS_API_ORIGIN: `http://127.0.0.1:${String(API_PORT)}`,
        STAFF_EDGE_SECRET: E2E_EDGE_SECRET,
        KHUMS_CLIENT_IP_HEADER: 'x-forwarded-for',
      },
    },
    {
      // Decision 65: the same build as the public deployment (verified packs only for visitors).
      command: `pnpm start --port ${String(PUBLIC_PORT)}`,
      url: `http://localhost:${String(PUBLIC_PORT)}`,
      reuseExistingServer: !isCI,
      timeout: 60_000,
      env: {
        KHUMS_OPERATIONAL_STATE: 'PRODUCTION_APPROVED',
        KHUMS_PUBLIC_ACCESS: 'enabled',
        KHUMS_API_ORIGIN: `http://127.0.0.1:${String(API_PORT)}`,
        STAFF_EDGE_SECRET: E2E_EDGE_SECRET,
        KHUMS_CLIENT_IP_HEADER: 'x-forwarded-for',
      },
    },
  ],
});
