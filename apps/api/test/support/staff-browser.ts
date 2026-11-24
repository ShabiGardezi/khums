import {
  CLIENT_IP_AT_HEADER,
  CLIENT_IP_HEADER,
  CLIENT_IP_SIGNATURE_HEADER,
  signClientIp,
} from '../../src/auth/client-ip';

/**
 * A simulated browser for staff HTTP tests (M4.6.2b; shared with the governance tests in M4.6.4a):
 * a cookie jar, the web origin, fetch metadata, the CSRF header read from the readable cookie, and
 * the client-IP headers the web tier signs.
 */
export interface StaffBrowserSettings {
  /** The API base URL (read lazily: tests start the app in `beforeAll`). */
  readonly url: () => string;
  readonly web: string;
  /** Shared with the (simulated) web tier, which signs the client IP it got from Vercel's edge. */
  readonly edgeSecret: string;
}

export interface StaffCall {
  readonly body?: unknown;
  readonly origin?: string | null;
  readonly fetchSite?: string | null;
  readonly csrf?: string | null;
  readonly ip?: string;
  /** Sign the client IP as the web tier does (default) or send it unsigned / with a bad key. */
  readonly ipMode?: 'signed' | 'unsigned' | 'wrong-key' | 'stale' | 'other-path';
  readonly extraHeaders?: Record<string, string>;
}

export function staffBrowserClass(settings: StaffBrowserSettings) {
  const WEB = settings.web;
  const EDGE_SECRET = settings.edgeSecret;
  const urlOf = settings.url;

  /** What the web tier's proxy.ts adds to every /api/v1 request it forwards. */
  function edgeHeaders(ip: string, method: string, path: string, mode: StaffCall['ipMode']) {
    const now = Date.now();
    const at = String(mode === 'stale' ? now - 120_000 : now);
    const key = mode === 'wrong-key' ? 'attacker-guess-of-the-edge-secret-000000' : EDGE_SECRET;
    const signedPath = mode === 'other-path' ? '/api/v1/admin/session' : `/api/v1${path}`;
    return {
      [CLIENT_IP_HEADER]: ip,
      [CLIENT_IP_AT_HEADER]: at,
      [CLIENT_IP_SIGNATURE_HEADER]: signClientIp(key, ip, at, method, signedPath),
    };
  }

  /** A browser: a cookie jar, the web origin, and the CSRF header read from the readable cookie. */
  class Browser {
    readonly jar = new Map<string, string>();
    constructor(readonly ip = '203.0.113.10') {}

    get csrf(): string | undefined {
      return this.jar.get('__Host-khums_csrf');
    }

    async call(method: string, path: string, options: StaffCall = {}) {
      const ip = options.ip ?? this.ip;
      const mode = options.ipMode ?? 'signed';
      const headers: Record<string, string> = {
        // Always present and always ignored by the staff code (clients can forge it).
        'x-forwarded-for': ip,
        ...(mode === 'unsigned' ? { [CLIENT_IP_HEADER]: ip } : edgeHeaders(ip, method, path, mode)),
        ...options.extraHeaders,
      };
      if (this.jar.size > 0) headers.cookie = [...this.jar].map(([k, v]) => `${k}=${v}`).join('; ');
      if (options.origin !== null) headers.origin = options.origin ?? WEB;
      if (options.fetchSite !== null)
        headers['sec-fetch-site'] = options.fetchSite ?? 'same-origin';
      const csrf = options.csrf === undefined ? this.csrf : options.csrf;
      if (csrf !== null && csrf !== undefined && method !== 'GET') headers['x-csrf-token'] = csrf;
      if (options.body !== undefined) headers['content-type'] = 'application/json';
      const response = await fetch(`${urlOf()}/api/v1${path}`, {
        method,
        headers,
        ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
      });
      const setCookies = response.headers.getSetCookie();
      for (const cookie of setCookies) {
        const [pair] = cookie.split(';');
        const [name, value] = (pair ?? '').split('=');
        if (name === undefined) continue;
        if (
          value === undefined ||
          value === '' ||
          /Max-Age=0|Expires=Thu, 01 Jan 1970/i.test(cookie)
        )
          this.jar.delete(name);
        else this.jar.set(name, value);
      }
      const text = await response.text();
      return {
        status: response.status,
        headers: response.headers,
        setCookies,
        json: text === '' ? null : (JSON.parse(text) as unknown),
      };
    }

    login(username: string, password: string, options: StaffCall = {}) {
      return this.call('POST', '/staff/auth/login', { body: { username, password }, ...options });
    }
  }

  return Browser;
}
