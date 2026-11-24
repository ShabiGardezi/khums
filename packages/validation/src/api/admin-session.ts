import { z } from 'zod';

import { GOVERNANCE_ROLES } from '../auth/authorization';

/**
 * `GET /api/v1/admin/session`: the signed-in staff member's own server-side principal (M4.6.2b).
 * Lets the admin console show who the API recognises and with which roles. Contains no session
 * ids, CSRF tokens, password data or emails. Informational only: every action is authorized again
 * by the API.
 */
export const adminSessionResponseSchema = z
  .object({
    principalId: z.string(),
    username: z.string(),
    accountStatus: z.enum(['INVITED', 'ACTIVE', 'SUSPENDED', 'DEACTIVATED']),
    roles: z.array(
      z.object({
        role: z.enum(GOVERNANCE_ROLES),
        scope: z.object({ kind: z.enum(['ALL', 'MARJA']), marjaIds: z.array(z.string()) }),
      }),
    ),
    /** Effective permissions across all scopes (informational). */
    permissions: z.array(z.string()),
    authentication: z.object({
      assurance: z.enum(['AAL1', 'AAL2', 'AAL3']),
      methods: z.array(z.enum(['PASSKEY', 'SECURITY_KEY', 'TOTP', 'PASSWORD', 'FEDERATED'])),
      authenticatedAt: z.iso.datetime(),
    }),
    /** True while signed in with a temporary password: only a password change is allowed. */
    mustChangePassword: z.boolean(),
    /** When the session ends (idle or absolute limit, whichever is first). */
    sessionExpiresAt: z.iso.datetime(),
  })
  .meta({ id: 'AdminSessionResponse', title: 'AdminSessionResponse' });

export type AdminSessionResponse = z.infer<typeof adminSessionResponseSchema>;
