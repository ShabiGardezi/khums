/**
 * @khums/api-client — public API.
 *
 * The single REST client for web and mobile. Request/response types come from the shared
 * contracts in @khums/validation (no duplicated interfaces). The same contracts generate the
 * API's OpenAPI document (`apps/api/openapi.json`), from which non-TypeScript clients can be
 * generated.
 */
export type {
  ApiClient,
  ApiClientOptions,
  GovernanceCommandPath,
  PageQuery,
  ResearchTransitionPath,
} from './client';
export { createApiClient } from './client';
export type { ApiError } from './errors';
export type { FetchLike, RequestInitLike, ResponseLike } from './transport';
/** Contract types callers need (declared once in @khums/validation). */
export type {
  AdminSessionResponse,
  AuditEventListResponse,
  AuditEventResponse,
  GovernancePackListResponse,
  GovernancePackVersion,
  GovernancePackVersionSummary,
  GovernancePolicyRegistryResponse,
  GovernanceRecordSummary,
  GrantStaffRoleRequest,
  ReplaceStaffRoleRequest,
  StaffAccount,
  StaffAccountListResponse,
  TemporaryCredentialResponse,
  StaffLoginResponse,
  // Scholar research workspace (M5.3.7).
  ResearchListItem,
  ResearchMarjasResponse,
  ResearchMetadataItem,
  ResearchRecordResponse,
  ResearchRecordType,
  RulingVersionsResponse,
  // Public calculator (decision 65).
  PublicMarja,
  PublicMarjaListResponse,
  PublicVerifiedPackResponse,
  PublicVerifiedPackSummary,
  // Scholar rule builder (Phase 2 steps 3–4).
  CheckScholarRuleRequest,
  CreateScholarRuleRequest,
  ReviseScholarRuleRequest,
  ScholarRuleCheckResponse,
  ScholarRuleListResponse,
  ScholarRuleResponse,
  ScholarRuleRevisionResponse,
  ScholarRuleStatus,
  ScholarRuleSummary,
  ScholarRuleTestResponse,
  TestScholarRulesRequest,
  // Source verification (Phase 2 step 5).
  BuilderPublication,
  BuilderPublicationListResponse,
  BuilderPublicationPreview,
  RulePublicStatus,
  SuspendedBuilderRule,
  RuleVerificationResponse,
  RuleVerificationStatusResponse,
  RuleVerificationView,
  VerificationBlockerView,
  VerifyScholarRuleRequest,
  CreateRuleRequestRequest,
  ResolveRuleRequestRequest,
  RuleRequestListResponse,
  RuleRequestResponse,
} from '@khums/validation';
export { PROVISIONAL_RESULT_LABEL } from '@khums/validation';
/** Staff roles (decision 64): the grantable ones and the legacy ones that stay readable. */
export type { GovernanceRole, GrantableStaffRole, LegacyStaffRole } from '@khums/shared-types';
export { GRANTABLE_STAFF_ROLES, isLegacyStaffRole, LEGACY_STAFF_ROLES } from '@khums/validation';
