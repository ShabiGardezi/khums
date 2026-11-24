import { redirect } from 'next/navigation';

import type { AdminSessionResponse, ApiClient } from '@khums/api-client';

import { lookupStaffSession, serverStaffApi } from './staff-api';

/**
 * SERVER-ONLY access check for the staff console pages (M4.6.5): a signed-in staff session (a
 * temporary-password session goes to the password change). Pages decide nothing else: the API
 * authorizes every read and command, and navigation by permission is informational only.
 */
export type ConsoleAccess =
  | { readonly kind: 'READY'; readonly api: ApiClient; readonly session: AdminSessionResponse }
  | { readonly kind: 'NOT_ACTIVE' }
  | { readonly kind: 'UNAVAILABLE' };

export async function consoleAccess(
  signInHref: string,
  passwordHref: string,
): Promise<ConsoleAccess> {
  const session = await lookupStaffSession();
  if (session.kind === 'SIGNED_OUT') redirect(signInHref);
  if (session.kind === 'NOT_ACTIVE') return { kind: 'NOT_ACTIVE' };
  if (session.kind === 'UNAVAILABLE') return { kind: 'UNAVAILABLE' };
  if (session.session.mustChangePassword) redirect(passwordHref);
  const client = await serverStaffApi();
  if (client.kind !== 'READY') return { kind: 'UNAVAILABLE' };
  return { kind: 'READY', api: client.api, session: session.session };
}
