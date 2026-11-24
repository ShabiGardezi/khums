import type { z } from 'zod';

import { err, ok, type Result } from '@khums/utils';
import {
  adminSessionResponseSchema,
  auditEventListResponseSchema,
  governancePackListResponseSchema,
  governancePackVersionSchema,
  governancePolicyChangeResponseSchema,
  governancePolicyRegistryResponseSchema,
  staffAccountListResponseSchema,
  staffAccountSchema,
  temporaryCredentialResponseSchema,
  type AuditEventListResponse,
  type ConfirmGovernancePolicyRequest,
  type CreateStaffAccountRequest,
  type GovernancePackListResponse,
  type GovernancePackVersion,
  type GovernancePolicyChangeResponse,
  type GovernancePolicyRegistryResponse,
  type GrantStaffRoleRequest,
  type ReplaceStaffRoleRequest,
  type ProposeGovernancePolicyRequest,
  type SetStaffAccountStatusRequest,
  type StaffAccount,
  type StaffAccountListResponse,
  type TemporaryCredentialResponse,
  healthResponseSchema,
  publicMarjaListResponseSchema,
  publicVerifiedPackResponseSchema,
  type PublicMarjaListResponse,
  type PublicVerifiedPackResponse,
  noContentSchema,
  problemDetailsSchema,
  staffLoginResponseSchema,
  type AdminSessionResponse,
  type HealthResponse,
  type StaffLoginRequest,
  type StaffLoginResponse,
  type StaffPasswordChangeRequest,
  evidenceArtefactResponseSchema,
  evidenceContentResponseSchema,
  evidenceListResponseSchema,
  researchListResponseSchema,
  researchMarjasResponseSchema,
  scholarRuleCheckResponseSchema,
  scholarRuleListResponseSchema,
  scholarRuleResponseSchema,
  scholarRuleTestResponseSchema,
  ruleInflationResponseSchema,
  builderPublicationListResponseSchema,
  ruleRequestListResponseSchema,
  ruleRequestResponseSchema,
  ruleVerificationResponseSchema,
  ruleVerificationStatusResponseSchema,
  type BuilderPublicationListResponse,
  type CreateRuleRequestRequest,
  type ResolveRuleRequestRequest,
  type RuleRequestListResponse,
  type RuleRequestResponse,
  type RuleVerificationResponse,
  type RuleVerificationStatusResponse,
  type VerifyScholarRuleRequest,
  type CheckScholarRuleRequest,
  type CreateScholarRuleRequest,
  type ReviseScholarRuleRequest,
  type ScholarRuleCheckResponse,
  type ScholarRuleListResponse,
  type ScholarRuleResponse,
  type ScholarRuleTestResponse,
  type RuleInflationQuery,
  type RuleInflationResponse,
  type TestScholarRulesRequest,
  researchMetadataItemSchema,
  researchMetadataListResponseSchema,
  researchRecordResponseSchema,
  researchRevisionResponseSchema,
  rulingVersionsResponseSchema,
  type CreateResearchRecordRequest,
  type CreateRulingVersionRequest,
  type EvidenceArtefactResponse,
  type EvidenceContentResponse,
  type EvidenceListResponse,
  type ResearchListResponse,
  type ResearchMarjasResponse,
  type ResearchMetadataItem,
  type ResearchMetadataListResponse,
  type ResearchRecordResponse,
  type ResearchRecordType,
  type ResearchRevisionResponse,
  type ResearchTransitionRequest,
  type ReviseResearchRecordRequest,
  type RulingVersionsResponse,
  type UploadEvidenceRequest,
} from '@khums/validation';

import type { ApiError } from './errors';
import type { FetchLike, ResponseLike } from './transport';

export interface ApiClientOptions {
  /** Base URL including the version prefix, e.g. `https://api.example.com/api/v1`. */
  readonly baseUrl: string;
  /** Platform fetch implementation (`globalThis.fetch` on web, React Native and Node). */
  readonly fetch: FetchLike;
  /**
   * Extra headers per request: the staff CSRF token (`x-csrf-token`, from the readable
   * `__Host-khums_csrf` cookie) in the browser, or the forwarded `cookie` header on the server.
   */
  readonly headers?: () => Readonly<Record<string, string>>;
}

