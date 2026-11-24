import { z } from 'zod';

/**
 * Staff sign-in, sign-out and password change (M4.6.2b; docs/AUTH_ARCHITECTURE.md §4.10). The
 * session itself travels only in the HttpOnly `__Host-khums_staff` cookie and the CSRF token in the
 * readable `__Host-khums_csrf` cookie: neither appears in any body. Passwords are accepted only in
 * request bodies and are never returned, logged or echoed.
 */

/** Request limit only (the password policy allows at most 128 characters for new passwords). */
const passwordInput = z.string().min(1).max(1024);

export const staffLoginRequestSchema = z
  .strictObject({
    username: z.string().min(1).max(200),
    password: passwordInput,
  })
  .meta({ id: 'StaffLoginRequest', title: 'StaffLoginRequest' });

export const staffLoginResponseSchema = z
  .object({
    /** Signed in with a temporary password: only the password change is allowed next. */
    mustChangePassword: z.boolean(),
    sessionExpiresAt: z.iso.datetime(),
  })
  .meta({ id: 'StaffLoginResponse', title: 'StaffLoginResponse' });

export const staffPasswordChangeRequestSchema = z
  .strictObject({
    currentPassword: passwordInput,
    newPassword: passwordInput,
  })
  .meta({ id: 'StaffPasswordChangeRequest', title: 'StaffPasswordChangeRequest' });

export type StaffLoginRequest = z.infer<typeof staffLoginRequestSchema>;
export type StaffLoginResponse = z.infer<typeof staffLoginResponseSchema>;
export type StaffPasswordChangeRequest = z.infer<typeof staffPasswordChangeRequestSchema>;

/** A `204 No Content` response (sign-out): no body at all. */
export const noContentSchema = z.null();
