# Auth0 configuration for Khums staff sign-in (M4.6.2)

Auth0 **authenticates** governance staff. It never decides what they may do: roles, permissions,
MFA requirements and separation of duties are enforced by the Khums API and the M4.6.1
authorization engine (`docs/AUTH_ARCHITECTURE.md` §4.5–§4.8). Calculator users never sign in.

Never put secrets in this repository. Client secrets and the session secret go only in
`apps/web/.env.local` (git-ignored) or the hosting platform's secret store.

## 1. Application "Khums" (Regular Web Application)

| Setting                         | Value (development)                                                                      |
| ------------------------------- | ---------------------------------------------------------------------------------------- |
| Allowed Callback URLs           | `http://localhost:3000/auth/callback` (the SDK's route)                                  |
| Allowed Logout URLs             | `http://localhost:3000/` (the app always returns here)                                   |
| Allowed Web Origins / CORS      | none needed (no browser-side Auth0 calls)                                                |
| Grant types (Advanced settings) | **Authorization Code only**. Clear Implicit, Refresh Token, Client Credentials, Password |
| Token endpoint authentication   | Client Secret (Post or Basic)                                                            |
| ID token signing algorithm      | RS256                                                                                    |
| Connections                     | only the staff database connection (no social logins unless the owner decides)           |

## 2. API "Khums API"

| Setting                         | Value                                                                                                      |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Identifier                      | `https://api.khums.app`                                                                                    |
| Signing algorithm               | RS256                                                                                                      |
| Token lifetime                  | **900 seconds** (must not exceed `AUTH_ACCESS_TOKEN_MAX_AGE_SECONDS`; the API refuses older tokens anyway) |
| Allow Offline Access            | **Off** (no refresh tokens)                                                                                |
| Enable RBAC / Add permissions   | **Off** (Khums ignores Auth0 roles and permissions)                                                        |
| Machine-to-machine applications | none authorized                                                                                            |
| Access token profile            | Auth0 (default) or RFC 9068; both work                                                                     |

**Application access (required).** In the Khums API's application-access settings, authorize the
**Khums** Regular Web Application for **user access** (tokens issued to signed-in users). Without
it Auth0 refuses sign-in with "Client … is not authorized to access resource server
`https://api.khums.app`". Do **not** authorize machine-to-machine (client-credentials) access for
any application, and do not grant API permissions or scopes: the app requests only `openid`, and
Khums ignores Auth0 permissions (roles come only from the Khums API).

## 3. No public sign-up

- Database connection → **Disable Sign Ups: on**. Staff users are created by an administrator in
  the dashboard (or invited). The web app also strips `screen_hint` and every other unexpected
  `/auth/login` parameter, but the dashboard setting is the real control.

## 4. Multi-factor authentication

- Security → Multi-factor Auth: enable **WebAuthn with FIDO Security Keys**, **WebAuthn with
  FIDO Device Biometrics** and **One-time Password**. Leave SMS, email, voice and push disabled
  for staff (they earn no assurance credit in Khums).
- Policy "Require Multi-factor Auth": **Never** (the Action below decides), and turn on
  **Customize MFA Factors using Actions**.
- Khums credits **at most AAL2** today: OTP, device biometrics and security keys are all AAL2,
  because the token carries no verified attestation evidence (`AUTH_ARCHITECTURE.md` §4.7). Staff
  authenticate once: AAL2 at sign-in is all any permission requires (no step-up, no AAL3). A
  sign-in without verified MFA evidence (AAL1) gets no permissions.

## 5. Post-login Actions (both required)

Create each from `docs/auth0/actions/` (Actions → Library → Build Custom → Login / Post Login),
add the listed secrets, deploy, then put them in the **Login flow in this order**:

1. `khums-staff-require-mfa.js` — secret `KHUMS_STAFF_CLIENT_ID` = the Khums Client ID (must
   equal the `KHUMS_CLIENT_ID` constant in the source).
2. `khums-staff-auth-context.js` — secrets `KHUMS_STAFF_CLIENT_ID` and
   `KHUMS_API_AUDIENCE` = `https://api.khums.app`.

Without them the API refuses every staff token (missing claims). After the first sign-in, open
`/en/admin`: after a security-key, device-biometric or OTP challenge, "Sign-in strength" should
show `AAL2`. Security keys are credited as AAL2, not AAL3, because verified authenticator
attestation is unavailable (§4). If it shows `AAL1`, Auth0 did not record the factor type; report
it, do not weaken the API.

**Configuration (Action 1).**

- The Khums application's Client ID is public configuration (it appears in every authorize URL).
  Action 1 fixes it as the constant `KHUMS_CLIENT_ID` for the **development tenant**. Another
  tenant or environment needs its own copy of the Action with its own value. No client secret or
  other credential is ever placed in an Action.
- **Other applications are never affected:** a login of any other client returns at once,
  whatever the secret holds.
- **Khums logins fail closed on misconfiguration:** if `KHUMS_STAFF_CLIENT_ID` is missing, empty,
  not shaped like a Client ID (letters, digits, `_` or `-`, 8–128 characters) or not exactly
  equal to `KHUMS_CLIENT_ID`, the Khums login is denied with "Sign-in is unavailable: staff MFA
  policy is misconfigured." This check runs before the refresh-token exception.
- If `KHUMS_CLIENT_ID` itself were wrong in the deployed source (for example after copying the
  Action to another tenant), Khums logins would skip Action 1. The API still protects privileged
  access: with Action 2 configured, a password-only sign-in is rated `AAL1` and every governance
  permission (at least `AAL2`) is denied; without Action 2 the token has no Khums claims and is
  refused; and the API accepts only tokens issued to `AUTH0_STAFF_CLIENT_IDS`.
- **Check at deployment:** after deploying or changing either Action, sign in and open
  `/en/admin` → Sign-in evidence. It must show an `mfa` row with a factor type in "This sign-in".

## 6. Logout and sessions

- Tenant Settings → Advanced: enable **RP-Initiated Logout End Session Endpoint Discovery** (the
  SDK falls back to `/v2/logout` otherwise).
- Optional, recommended: tenant session inactivity timeout 15 minutes, absolute 8 hours (matches
  the app's session limits).

## 7. Development role assignments

Auth0 users have **no** Khums role until listed by the API. Locally, copy
`apps/api/dev-identities.example.json` to `apps/api/dev-identities.json` (git-ignored), put your
Auth0 user id (`auth0|…`, User Management → Users) in `subject`, choose roles, and set
`AUTH_DEV_IDENTITIES_FILE=./dev-identities.json` in `apps/api/.env`. This file is refused in
production; durable role assignments arrive in M4.6.3.

## 8. Supervised enrolment (privileged staff)

Follow `docs/AUTH_ARCHITECTURE.md` §4.9. In the dashboard, for step 4 (by a second administrator,
during a live identity-verification call): User Management → Users → the user → Details →
`app_metadata`:

```json
{
  "khums_mfa_enrollment": { "approved_until": "2026-11-20T15:30:00.000Z", "approved_by": "admin-2" }
}
```

Use a time at most 2 hours ahead (the Action refuses longer windows). After the person has
enrolled, delete `khums_mfa_enrollment`. A user with no enrolled factor and no open window is
denied at sign-in.

## 9. Real-tenant verification

After a sign-in, `/en/admin` shows **Sign-in evidence**: each step Auth0 recorded (as received in
the signature-verified token), its factor type, time, whether it belongs to this sign-in, and the
credit the API gave it. Nobody needs to copy tokens or cookies. Expected today:

| Sign-in                      | Expected evidence (this sign-in)                    | Expected strength |
| ---------------------------- | --------------------------------------------------- | ----------------- |
| Password + security key      | `pwd` FIRST_FACTOR, `mfa` / `webauthn-roaming` AAL2 | AAL2              |
| Password + OTP               | `pwd` FIRST_FACTOR, `mfa` / `otp` AAL2              | AAL2              |
| Password + MFA, type missing | `mfa` / not recorded, credit NONE                   | AAL1              |

If the factor type shows "not recorded", Auth0 is not supplying it: MFA earns no credit and the
evidence fails closed. Do not change the API to accept it.