export interface ApiClient {
  readonly health: {
    /** `GET /health` */
    check(): Promise<Result<HealthResponse, ApiError>>;
  };
  /**
   * Public calculator reads (decision 65): unauthenticated. Only governed, published, activated
   * and ready packs are ever served; the caller must still re-check the bundle
   * (`checkPublicVerifiedPack` in `@khums/core`) before calculating locally.
   */
  readonly public: {
    /** `GET /public/marjas`: every catalogue Marja with its verified pack trace, or null. */
    marjas(): Promise<Result<PublicMarjaListResponse, ApiError>>;
    /**
     * `GET /public/marjas/{marjaId}/pack`: the verified pack (person ids redacted) and its public
     * verification summary, or NOT_AVAILABLE. The governance ledger is never served.
     */
    verifiedPack(marjaId: string): Promise<Result<PublicVerifiedPackResponse, ApiError>>;
  };
  readonly admin: {
    /** `GET /admin/session`: the staff principal the API establishes from the session cookie. */
    session(): Promise<Result<AdminSessionResponse, ApiError>>;
  };
  readonly staff: {
    /** `POST /staff/auth/login`: sets the session and CSRF cookies on success. */
    login(body: StaffLoginRequest): Promise<Result<StaffLoginResponse, ApiError>>;
    /** `POST /staff/auth/logout` (needs the CSRF header). */
    logout(): Promise<Result<null, ApiError>>;
    /** `POST /staff/auth/password` (needs the CSRF header); issues a new session. */
    changePassword(body: StaffPasswordChangeRequest): Promise<Result<StaffLoginResponse, ApiError>>;
  };
  /** Staff account administration (M4.6.2b; SUPER_ADMIN). Commands need the CSRF header. */
  readonly staffAccounts: {
    list(): Promise<Result<StaffAccountListResponse, ApiError>>;
    create(body: CreateStaffAccountRequest): Promise<Result<TemporaryCredentialResponse, ApiError>>;
    resetPassword(
      principalId: string,
      reason: string,
    ): Promise<Result<TemporaryCredentialResponse, ApiError>>;
    setStatus(
      principalId: string,
      body: SetStaffAccountStatusRequest,
    ): Promise<Result<StaffAccount, ApiError>>;
    grantRole(
      principalId: string,
      body: GrantStaffRoleRequest,
    ): Promise<Result<StaffAccount, ApiError>>;
    revokeRole(
      principalId: string,
      assignmentId: string,
      reason: string,
    ): Promise<Result<StaffAccount, ApiError>>;
    /**
     * Replaces one assignment in one audited step (decision 64): change a scholar's Marjas or
     * convert a legacy role to SCHOLAR / SUPER_ADMIN.
     */
    replaceRole(
      principalId: string,
      assignmentId: string,
      body: ReplaceStaffRoleRequest,
    ): Promise<Result<StaffAccount, ApiError>>;
    revokeSessions(principalId: string, reason: string): Promise<Result<StaffAccount, ApiError>>;
    clearThrottle(principalId: string, reason: string): Promise<Result<StaffAccount, ApiError>>;
  };
  /** Rule-pack governance, policies and the audit log (M4.6.4a). */
  readonly governance: {
    listPacks(query?: { marjaId?: string }): Promise<Result<GovernancePackListResponse, ApiError>>;
    getPack(packId: string, version: string): Promise<Result<GovernancePackVersion, ApiError>>;
    /** One lifecycle command; the body is the command's strict request contract. */
    command(
      packId: string,
      version: string,
      command: GovernanceCommandPath,
      body: Readonly<Record<string, unknown>>,
    ): Promise<Result<GovernancePackVersion, ApiError>>;
    policies(): Promise<Result<GovernancePolicyRegistryResponse, ApiError>>;
    proposePolicy(
      body: ProposeGovernancePolicyRequest,
    ): Promise<Result<GovernancePolicyChangeResponse, ApiError>>;
    confirmPolicy(
      body: ConfirmGovernancePolicyRequest,
    ): Promise<Result<GovernancePolicyChangeResponse, ApiError>>;
    auditEvents(query?: {
      afterSequence?: number;
      limit?: number;
    }): Promise<Result<AuditEventListResponse, ApiError>>;
  };
  /**
   * Scholar research, evidence layer (M5.3.3): sources, passages, translations and evidence files.
   * Staff only; research records are never rulings. Commands need the CSRF header and send the
   * record's `expectedRevision`.
   */
  readonly research: {
    marjas(): Promise<Result<ResearchMarjasResponse, ApiError>>;
    list(
      type: ResearchRecordType,
      query?: PageQuery & { marjaId?: string; state?: string; questionId?: string },
    ): Promise<Result<ResearchListResponse, ApiError>>;
    /** Auditor view: history metadata only. */
    metadata(
      type: ResearchRecordType,
      query?: PageQuery & { marjaId?: string },
    ): Promise<Result<ResearchMetadataListResponse, ApiError>>;
    get(type: ResearchRecordType, id: string): Promise<Result<ResearchRecordResponse, ApiError>>;
    recordMetadata(
      type: ResearchRecordType,
      id: string,
    ): Promise<Result<ResearchMetadataItem, ApiError>>;
    revision(
      type: ResearchRecordType,
      id: string,
      revision: number,
    ): Promise<Result<ResearchRevisionResponse, ApiError>>;
    create(
      type: ResearchRecordType,
      body: CreateResearchRecordRequest,
    ): Promise<Result<ResearchRecordResponse, ApiError>>;
    revise(
      type: ResearchRecordType,
      id: string,
      body: ReviseResearchRecordRequest,
    ): Promise<Result<ResearchRecordResponse, ApiError>>;
    transition(
      type: ResearchRecordType,
      id: string,
      action: ResearchTransitionPath,
      body: ResearchTransitionRequest,
    ): Promise<Result<ResearchRecordResponse, ApiError>>;
    /** M5.3.5: correct the current ruling version (a new DRAFT version in the same series). */
    createRulingVersion(
      id: string,
      body: CreateRulingVersionRequest,
    ): Promise<Result<ResearchRecordResponse, ApiError>>;
    /** M5.3.5: every version of the ruling's series and the one current version. */
    rulingVersions(id: string): Promise<Result<RulingVersionsResponse, ApiError>>;
    uploadEvidence(
      body: UploadEvidenceRequest,
    ): Promise<Result<EvidenceArtefactResponse, ApiError>>;
    listEvidence(sourceId: string): Promise<Result<EvidenceListResponse, ApiError>>;
    getEvidence(artefactId: string): Promise<Result<EvidenceArtefactResponse, ApiError>>;
    /** The bytes, re-verified by the server against the recorded SHA-256. */
    evidenceContent(artefactId: string): Promise<Result<EvidenceContentResponse, ApiError>>;
  };
  /**
   * Scholar rule builder (Phase 2 steps 3–4): predefined rule fields per Marja, append-only
   * revisions, the developer-requirement check and staff-only PROVISIONAL test calculations.
   */
  readonly rules: {
    list(marjaId: string): Promise<Result<ScholarRuleListResponse, ApiError>>;
    get(ruleId: string): Promise<Result<ScholarRuleResponse, ApiError>>;
    create(body: CreateScholarRuleRequest): Promise<Result<ScholarRuleResponse, ApiError>>;
    revise(
      ruleId: string,
      body: ReviseScholarRuleRequest,
    ): Promise<Result<ScholarRuleResponse, ApiError>>;
    /** Checks unsaved content (nothing is stored). */
    check(body: CheckScholarRuleRequest): Promise<Result<ScholarRuleCheckResponse, ApiError>>;
    /** PROVISIONAL — FOR SCHOLAR REVIEW ONLY test calculation of the Marja's latest rules. */
    test(body: TestScholarRulesRequest): Promise<Result<ScholarRuleTestResponse, ApiError>>;
    /** Decision 83: official monthly-CPI inflation between two dates (a suggestion). */
    inflation(query: RuleInflationQuery): Promise<Result<RuleInflationResponse, ApiError>>;
    /** Phase 2 step 5: verification status, preconditions, history and public status. */
    verification(ruleId: string): Promise<Result<RuleVerificationStatusResponse, ApiError>>;
    /**
     * Records the source verification of the current revision (four attestations); the server
     * then publishes a new builder pack version automatically (decision 63).
     */
    verify(
      ruleId: string,
      body: VerifyScholarRuleRequest,
    ): Promise<Result<RuleVerificationResponse, ApiError>>;
    /** The active (public) builder pack version of each Marja the caller may read. */
    publications(): Promise<Result<BuilderPublicationListResponse, ApiError>>;
    /** Scholar requests of one Marja (Phase 4), newest first. */
    requests(marjaId: string): Promise<Result<RuleRequestListResponse, ApiError>>;
    /** Asks for a missing rule or a calculation change. */
    createRequest(body: CreateRuleRequestRequest): Promise<Result<RuleRequestResponse, ApiError>>;
    /** Resolves a request once, with a note. */
    resolveRequest(
      requestId: string,
      body: ResolveRuleRequestRequest,
    ): Promise<Result<RuleRequestResponse, ApiError>>;
  };
}

