import { type NextRequest, NextResponse } from 'next/server';

import { LOCALE_COOKIE } from '@/i18n/config';
import { negotiateLocale } from '@/i18n/negotiate';
import { localizePath, splitLocale } from '@/i18n/paths';
import type { Locale } from '@/i18n/config';
import { apiRequestHeaders, edgeConfig } from '@/lib/client-ip-signature';
import { accessMode, checkStaffSession, CONTINUE_PARAM, WAKE_PARAM } from '@/lib/private-access';
import { STAFF_SESSION_COOKIES } from '@/lib/staff-cookies';
import { apiOrigin } from '@/server/staff-api-origin';

const isAdminPath = (path: string) => path === '/admin' || path.startsWith('/admin/');
const SIGN_IN_PATH = '/admin/sign-in';
const PASSWORD_PATH = '/admin/password';

/**
 * 1. Private deployments (M4.7, `accessMode` = PRIVATE: scholar review, and every hosted deployment
 *    that is not explicitly public): EVERY page except sign-in needs a staff session that the API
 *    confirms on each page request; otherwise the visitor is sent to sign-in. Responses are
 *    `no-store` and `noindex`. Public mode: admin pages (`/{locale}/admin…`) need a staff session
 *    cookie (a convenience redirect; the pages ask the API, which authorizes every action).
 * 2. Locale routing: every page lives under /{locale}. Requests without a locale prefix are
 *    redirected to the user's preferred locale (cookie → Accept-Language → default).
 *
 * 3. `/api/v1/*` (the rewrite to the API, next.config.ts): client-supplied `x-khums-client-ip*`
 *    headers are removed and the client IP from Vercel's edge header is forwarded with an HMAC
 *    signature (lib/client-ip-signature.ts). On Vercel without that configuration, 503.
 *
 * Public pages set no cookies and need no configuration.
 */
export async function proxy(request: NextRequest) {
  const { pathname, search, hash } = request.nextUrl;

  if (pathname.startsWith('/api/v1/')) {
    const result = await apiRequestHeaders(
      request.headers,
      request.method,
      pathname,
      {
        ...edgeConfig(),
      },
      Date.now(),
    );
    if (result.kind === 'MISCONFIGURED') {
      return noStore(new NextResponse('Staff API is not configured.', { status: 503 }));
    }
    return NextResponse.next({ request: { headers: result.headers } });
  }

  const { locale, path } = splitLocale(pathname);
  if (locale !== null) {
    if (accessMode(process.env) === 'PRIVATE') return privateRoute(request, locale, path);
    return isAdminPath(path) ? adminRoute(request, locale, path) : NextResponse.next();
  }

  const negotiated = negotiateLocale({
    cookie: request.cookies.get(LOCALE_COOKIE)?.value,
    acceptLanguage: request.headers.get('accept-language'),
  });
  const url = request.nextUrl.clone();
  url.pathname = localizePath(negotiated, pathname);
  url.search = search;
  url.hash = hash;
  const response = NextResponse.redirect(url);
  response.headers.set('Vary', 'Accept-Language, Cookie');
  return response;
}

const noStore = (response: NextResponse) => {
  response.headers.set('Cache-Control', 'no-store');
  return response;
};

const privateResponse = (response: NextResponse) => {
  response.headers.set('X-Robots-Tag', 'noindex, nofollow');
  return noStore(response);
};

const sessionCookieHeader = (request: NextRequest) =>
  STAFF_SESSION_COOKIES.flatMap((name) => {
    const value = request.cookies.get(name)?.value;
    return value === undefined ? [] : [`${name}=${value}`];
  }).join('; ');

/** The whole-application gate (M4.7). Sign-in is the only page reachable without a session. */
async function privateRoute(
  request: NextRequest,
  locale: Locale,
  path: string,
): Promise<NextResponse> {
  const to = (target: string, query?: Readonly<Record<string, string>>) => {
    const url = new URL(localizePath(locale, target), request.url);
    for (const [name, value] of Object.entries(query ?? {})) url.searchParams.set(name, value);
    return privateResponse(NextResponse.redirect(url));
  };
  if (path === SIGN_IN_PATH) return privateResponse(NextResponse.next());
  const cookie = sessionCookieHeader(request);
  if (cookie === '') return to(SIGN_IN_PATH);
  const session = await checkStaffSession({
    origin: apiOrigin(),
    cookie,
    incoming: request.headers,
    edge: edgeConfig(),
    nowMs: Date.now(),
  });
  switch (session) {
    case 'SIGNED_IN':
      return privateResponse(NextResponse.next());
    case 'MUST_CHANGE_PASSWORD':
      return path === PASSWORD_PATH ? privateResponse(NextResponse.next()) : to(PASSWORD_PATH);
    case 'SIGNED_OUT':
      return to(SIGN_IN_PATH);
    case 'UNAVAILABLE':
      // Possibly asleep (free-tier cold start): the sign-in page wakes it, then continues here.
      return to(SIGN_IN_PATH, {
        [WAKE_PARAM]: '1',
        [CONTINUE_PARAM]: `${request.nextUrl.pathname}${request.nextUrl.search}`,
      });
  }
}

/**
 * Public mode: staff pages need a session cookie (the pages ask the API, which authenticates and
 * authorizes every read and command). Decision 65: on the public deployment staff also test
 * provisional packs here, so staff pages are never cached or indexed.
 */
function adminRoute(request: NextRequest, locale: Locale, path: string): NextResponse {
  const hasSession = STAFF_SESSION_COOKIES.some((name) => request.cookies.has(name));
  if (!hasSession && path !== SIGN_IN_PATH) {
    return privateResponse(
      NextResponse.redirect(new URL(localizePath(locale, SIGN_IN_PATH), request.url)),
    );
  }
  return privateResponse(NextResponse.next());
}

export const config = {
  // Skip Next internals, API routes and files with an extension (icons, images, etc.).
  matcher: ['/api/v1/:path*', '/((?!_next/|api/|.*\\.[\\w]+$).*)'],
};
