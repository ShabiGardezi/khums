import { z } from 'zod';

import {
  adminSessionResponseSchema,
  auditEventListResponseSchema,
  auditEventResponseSchema,
  confirmGovernancePolicyRequestSchema,
  governanceCommandRequestSchema,
  governanceEvidenceCommandRequestSchema,
  governancePackListResponseSchema,
  governancePackVersionSchema,
  governancePackVersionSummarySchema,
  governancePolicyChangeResponseSchema,
  governancePolicyRegistryResponseSchema,
  governanceRecordSummarySchema,
  proposeGovernancePolicyRequestSchema,
  submitGovernancePackRequestSchema,
  supersedeGovernancePackRequestSchema,
  withdrawGovernancePackRequestSchema,
  emergencyWithdrawGovernancePackRequestSchema,
  bindGovernancePolicyRequestSchema,
  createStaffAccountRequestSchema,
  grantStaffRoleRequestSchema,
  replaceStaffRoleRequestSchema,
  healthResponseSchema,
  publicMarjaListResponseSchema,
  publicMarjaSchema,
  publicVerifiedPackResponseSchema,
  publicVerifiedPackSummarySchema,
  problemDetailsSchema,
  setStaffAccountStatusRequestSchema,
  staffAccountListResponseSchema,
  staffAccountSchema,
  staffAdministrationReasonRequestSchema,
  staffLoginRequestSchema,
  staffLoginResponseSchema,
  staffPasswordChangeRequestSchema,
  temporaryCredentialResponseSchema,
  createResearchRecordRequestSchema,
  evidenceArtefactResponseSchema,
  evidenceContentResponseSchema,
  evidenceListResponseSchema,
  passagePayloadContract,
  researchAiProvenanceEntrySchema,
  researchListItemSchema,
  researchListResponseSchema,
  researchMarjasResponseSchema,
  researchMetadataItemSchema,
  researchMetadataListResponseSchema,
  researchRecordResponseSchema,
  researchRecordSummarySchema,
  researchRevisionResponseSchema,
  researchTransitionRequestSchema,
  reviseResearchRecordRequestSchema,
  createRulingVersionRequestSchema,
  rulingVersionsResponseSchema,
  sourcePayloadContract,
  translationPayloadContract,
  findingPayloadContract,
  rulingPayloadContract,
  uploadEvidenceRequestSchema,
  checkScholarRuleRequestSchema,
  createRuleRequestRequestSchema,
  createScholarRuleRequestSchema,
  resolveRuleRequestRequestSchema,
  ruleRequestListResponseSchema,
  ruleRequestResponseSchema,
  reviseScholarRuleRequestSchema,
  testScholarRulesRequestSchema,
  scholarRuleCheckResponseSchema,
  scholarRuleListResponseSchema,
  scholarRuleResponseSchema,
  scholarRuleRevisionResponseSchema,
  scholarRuleSummarySchema,
  scholarRuleTestResponseSchema,
  ruleInflationQuerySchema,
  ruleInflationResponseSchema,
  verifyScholarRuleRequestSchema,
  ruleVerificationSchema,
  verificationBlockerSchema,
  rulePublicStatusSchema,
  suspendedBuilderRuleSchema,
  builderPublicationPreviewSchema,
  ruleVerificationStatusResponseSchema,
  ruleVerificationResponseSchema,
  builderPublicationSchema,
  builderPublicationListResponseSchema,
} from '@khums/validation';

/**
 * Shared Zod contracts exposed as OpenAPI components. Keys must equal each schema's
 * `.meta({ id })` in @khums/validation. Adding an endpoint = register its contracts here.
 *
 * Compatibility policy (docs/ARCHITECTURE.md §12):
 * - REQUEST contracts are strict: define them with `z.strictObject` so unexpected fields are
 *   rejected (400 VALIDATION_FAILED). They are emitted in *input* mode with
 *   `additionalProperties: false`.
 * - RESPONSE contracts are additive: clients must tolerate new fields, so the OpenAPI schema does
 *   not forbid additional properties. The server still emits only declared fields, because
 *   `ContractResponseInterceptor` parses every response through its (stripping) Zod schema.
 */