/** Research transitions (M5.3.3) by path segment. */
export type ResearchTransitionPath =
  'verify' | 'review' | 'dispute' | 'supersede' | 'delete-draft' | 'approve' | 'withdraw';

/** Paging (M4.6.5): pass the previous page's `nextCursor` as `cursor`. */
export interface PageQuery {
  limit?: number;
  cursor?: string;
}

/** Governance commands (M4.6.4a) by path segment. */
export type GovernanceCommandPath =
  | 'submit'
  | 'review/start'
  | 'review/request-changes'
  | 'review/complete'
  | 'approve'
  | 'publish'
  | 'activate'
  | 'withdraw'
  | 'supersede'
  /** M5.2.1: administrative emergency withdrawal of a published version (reason required). */
  | 'emergency-withdraw'
  /** M5.2.1: binds a legacy version to its Marja's current registry policy. */
  | 'bind-policy';

/** `?a=1&b=2` from the defined entries (encoded), or '' when there are none. */
function queryString(query: object = {}): string {
  const entries = Object.entries(query).filter(
    (entry): entry is [string, string | number] =>
      typeof entry[1] === 'string' || typeof entry[1] === 'number',
  );
  if (entries.length === 0) return '';
  return `?${entries.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`).join('&')}`;
}

const governancePath = (packId: string, version: string) =>
  `/admin/governance/packs/${encodeURIComponent(packId)}/versions/${encodeURIComponent(version)}`;
const accountPath = (principalId: string) =>
  `/admin/staff/accounts/${encodeURIComponent(principalId)}`;

const researchPath = (type: ResearchRecordType, id: string) =>
  `/admin/research/${type}/${encodeURIComponent(id)}`;
const evidencePath = (artefactId: string) =>
  `/admin/research/evidence/${encodeURIComponent(artefactId)}`;

const issuesOf = (error: z.ZodError): string[] =>
  error.issues.map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`);

