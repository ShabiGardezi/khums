import { defineConfig, devices } from '@playwright/test';

/**
 * Verification against a REAL deployment (M4.6.2b hardening; docs/DEPLOYMENT_VERIFICATION.md).
 * Never part of CI or `pnpm check`. Run by the maintainer from their own terminal:
 *
 *   STAFF_VERIFY_BASE_URL=https://<deployment> STAFF_VERIFY_ADMIN_USERNAME=… \
 *   STAFF_VERIFY_ADMIN_PASSWORD=… pnpm --filter @khums/web test:deployed
 *
 * Credentials come only from the environment of the person running it; nothing is stored.
 * `VERCEL_AUTOMATION_BYPASS_SECRET` (optional) passes Vercel Deployment Protection.
 */
const baseURL = process.env.STAFF_VERIFY_BASE_URL ?? '';
const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;

export default defineConfig({
  testDir: './e2e-deployed',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL,
    trace: 'off',
    ...(bypass === undefined || bypass === ''
      ? {}
      : {
          extraHTTPHeaders: {
            'x-vercel-protection-bypass': bypass,
            'x-vercel-set-bypass-cookie': 'true',
          },
        }),
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
