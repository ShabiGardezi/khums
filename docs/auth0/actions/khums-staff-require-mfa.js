/**
 * Auth0 post-login Action 1 of 2: "Khums staff — require MFA" (M4.6.2).
 * Deploy in Auth0 Dashboard → Actions → Library → Create Action (Login / Post Login), then add
 * it to the Post Login flow BEFORE "Khums staff — authentication context".
 *
 * Action secrets: KHUMS_STAFF_CLIENT_ID = the "Khums" application's Client ID.
 *
 * The Khums Client ID is public application configuration (it appears in every authorize URL),
 * so it is also fixed below as KHUMS_CLIENT_ID for the development tenant. Logins of other
 * applications are never affected. For a Khums login the secret must be present, well-formed and
 * exactly equal to KHUMS_CLIENT_ID; otherwise that login is denied (configuration failure fails
 * closed for the staff console only). Another tenant or environment needs its own copy of this
 * Action with its own KHUMS_CLIENT_ID (docs/auth0/README.md §5).
 *
 * Every interactive staff sign-in must complete a second factor. `challengeWithAny` (rather than
 * `api.multifactor.enable`) makes Auth0 run later Actions only after the challenge and record
 * which factor was used. The Khums API decides assurance from that record: OTP, device
 * biometrics and (without verified attestation evidence) security keys are AAL2; nothing here
 * yields AAL3 by itself.
 *
 * Enrolment is SUPERVISED (docs/auth0/README.md §8). A user with no allowed factor is denied
 * unless a platform administrator has opened a short enrolment window in the user's
 * `app_metadata` (editable only by tenant administrators, never by the user):
 *
 *   "khums_mfa_enrollment": { "approved_until": "<ISO time ≤ 2 h ahead>", "approved_by": "<admin>" }
 *
 * This Action authenticates. It never grants roles: roles come only from the Khums API.
 */
const ALLOWED_FACTORS = ['webauthn-roaming', 'webauthn-platform', 'otp'];
const MAX_WINDOW_MS = 2 * 60 * 60 * 1000;
/** Shape of an Auth0 Client ID (same rule as the API's AUTH0_STAFF_CLIENT_IDS validation). */
const CLIENT_ID_PATTERN = /^[A-Za-z0-9_-]{8,128}$/;
/** The "Khums" Regular Web Application in the development tenant. Public; not a credential. */
const KHUMS_CLIENT_ID = 'mkTSaw9f40iZ0BXQvNKZf9mSDHCv2sEw';

exports.onExecutePostLogin = async (event, api) => {
  // Other applications in the tenant are never affected by this Action.
  if (event.client?.client_id !== KHUMS_CLIENT_ID) return;

  // Khums login: the configured secret must confirm the expected application exactly.
  const configured = event.secrets?.KHUMS_STAFF_CLIENT_ID;
  if (
    typeof configured !== 'string' ||
    !CLIENT_ID_PATTERN.test(configured) ||
    configured !== KHUMS_CLIENT_ID
  ) {
    api.access.deny('Sign-in is unavailable: staff MFA policy is misconfigured.');
    return;
  }
  // Refresh-token exchanges are not interactive (the staff app requests no refresh tokens).
  if (event.transaction?.protocol === 'oauth2-refresh-token') return;

  const enrolled = (event.user.enrolledFactors ?? []).some((f) => ALLOWED_FACTORS.includes(f.type));
  if (enrolled) {
    api.authentication.challengeWithAny(ALLOWED_FACTORS.map((type) => ({ type })));
    return;
  }

  const approval = event.user.app_metadata?.khums_mfa_enrollment;
  const until = Date.parse(approval?.approved_until ?? '');
  const now = Date.now();
  const windowOpen =
    typeof approval?.approved_by === 'string' &&
    approval.approved_by.length > 0 &&
    Number.isFinite(until) &&
    until > now &&
    until - now <= MAX_WINDOW_MS;
  if (!windowOpen) {
    api.access.deny('Staff MFA enrolment has not been approved. Contact a platform administrator.');
    return;
  }
  // Supervised enrolment: a hardware security key first, OTP as the fallback.
  api.authentication.enrollWithAny([{ type: 'webauthn-roaming' }, { type: 'otp' }]);
};
