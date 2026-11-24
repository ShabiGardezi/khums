import { createApiClient, type ApiClient, type ApiError } from '@khums/api-client';

import { STAFF_CSRF_COOKIES } from '@/lib/staff-cookies';

/**
 * Browser-side staff API client (M4.6.2b). Same-origin only: requests go to `/api/v1/*` on the web
 * origin, which the rewrite forwards to the API. The CSRF token is read from the readable CSRF
 * cookie and sent as `X-CSRF-Token`; the session cookie itself is HttpOnly and never visible here.
 */
function csrfToken(): string {
  for (const part of document.cookie.split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (name !== undefined && (STAFF_CSRF_COOKIES as readonly string[]).includes(name)) {
      return rest.join('=');
    }
  }
  return '';
}

export function staffBrowserApi(): ApiClient {
  return createApiClient({
    baseUrl: '/api/v1',
    fetch: (url, init) => fetch(url, { ...init, credentials: 'same-origin', cache: 'no-store' }),
    headers: () => ({ 'x-csrf-token': csrfToken() }),
  });
}

/** The problem code of a failed call, or null for network and contract failures. */
export const problemCode = (error: ApiError): string | null =>
  error.kind === 'http' ? error.problem.code : null;

/** A text field's value from form data (files and missing fields read as empty). */
export function formText(data: FormData, name: string): string {
  const value = data.get(name);
  return typeof value === 'string' ? value : '';
}
