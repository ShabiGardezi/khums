/**
 * Signed client IP for staff API requests (M4.6.2b hardening; docs/AUTH_ARCHITECTURE.md §4.10
 * "Client IP"). Runs in `proxy.ts` for every `/api/v1/*` request before the rewrite forwards it.
 *
 * On Vercel the client IP comes from the edge header Vercel overwrites to prevent spoofing
 * (`x-forwarded-for`, configured by `KHUMS_CLIENT_IP_HEADER`). It is sent to the API with an
 * HMAC-SHA256 signature under `STAFF_EDGE_SECRET` over the IP, a timestamp, the method and the
 * path; the API accepts nothing else. Any client-supplied `x-khums-client-ip*` header is removed.
 * Web Crypto only (works in every Next.js runtime).
 */

export const CLIENT_IP_HEADERS = {
  ip: 'x-khums-client-ip',
  at: 'x-khums-client-ip-at',
  signature: 'x-khums-client-ip-sig',
} as const;

/** Must match apps/api `src/auth/client-ip.ts`. */
export const clientIpSigningPayload = (ip: string, at: string, method: string, path: string) =>
  `khums-client-ip/v1\n${ip}\n${at}\n${method.toUpperCase()}\n${path}`;

const base64url = (bytes: ArrayBuffer) =>
  btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

export async function signClientIp(
  secret: string,
  ip: string,
  at: string,
  method: string,
  path: string,
): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const mac = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(clientIpSigningPayload(ip, at, method, path)),
  );
  return base64url(mac);
}

/** IPv4 or IPv6 text (shape only; the API normalizes and validates again). */
const looksLikeIp = (value: string) =>
  /^(\d{1,3}\.){3}\d{1,3}$/.test(value) || (/^[0-9a-fA-F:.]+$/.test(value) && value.includes(':'));

/** The client IP from the configured edge header: its FIRST entry, or null. */
export function edgeClientIp(headers: Headers, headerName: string | undefined): string | null {
  if (headerName === undefined || headerName === '') return null;
  const first = headers.get(headerName)?.split(',')[0]?.trim() ?? '';
  return looksLikeIp(first) ? first : null;
}

export interface EdgeConfig {
  /** `STAFF_EDGE_SECRET` (shared with the API). */
  readonly secret: string | undefined;
  /** `KHUMS_CLIENT_IP_HEADER`: `x-forwarded-for` on Vercel. */
  readonly header: string | undefined;
  /** Running on Vercel (`VERCEL=1`): the configuration is then mandatory. */
  readonly hosted: boolean;
}

export type SignedHeadersResult =
  | { readonly kind: 'FORWARD'; readonly headers: Headers }
  /** Hosted without the required configuration: refuse (fail closed). */
  | { readonly kind: 'MISCONFIGURED' };

export type ClientIpAssertion =
  | { readonly kind: 'SIGNED'; readonly headers: Readonly<Record<string, string>> }
  /** Local development without a configured edge: nothing to add. */
  | { readonly kind: 'NONE' }
  /** Hosted without the required configuration: refuse (fail closed). */
  | { readonly kind: 'MISCONFIGURED' };

/**
 * The signed client-IP headers for one API request (method and exact path). Used by `proxy.ts`
 * for browser requests and by the server staff client for Server Components (M4.7: the API then
 * refuses anything unsigned).
 */
export async function clientIpAssertion(
  incoming: Headers,
  method: string,
  path: string,
  config: EdgeConfig,
  nowMs: number,
): Promise<ClientIpAssertion> {
  const configured = config.secret !== undefined && config.secret.length >= 32;
  if (!configured || config.header === undefined || config.header === '') {
    return config.hosted ? { kind: 'MISCONFIGURED' } : { kind: 'NONE' };
  }
  const ip = edgeClientIp(incoming, config.header);
  if (ip === null) return config.hosted ? { kind: 'MISCONFIGURED' } : { kind: 'NONE' };
  const at = String(nowMs);
  return {
    kind: 'SIGNED',
    headers: {
      [CLIENT_IP_HEADERS.ip]: ip,
      [CLIENT_IP_HEADERS.at]: at,
      [CLIENT_IP_HEADERS.signature]: await signClientIp(config.secret, ip, at, method, path),
    },
  };
}

/** The request headers to forward to the API for one `/api/v1/*` request. */
export async function apiRequestHeaders(
  incoming: Headers,
  method: string,
  path: string,
  config: EdgeConfig,
  nowMs: number,
): Promise<SignedHeadersResult> {
  const headers = new Headers(incoming);
  for (const name of Object.values(CLIENT_IP_HEADERS)) headers.delete(name);
  const assertion = await clientIpAssertion(incoming, method, path, config, nowMs);
  if (assertion.kind === 'MISCONFIGURED') return { kind: 'MISCONFIGURED' };
  if (assertion.kind === 'SIGNED') {
    for (const [name, value] of Object.entries(assertion.headers)) headers.set(name, value);
  }
  return { kind: 'FORWARD', headers };
}

/** The edge configuration of this process (server-side only). */
export const edgeConfig = (
  env: Readonly<Record<string, string | undefined>> = process.env,
): EdgeConfig => ({
  secret: env.STAFF_EDGE_SECRET,
  header: env.KHUMS_CLIENT_IP_HEADER,
  hosted: env.VERCEL === '1',
});
