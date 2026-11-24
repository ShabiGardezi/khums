/**
 * The API origin the rewrite and server calls use (`KHUMS_API_ORIGIN`, server-side only). Local
 * development defaults to http://localhost:4000; production requires an explicit https origin (or a
 * loopback one). Next.js evaluates rewrites at BUILD time: set it when building as well.
 * No Next.js imports: `next.config.ts` uses it for the rewrite.
 */
export function apiOrigin(
  env: Readonly<Record<string, string | undefined>> = process.env,
): string | null {
  const raw = env.KHUMS_API_ORIGIN;
  if (raw === undefined || raw === '') {
    return env.NODE_ENV === 'production' ? null : 'http://localhost:4000';
  }
  try {
    const url = new URL(raw);
    if (url.origin !== raw) return null;
    // https in production, except a loopback API on the same machine (local production builds
    // and Playwright), which no remote party can reach.
    const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if (env.NODE_ENV === 'production' && url.protocol !== 'https:' && !loopback) return null;
    return url.origin;
  } catch {
    return null;
  }
}
