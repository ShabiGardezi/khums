import type { NextConfig } from 'next';

import { apiOrigin } from './src/server/staff-api-origin';

/** Baseline security headers. A full CSP is added with the first real feature (docs/SECURITY.md). */
const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Server Function arguments can contain a user's religious preference (their Marja). Never log
  // them (Next 16 logs Server Function invocations by default).
  logging: { serverFunctions: false },
  // Internal packages ship TypeScript source ("just-in-time" packages); Next compiles them.
  transpilePackages: [
    '@khums/api-client',
    '@khums/calculation-engine',
    '@khums/core',
    '@khums/marja-rules',
    '@khums/money',
    '@khums/shared-types',
    '@khums/ui',
    '@khums/utils',
    '@khums/validation',
  ],
  headers() {
    return Promise.resolve([{ source: '/:path*', headers: securityHeaders }]);
  },
  /**
   * Staff API transport (M4.6.2b): the browser calls `/api/v1/*` on the web origin and Next.js
   * proxies it unchanged to the API (cookies, Origin, Sec-Fetch-Site and X-CSRF-Token in;
   * Set-Cookie out), so staff cookies are first-party. No logic here: the API authenticates and
   * authorizes. Without a valid `KHUMS_API_ORIGIN` in production there is no rewrite (fail closed).
   */
  rewrites() {
    const origin = apiOrigin();
    return Promise.resolve(
      origin === null ? [] : [{ source: '/api/v1/:path*', destination: `${origin}/api/v1/:path*` }],
    );
  },
};

export default nextConfig;
