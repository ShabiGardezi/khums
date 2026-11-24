import { z } from 'zod';

import { GOVERNANCE_ROLES, GRANTABLE_STAFF_ROLES, roleScopeSchema } from '../auth/authorization';

/**
 * Staff account administration by a SUPER_ADMIN (M4.6.2b; docs/AUTH_ARCHITECTURE.md §4.10):
 * create accounts with a temporary password, reset passwords, suspend or reactivate, grant and
 * revoke roles with Marja scopes, revoke sessions and clear sign-in throttles. Every change needs a
 * reason and is audited. Only `SUPER_ADMIN` and `SCHOLAR` can be granted (decision 64); legacy
 * roles stay readable in responses. Rules (no self-administration, catalogue Marja scopes, no
 * last-SUPER_ADMIN lockout) are decided by `@khums/core`.
 */

const principalId = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
const reason = z.string().trim().min(3).max(500);

export const staffAccountParamsSchema = z
  .strictObject({ principalId })
  .meta({ id: 'StaffAccountParams', title: 'StaffAccountParams' });

export const staffRoleParamsSchema = z
  .strictObject({ principalId, assignmentId: principalId })
  .meta({ id: 'StaffRoleParams', title: 'StaffRoleParams' });

export const staffAccountSchema = z
  .object({
    principalId: z.string(),
    username: z.string(),
    status: z.enum(['INVITED', 'ACTIVE', 'SUSPENDED', 'DEACTIVATED']),
    mustChangePassword: z.boolean(),
    temporaryPasswordExpiresAt: z.iso.datetime().nullable(),
    createdAt: z.iso.datetime(),
    roles: z.array(
      z.object({
        assignmentId: z.string(),
        role: z.enum(GOVERNANCE_ROLES),
        scope: z.object({ kind: z.enum(['ALL', 'MARJA']), marjaIds: z.array(z.string()) }),
        grantedBy: z.string(),
        grantedAt: z.iso.datetime(),
      }),
    ),
  })
  .meta({ id: 'StaffAccount', title: 'StaffAccount' });

export const staffAccountListResponseSchema = z
  .object({ accounts: z.array(staffAccountSchema) })
  .meta({ id: 'StaffAccountListResponse', title: 'StaffAccountListResponse' });

export const createStaffAccountRequestSchema = z
  .strictObject({ username: z.string().min(1).max(200), reason })
  .meta({ id: 'CreateStaffAccountRequest', title: 'CreateStaffAccountRequest' });

export const staffAdministrationReasonRequestSchema = z
  .strictObject({ reason })
  .meta({ id: 'StaffAdministrationReasonRequest', title: 'StaffAdministrationReasonRequest' });

export const setStaffAccountStatusRequestSchema = z
  .strictObject({ status: z.enum(['ACTIVE', 'SUSPENDED', 'DEACTIVATED']), reason })
  .meta({ id: 'SetStaffAccountStatusRequest', title: 'SetStaffAccountStatusRequest' });

export const grantStaffRoleRequestSchema = z
  .strictObject({ role: z.enum(GRANTABLE_STAFF_ROLES), scope: roleScopeSchema, reason })
  .meta({ id: 'GrantStaffRoleRequest', title: 'GrantStaffRoleRequest' });

/**
 * Replaces one held role assignment in ONE audited unit of work: the assignment is revoked and the
 * given grantable role is granted with the given scope (decision 64). Used to change a scholar's
 * Marjas and to convert a legacy role to `SCHOLAR` or `SUPER_ADMIN`.
 */
export const replaceStaffRoleRequestSchema = z
  .strictObject({ role: z.enum(GRANTABLE_STAFF_ROLES), scope: roleScopeSchema, reason })
  .meta({ id: 'ReplaceStaffRoleRequest', title: 'ReplaceStaffRoleRequest' });

/**
 * A new temporary password, shown ONCE to the administrator (never stored in plain text, never
 * logged). It expires after 72 hours and allows only the password change; it can never become the
 * permanent password. Responses carrying it are sent with `Cache-Control: no-store`.
 */
export const temporaryCredentialResponseSchema = z
  .object({
    principalId: z.string(),
    username: z.string(),
    temporaryPassword: z.string(),
    temporaryPasswordExpiresAt: z.iso.datetime(),
  })
  .meta({ id: 'TemporaryCredentialResponse', title: 'TemporaryCredentialResponse' });

export type StaffAccount = z.infer<typeof staffAccountSchema>;
export type StaffAccountListResponse = z.infer<typeof staffAccountListResponseSchema>;
export type CreateStaffAccountRequest = z.infer<typeof createStaffAccountRequestSchema>;
export type SetStaffAccountStatusRequest = z.infer<typeof setStaffAccountStatusRequestSchema>;
export type GrantStaffRoleRequest = z.infer<typeof grantStaffRoleRequestSchema>;
export type ReplaceStaffRoleRequest = z.infer<typeof replaceStaffRoleRequestSchema>;
export type TemporaryCredentialResponse = z.infer<typeof temporaryCredentialResponseSchema>;
