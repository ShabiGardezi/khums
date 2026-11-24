import { createHmac } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  apiRequestHeaders,
  CLIENT_IP_HEADERS,
  clientIpSigningPayload,
  edgeClientIp,
} from './client-ip-signature';

/** Web-tier client IP signing (M4.6.2b hardening). Must agree byte for byte with the API. */

const SECRET = 'edge-secret-0123456789abcdef0123456789';
const NOW = Date.parse('2026-11-21T10:00:00.000Z');
const vercel = { secret: SECRET, header: 'x-forwarded-for', hosted: true };

describe('client IP signing in proxy.ts', () => {
  it('signs the first edge address with the same HMAC the API verifies', async () => {
    const incoming = new Headers({ 'x-forwarded-for': '203.0.113.9, 10.0.0.1' });
    const result = await apiRequestHeaders(
      incoming,
      'post',
      '/api/v1/staff/auth/login',
      vercel,
      NOW,
    );
    if (result.kind !== 'FORWARD') throw new Error('expected forward');
    expect(result.headers.get(CLIENT_IP_HEADERS.ip)).toBe('203.0.113.9');
    expect(result.headers.get(CLIENT_IP_HEADERS.at)).toBe(String(NOW));
    const expected = createHmac('sha256', SECRET)
      .update(
        clientIpSigningPayload('203.0.113.9', String(NOW), 'POST', '/api/v1/staff/auth/login'),
      )
      .digest('base64url');
    expect(result.headers.get(CLIENT_IP_HEADERS.signature)).toBe(expected);
  });

  it('removes client-supplied x-khums-client-ip headers before anything else', async () => {
    const forged = new Headers({
      [CLIENT_IP_HEADERS.ip]: '198.51.100.1',
      [CLIENT_IP_HEADERS.at]: String(NOW),
      [CLIENT_IP_HEADERS.signature]: 'forged',
    });
    const local = await apiRequestHeaders(
      forged,
      'POST',
      '/api/v1/x',
      { secret: undefined, header: undefined, hosted: false },
      NOW,
    );
    if (local.kind !== 'FORWARD') throw new Error('expected forward');
    for (const name of Object.values(CLIENT_IP_HEADERS)) expect(local.headers.get(name)).toBeNull();
    forged.set('x-forwarded-for', '203.0.113.9');
    const hosted = await apiRequestHeaders(forged, 'POST', '/api/v1/x', vercel, NOW);
    expect(hosted.kind === 'FORWARD' && hosted.headers.get(CLIENT_IP_HEADERS.ip)).toBe(
      '203.0.113.9',
    );
  });

  it('fails closed on Vercel without the secret, the header name or a usable address', async () => {
    const headers = new Headers({ 'x-forwarded-for': '203.0.113.9' });
    expect(
      (await apiRequestHeaders(headers, 'GET', '/api/v1/x', { ...vercel, secret: undefined }, NOW))
        .kind,
    ).toBe('MISCONFIGURED');
    expect(
      (await apiRequestHeaders(headers, 'GET', '/api/v1/x', { ...vercel, secret: 'short' }, NOW))
        .kind,
    ).toBe('MISCONFIGURED');
    expect(
      (await apiRequestHeaders(headers, 'GET', '/api/v1/x', { ...vercel, header: undefined }, NOW))
        .kind,
    ).toBe('MISCONFIGURED');
    expect((await apiRequestHeaders(new Headers(), 'GET', '/api/v1/x', vercel, NOW)).kind).toBe(
      'MISCONFIGURED',
    );
  });

  it('reads only well-formed addresses', () => {
    expect(edgeClientIp(new Headers({ 'x-forwarded-for': 'evil' }), 'x-forwarded-for')).toBeNull();
    expect(edgeClientIp(new Headers({ 'x-forwarded-for': '2001:db8::1' }), 'x-forwarded-for')).toBe(
      '2001:db8::1',
    );
    expect(edgeClientIp(new Headers({ 'x-forwarded-for': '203.0.113.9' }), undefined)).toBeNull();
  });
});
