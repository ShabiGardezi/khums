import { createHmac, timingSafeEqual } from 'node:crypto';
import { isIP } from 'node:net';

/**
 * Trusted client IP for staff sign-in throttling (M4.6.2b hardening; docs/AUTH_ARCHITECTURE.md
 * §4.10 "Client IP").
 *
 * The API NEVER uses `X-Forwarded-For` (or Express `request.ip`) for security decisions: a client
 * that reaches the API host directly can send any value, and hosting load balancers append their
 * own hops. Instead, the web tier (Next.js `proxy.ts`, running on Vercel) takes the client IP from
 * the header Vercel overwrites at its edge, and forwards it with an HMAC signature under the
 * shared `STAFF_EDGE_SECRET`, a timestamp, the method and the path. The API accepts the IP only if
 * the signature verifies and is fresh; otherwise it uses the TCP peer address. A client therefore
 * cannot choose the IP its attempts are counted against.
 */

export const CLIENT_IP_HEADER = 'x-khums-client-ip';
export const CLIENT_IP_AT_HEADER = 'x-khums-client-ip-at';
export const CLIENT_IP_SIGNATURE_HEADER = 'x-khums-client-ip-sig';
/** Signed assertions older or newer than this are refused (replay window). */
export const CLIENT_IP_MAX_SKEW_MS = 30_000;

/** The exact bytes the web tier signs (must match apps/web `src/lib/client-ip-signature.ts`). */
export const clientIpSigningPayload = (ip: string, at: string, method: string, path: string) =>
  `khums-client-ip/v1\n${ip}\n${at}\n${method.toUpperCase()}\n${path}`;

export function signClientIp(
  secret: string,
  ip: string,
  at: string,
  method: string,
  path: string,
): string {
  return createHmac('sha256', secret)
    .update(clientIpSigningPayload(ip, at, method, path), 'utf8')
    .digest('base64url');
}

const single = (value: string | string[] | undefined) => (Array.isArray(value) ? undefined : value);

export type ClientIpSource = 'SIGNED_EDGE' | 'PEER';

export interface ClientIpResult {
  readonly ip: string;
  readonly source: ClientIpSource;
}

/**
 * The client IP to throttle on. `edgeSecret` null means no signed edge is configured (local
 * development): the peer address is used. Invalid, stale or unsigned assertions fall back to the
 * peer address too, so a forged header can never select another user's bucket.
 */
export function resolveClientIp(input: {
  readonly headers: Readonly<Record<string, string | string[] | undefined>>;
  readonly method: string;
  readonly path: string;
  readonly peerAddress: string | undefined;
  readonly edgeSecret: string | null;
  readonly nowMs: number;
}): ClientIpResult {
  const peer = normalizeIp(input.peerAddress ?? '') ?? 'unknown';
  if (input.edgeSecret === null) return { ip: peer, source: 'PEER' };
  const ip = single(input.headers[CLIENT_IP_HEADER]);
  const at = single(input.headers[CLIENT_IP_AT_HEADER]);
  const signature = single(input.headers[CLIENT_IP_SIGNATURE_HEADER]);
  if (ip === undefined || at === undefined || signature === undefined)
    return { ip: peer, source: 'PEER' };
  const normalized = normalizeIp(ip);
  const atMs = /^\d{13}$/.test(at) ? Number(at) : Number.NaN;
  if (
    normalized === null ||
    !Number.isFinite(atMs) ||
    Math.abs(input.nowMs - atMs) > CLIENT_IP_MAX_SKEW_MS
  ) {
    return { ip: peer, source: 'PEER' };
  }
  const expected = Buffer.from(signClientIp(input.edgeSecret, ip, at, input.method, input.path));
  const presented = Buffer.from(signature);
  return expected.length === presented.length && timingSafeEqual(expected, presented)
    ? { ip: normalized, source: 'SIGNED_EDGE' }
    : { ip: peer, source: 'PEER' };
}

/** A canonical IP string (IPv4-mapped IPv6 reduced to IPv4), or null when it is not an IP. */
export function normalizeIp(value: string): string | null {
  const trimmed = value.trim().replace(/^\[|\]$/g, '');
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(trimmed);
  const candidate = mapped?.[1] ?? trimmed;
  const family = isIP(candidate);
  if (family === 4) return candidate;
  if (family === 6) return expandIpv6(candidate).join(':');
  return null;
}

function expandIpv6(value: string): string[] {
  const [head = '', tail] = value.toLowerCase().split('::');
  const left = head === '' ? [] : head.split(':');
  const right = tail === undefined || tail === '' ? [] : tail.split(':');
  const missing = tail === undefined ? 0 : 8 - left.length - right.length;
  return [...left, ...Array<string>(missing).fill('0'), ...right].map((part) =>
    part.padStart(4, '0'),
  );
}

/**
 * Throttle buckets for an address: the client (IPv4 address, or the IPv6 /64 a single subscriber
 * controls) and its network (IPv4 /24, IPv6 /48).
 */
export function addressBuckets(ip: string): { readonly client: string; readonly network: string } {
  const normalized = normalizeIp(ip);
  if (normalized === null) return { client: `other:${ip}`, network: `other:${ip}` };
  if (normalized.includes('.')) {
    return {
      client: `v4:${normalized}`,
      network: `v4net:${normalized.split('.').slice(0, 3).join('.')}`,
    };
  }
  const groups = normalized.split(':');
  return {
    client: `v6:${groups.slice(0, 4).join(':')}`,
    network: `v6net:${groups.slice(0, 3).join(':')}`,
  };
}
