/**
 * @khums/core/trusted-principal — SERVER ONLY (allowed only in `apps/api` by the boundary check).
 * Interim trust mechanism until M4.6.2 (docs/AUTH_ARCHITECTURE.md §5.6); nothing calls it yet.
 *
 * `establishPrincipal` turns server-verified facts (validated provider token or session, plus the
 * account and role assignments from the API's own store) into the only principal objects the
 * authorization evaluator trusts. It must never receive values supplied by a client.
 */
export type { PrincipalIssueCode } from './authorization/principal';
export { establishPrincipal } from './authorization/principal';
export type { TrustedPrincipalInput } from '@khums/validation';
