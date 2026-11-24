import type { CookieOptions, Response } from 'express';

import type { StaffAuthConfig } from '../config/app-config';
import { DEVICE_COOKIE_LIFETIME_MS } from './device-cookie';

/**
 * Staff cookies (M4.6.2b). The session cookie is HttpOnly; the CSRF cookie is readable by the web
 * page (so it can send the token header) but useless alone: the API compares the header with the
 * hash bound to the session. Both are first-party to the web origin (the API is reached through
 * the Vercel rewrite), SameSite=Strict, Path=/, no Domain, and `__Host-`/Secure in production.
 */

export interface StaffCookieNames {
  readonly session: string;
  readonly csrf: string;
  readonly device: string;
}

export const cookieNames = (config: Pick<StaffAuthConfig, 'secureCookies'>): StaffCookieNames =>
  config.secureCookies
    ? { session: '__Host-khums_staff', csrf: '__Host-khums_csrf', device: '__Host-khums_device' }
    : { session: 'khums_staff', csrf: 'khums_csrf', device: 'khums_device' };

const base = (config: Pick<StaffAuthConfig, 'secureCookies'>): CookieOptions => ({
  secure: config.secureCookies,
  sameSite: 'strict',
  path: '/',
});

export function setStaffCookies(
  response: Response,
  config: Pick<StaffAuthConfig, 'secureCookies'>,
  values: {
    readonly sessionToken: string;
    readonly csrfToken: string;
    readonly maxAgeMs: number;
    readonly deviceCookie: string;
  },
): void {
  const names = cookieNames(config);
  // Survives sign-out on purpose: it only exempts this browser from other clients' failures.
  response.cookie(names.device, values.deviceCookie, {
    ...base(config),
    httpOnly: true,
    maxAge: DEVICE_COOKIE_LIFETIME_MS,
  });
  response.cookie(names.session, values.sessionToken, {
    ...base(config),
    httpOnly: true,
    maxAge: values.maxAgeMs,
  });
  response.cookie(names.csrf, values.csrfToken, {
    ...base(config),
    httpOnly: false,
    maxAge: values.maxAgeMs,
  });
}

export function clearStaffCookies(
  response: Response,
  config: Pick<StaffAuthConfig, 'secureCookies'>,
): void {
  const names = cookieNames(config);
  response.clearCookie(names.session, { ...base(config), httpOnly: true });
  response.clearCookie(names.csrf, { ...base(config), httpOnly: false });
}

/** Reads one cookie from the raw `Cookie` header (first occurrence; values are opaque tokens). */
export function readCookie(header: string | undefined, name: string): string | undefined {
  if (header === undefined) return undefined;
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index === -1) continue;
    if (part.slice(0, index).trim() === name) {
      const value = part.slice(index + 1).trim();
      return /^[A-Za-z0-9._-]{20,300}$/.test(value) ? value : undefined;
    }
  }
  return undefined;
}
