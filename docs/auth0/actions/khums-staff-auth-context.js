/**
 * Auth0 post-login Action 2 of 2: "Khums staff — authentication context" (M4.6.2).
 * Add it to the Post Login flow AFTER "Khums staff — require MFA".
 *
 * Action secrets:
 *   KHUMS_STAFF_CLIENT_ID = the "Khums" application's Client ID
 *   KHUMS_API_AUDIENCE    = https://api.khums.app
 *
 * Copies Auth0's own record of this login into namespaced access-token claims, because Auth0
 * access tokens carry no `amr`, `auth_time` or `sid`, and those names cannot be set by Actions:
 *   https://khums.app/sid           → event.session.id (binds the token to the Auth0 session)
 *   https://khums.app/auth_methods  → [{ name, type?, at }] from event.authentication.methods
 *
 * The values come from Auth0's server-side transaction (never from the user, user_metadata or
 * app_metadata) and are signed with the token. The Khums API derives assurance and step-up
 * freshness from them; if they are missing, it refuses the token.
 */
exports.onExecutePostLogin = async (event, api) => {
  if (event.client.client_id !== event.secrets.KHUMS_STAFF_CLIENT_ID) return;
  if (event.resource_server?.identifier !== event.secrets.KHUMS_API_AUDIENCE) return;

  const methods = (event.authentication?.methods ?? [])
    .map((m) => ({
      name: String(m.name),
      ...(typeof m.type === 'string' ? { type: m.type } : {}),
      at: Math.floor(new Date(m.timestamp).getTime() / 1000),
    }))
    .filter((m) => Number.isFinite(m.at))
    .slice(-10);

  if (typeof event.session?.id === 'string') {
    api.accessToken.setCustomClaim('https://khums.app/sid', event.session.id);
  }
  api.accessToken.setCustomClaim('https://khums.app/auth_methods', methods);
};