export const REQUEST_CONTRACTS = {
  ConfirmGovernancePolicyRequest: confirmGovernancePolicyRequestSchema,
  CreateStaffAccountRequest: createStaffAccountRequestSchema,
  GovernanceCommandRequest: governanceCommandRequestSchema,
  GovernanceEvidenceCommandRequest: governanceEvidenceCommandRequestSchema,
  GrantStaffRoleRequest: grantStaffRoleRequestSchema,
  ReplaceStaffRoleRequest: replaceStaffRoleRequestSchema,
  SetStaffAccountStatusRequest: setStaffAccountStatusRequestSchema,
  StaffAdministrationReasonRequest: staffAdministrationReasonRequestSchema,
  StaffLoginRequest: staffLoginRequestSchema,
  ProposeGovernancePolicyRequest: proposeGovernancePolicyRequestSchema,
  StaffPasswordChangeRequest: staffPasswordChangeRequestSchema,
  SubmitGovernancePackRequest: submitGovernancePackRequestSchema,
  SupersedeGovernancePackRequest: supersedeGovernancePackRequestSchema,
  WithdrawGovernancePackRequest: withdrawGovernancePackRequestSchema,
  EmergencyWithdrawGovernancePackRequest: emergencyWithdrawGovernancePackRequestSchema,
  BindGovernancePolicyRequest: bindGovernancePolicyRequestSchema,
  // Scholar research, evidence layer (M5.3.3). Payloads are validated per type by @khums/core.
  CreateResearchRecordRequest: createResearchRecordRequestSchema,
  ReviseResearchRecordRequest: reviseResearchRecordRequestSchema,
  CreateRulingVersionRequest: createRulingVersionRequestSchema,
  ResearchTransitionRequest: researchTransitionRequestSchema,
  UploadEvidenceRequest: uploadEvidenceRequestSchema,
  SourcePayload: sourcePayloadContract,
  PassagePayload: passagePayloadContract,
  TranslationPayload: translationPayloadContract,
  FindingPayload: findingPayloadContract,
  RulingPayload: rulingPayloadContract,
  // Scholar rule builder (Phase 2 steps 3–4).
  CreateScholarRuleRequest: createScholarRuleRequestSchema,
  ReviseScholarRuleRequest: reviseScholarRuleRequestSchema,
  CheckScholarRuleRequest: checkScholarRuleRequestSchema,
  TestScholarRulesRequest: testScholarRulesRequestSchema,
  VerifyScholarRuleRequest: verifyScholarRuleRequestSchema,
  CreateRuleRequestRequest: createRuleRequestRequestSchema,
  ResolveRuleRequestRequest: resolveRuleRequestRequestSchema,
} as const satisfies Record<string, z.ZodType>;