async function readJson(response: ResponseLike): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

/**
 * Create a client. Responses are validated against the shared Zod contracts, so a contract
 * drift between API and client surfaces as `invalid_response` instead of corrupt data.
 */
export function createApiClient(options: ApiClientOptions): ApiClient {
  const baseUrl = options.baseUrl.replace(/\/+$/, '');

  async function request<S extends z.ZodType>(
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
    path: string,
    schema: S,
    body?: unknown,
  ): Promise<Result<z.output<S>, ApiError>> {
    let response: ResponseLike;
    try {
      response = await options.fetch(`${baseUrl}${path}`, {
        method,
        headers: {
          accept: 'application/json, application/problem+json',
          ...(body === undefined ? {} : { 'content-type': 'application/json' }),
          ...options.headers?.(),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    } catch (cause) {
      return err({ kind: 'network', cause });
    }

    const payload = response.status === 204 ? null : await readJson(response);

    if (!response.ok) {
      const problem = problemDetailsSchema.safeParse(payload);
      return problem.success
        ? err({ kind: 'http', status: response.status, problem: problem.data })
        : err({
            kind: 'invalid_response',
            status: response.status,
            issues: issuesOf(problem.error),
          });
    }

    const parsed = schema.safeParse(payload);
    return parsed.success
      ? ok(parsed.data)
      : err({ kind: 'invalid_response', status: response.status, issues: issuesOf(parsed.error) });
  }

  return {
    health: {
      check: () => request('GET', '/health', healthResponseSchema),
    },
    public: {
      marjas: () => request('GET', '/public/marjas', publicMarjaListResponseSchema),
      verifiedPack: (marjaId) =>
        request(
          'GET',
          `/public/marjas/${encodeURIComponent(marjaId)}/pack`,
          publicVerifiedPackResponseSchema,
        ),
    },
    admin: {
      session: () => request('GET', '/admin/session', adminSessionResponseSchema),
    },
    staff: {
      login: (body) => request('POST', '/staff/auth/login', staffLoginResponseSchema, body),
      logout: () => request('POST', '/staff/auth/logout', noContentSchema),
      changePassword: (body) =>
        request('POST', '/staff/auth/password', staffLoginResponseSchema, body),
    },
    staffAccounts: {
      list: () => request('GET', '/admin/staff/accounts', staffAccountListResponseSchema),
      create: (body) =>
        request('POST', '/admin/staff/accounts', temporaryCredentialResponseSchema, body),
      resetPassword: (principalId, reason) =>
        request(
          'POST',
          `${accountPath(principalId)}/password-reset`,
          temporaryCredentialResponseSchema,
          {
            reason,
          },
        ),
      setStatus: (principalId, body) =>
        request('POST', `${accountPath(principalId)}/status`, staffAccountSchema, body),
      grantRole: (principalId, body) =>
        request('POST', `${accountPath(principalId)}/roles`, staffAccountSchema, body),
      revokeRole: (principalId, assignmentId, reason) =>
        request(
          'POST',
          `${accountPath(principalId)}/roles/${encodeURIComponent(assignmentId)}/revoke`,
          staffAccountSchema,
          { reason },
        ),
      replaceRole: (principalId, assignmentId, body) =>
        request(
          'POST',
          `${accountPath(principalId)}/roles/${encodeURIComponent(assignmentId)}/replace`,
          staffAccountSchema,
          body,
        ),
      revokeSessions: (principalId, reason) =>
        request('POST', `${accountPath(principalId)}/sessions/revoke`, staffAccountSchema, {
          reason,
        }),
      clearThrottle: (principalId, reason) =>
        request('POST', `${accountPath(principalId)}/throttle/clear`, staffAccountSchema, {
          reason,
        }),
    },
    governance: {
      listPacks: (query) =>
        request(
          'GET',
          `/admin/governance/packs${queryString(query)}`,
          governancePackListResponseSchema,
        ),
      getPack: (packId, version) =>
        request('GET', governancePath(packId, version), governancePackVersionSchema),
      command: (packId, version, command, body) =>
        request(
          'POST',
          `${governancePath(packId, version)}/${command}`,
          governancePackVersionSchema,
          body,
        ),
      policies: () =>
        request('GET', '/admin/governance/policies', governancePolicyRegistryResponseSchema),
      proposePolicy: (body) =>
        request(
          'POST',
          '/admin/governance/policies/proposals',
          governancePolicyChangeResponseSchema,
          body,
        ),
      confirmPolicy: (body) =>
        request(
          'POST',
          '/admin/governance/policies/proposals/confirm',
          governancePolicyChangeResponseSchema,
          body,
        ),
      auditEvents: (query) =>
        request('GET', `/admin/audit/events${queryString(query)}`, auditEventListResponseSchema),
    },
    research: {
      marjas: () => request('GET', '/admin/research/marjas', researchMarjasResponseSchema),
      list: (type, query) =>
        request('GET', `/admin/research/${type}${queryString(query)}`, researchListResponseSchema),
      metadata: (type, query) =>
        request(
          'GET',
          `/admin/research/${type}/metadata${queryString(query)}`,
          researchMetadataListResponseSchema,
        ),
      get: (type, id) => request('GET', researchPath(type, id), researchRecordResponseSchema),
      recordMetadata: (type, id) =>
        request('GET', `${researchPath(type, id)}/metadata`, researchMetadataItemSchema),
      revision: (type, id, revision) =>
        request(
          'GET',
          `${researchPath(type, id)}/revisions/${String(revision)}`,
          researchRevisionResponseSchema,
        ),
      create: (type, body) =>
        request('POST', `/admin/research/${type}`, researchRecordResponseSchema, body),
      revise: (type, id, body) =>
        request('POST', `${researchPath(type, id)}/revise`, researchRecordResponseSchema, body),
      transition: (type, id, action, body) =>
        request('POST', `${researchPath(type, id)}/${action}`, researchRecordResponseSchema, body),
      createRulingVersion: (id, body) =>
        request(
          'POST',
          `${researchPath('rulings', id)}/versions`,
          researchRecordResponseSchema,
          body,
        ),
      rulingVersions: (id) =>
        request('GET', `${researchPath('rulings', id)}/versions`, rulingVersionsResponseSchema),
      uploadEvidence: (body) =>
        request('POST', '/admin/research/evidence', evidenceArtefactResponseSchema, body),
      listEvidence: (sourceId) =>
        request(
          'GET',
          `/admin/research/evidence${queryString({ sourceId })}`,
          evidenceListResponseSchema,
        ),
      getEvidence: (artefactId) =>
        request('GET', evidencePath(artefactId), evidenceArtefactResponseSchema),
      evidenceContent: (artefactId) =>
        request('GET', `${evidencePath(artefactId)}/content`, evidenceContentResponseSchema),
    },
    rules: {
      list: (marjaId) =>
        request('GET', `/admin/rules${queryString({ marjaId })}`, scholarRuleListResponseSchema),
      get: (ruleId) =>
        request('GET', `/admin/rules/${encodeURIComponent(ruleId)}`, scholarRuleResponseSchema),
      create: (body) => request('POST', '/admin/rules', scholarRuleResponseSchema, body),
      revise: (ruleId, body) =>
        request(
          'POST',
          `/admin/rules/${encodeURIComponent(ruleId)}/revise`,
          scholarRuleResponseSchema,
          body,
        ),
      check: (body) => request('POST', '/admin/rules/check', scholarRuleCheckResponseSchema, body),
      test: (body) => request('POST', '/admin/rules/test', scholarRuleTestResponseSchema, body),
      inflation: (query) =>
        request('GET', `/admin/rules/inflation${queryString(query)}`, ruleInflationResponseSchema),
      verification: (ruleId) =>
        request(
          'GET',
          `/admin/rules/${encodeURIComponent(ruleId)}/verification`,
          ruleVerificationStatusResponseSchema,
        ),
      verify: (ruleId, body) =>
        request(
          'POST',
          `/admin/rules/${encodeURIComponent(ruleId)}/verify`,
          ruleVerificationResponseSchema,
          body,
        ),
      publications: () =>
        request('GET', '/admin/rules/publications', builderPublicationListResponseSchema),
      requests: (marjaId) =>
        request(
          'GET',
          `/admin/rules/requests${queryString({ marjaId })}`,
          ruleRequestListResponseSchema,
        ),
      createRequest: (body) =>
        request('POST', '/admin/rules/requests', ruleRequestResponseSchema, body),
      resolveRequest: (requestId, body) =>
        request(
          'POST',
          `/admin/rules/requests/${encodeURIComponent(requestId)}/resolve`,
          ruleRequestResponseSchema,
          body,
        ),
    },
  };
}