export const RESPONSE_CONTRACTS = {
  // Public calculator (decision 65): unauthenticated reads of verified packs.
  PublicMarja: publicMarjaSchema,
  PublicMarjaListResponse: publicMarjaListResponseSchema,
  PublicVerifiedPackResponse: publicVerifiedPackResponseSchema,
  PublicVerifiedPackSummary: publicVerifiedPackSummarySchema,
  AdminSessionResponse: adminSessionResponseSchema,
  AuditEventListResponse: auditEventListResponseSchema,
  AuditEventResponse: auditEventResponseSchema,
  GovernancePackListResponse: governancePackListResponseSchema,
  GovernancePackVersion: governancePackVersionSchema,
  GovernancePackVersionSummary: governancePackVersionSummarySchema,
  GovernancePolicyChangeResponse: governancePolicyChangeResponseSchema,
  GovernancePolicyRegistryResponse: governancePolicyRegistryResponseSchema,
  GovernanceRecordSummary: governanceRecordSummarySchema,
  HealthResponse: healthResponseSchema,
  ProblemDetails: problemDetailsSchema,
  StaffAccount: staffAccountSchema,
  StaffAccountListResponse: staffAccountListResponseSchema,
  StaffLoginResponse: staffLoginResponseSchema,
  TemporaryCredentialResponse: temporaryCredentialResponseSchema,
  EvidenceArtefactResponse: evidenceArtefactResponseSchema,
  EvidenceContentResponse: evidenceContentResponseSchema,
  EvidenceListResponse: evidenceListResponseSchema,
  ResearchAiProvenanceEntry: researchAiProvenanceEntrySchema,
  ResearchListItem: researchListItemSchema,
  ResearchListResponse: researchListResponseSchema,
  RulingVersionsResponse: rulingVersionsResponseSchema,
  ResearchMarjasResponse: researchMarjasResponseSchema,
  ResearchMetadataItem: researchMetadataItemSchema,
  ResearchMetadataListResponse: researchMetadataListResponseSchema,
  ResearchRecordResponse: researchRecordResponseSchema,
  ResearchRecordSummary: researchRecordSummarySchema,
  ResearchRevisionResponse: researchRevisionResponseSchema,
  // Scholar rule builder (Phase 2 steps 3–4).
  ScholarRuleCheckResponse: scholarRuleCheckResponseSchema,
  ScholarRuleListResponse: scholarRuleListResponseSchema,
  ScholarRuleResponse: scholarRuleResponseSchema,
  ScholarRuleRevisionResponse: scholarRuleRevisionResponseSchema,
  ScholarRuleSummary: scholarRuleSummarySchema,
  ScholarRuleTestResponse: scholarRuleTestResponseSchema,
  RuleInflationQuery: ruleInflationQuerySchema,
  RuleInflationResponse: ruleInflationResponseSchema,
  RuleRequestResponse: ruleRequestResponseSchema,
  RuleRequestListResponse: ruleRequestListResponseSchema,
  RuleVerification: ruleVerificationSchema,
  VerificationBlocker: verificationBlockerSchema,
  RulePublicStatus: rulePublicStatusSchema,
  SuspendedBuilderRule: suspendedBuilderRuleSchema,
  BuilderPublicationPreview: builderPublicationPreviewSchema,
  RuleVerificationStatusResponse: ruleVerificationStatusResponseSchema,
  RuleVerificationResponse: ruleVerificationResponseSchema,
  BuilderPublication: builderPublicationSchema,
  BuilderPublicationListResponse: builderPublicationListResponseSchema,
} as const satisfies Record<string, z.ZodType>;

export type RequestContractId = keyof typeof REQUEST_CONTRACTS;
export type ResponseContractId = keyof typeof RESPONSE_CONTRACTS;
export type ContractSchemaId = keyof (typeof REQUEST_CONTRACTS & typeof RESPONSE_CONTRACTS);

type JsonSchema = Record<string, unknown>;

export function toOpenApiComponents(
  contracts: Readonly<Record<string, z.ZodType>>,
  io: 'input' | 'output',
  allowAdditionalProperties: boolean,
): Record<string, JsonSchema> {
  const entries = Object.entries(contracts);
  if (entries.length === 0) return {};

  const registry = z.registry<{ id: string }>();
  for (const [id, schema] of entries) registry.add(schema, { id });

  const { schemas } = z.toJSONSchema(registry, {
    target: 'openapi-3.0',
    io,
    uri: (id) => `#/components/schemas/${id}`,
    override: (ctx) => {
      if (allowAdditionalProperties && ctx.jsonSchema.additionalProperties === false) {
        delete ctx.jsonSchema.additionalProperties;
      }
    },
  });

  // `$id` is JSON Schema, not OpenAPI 3.0; the component key already identifies the schema.
  return Object.fromEntries(
    Object.entries(schemas).map(([id, schema]) => {
      const { $id: _id, ...rest } = schema as JsonSchema;
      return [id, rest];
    }),
  );
}

/** Converts the registered contracts to OpenAPI 3.0 component schemas. */
export function contractComponentSchemas(): Record<ContractSchemaId, JsonSchema> {
  return {
    ...toOpenApiComponents(REQUEST_CONTRACTS, 'input', false),
    ...toOpenApiComponents(RESPONSE_CONTRACTS, 'output', true),
  } as Record<ContractSchemaId, JsonSchema>;
}
