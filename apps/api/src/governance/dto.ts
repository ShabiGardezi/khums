import {
  auditEventListQuerySchema,
  confirmGovernancePolicyRequestSchema,
  governanceCommandRequestSchema,
  governanceEvidenceCommandRequestSchema,
  governancePackListQuerySchema,
  governancePackVersionParamsSchema,
  proposeGovernancePolicyRequestSchema,
  submitGovernancePackRequestSchema,
  supersedeGovernancePackRequestSchema,
  withdrawGovernancePackRequestSchema,
  emergencyWithdrawGovernancePackRequestSchema,
  bindGovernancePolicyRequestSchema,
} from '@khums/validation';

import { createZodDto } from '../common/pipes/zod-validation.pipe';

/** Request DTOs for governance routes (M4.6.4a): shared strict Zod contracts, never declared here. */
export class GovernancePackVersionParamsDto extends createZodDto(
  governancePackVersionParamsSchema,
) {}
export class GovernancePackListQueryDto extends createZodDto(governancePackListQuerySchema) {}
export class AuditEventListQueryDto extends createZodDto(auditEventListQuerySchema) {}
export class SubmitGovernancePackDto extends createZodDto(submitGovernancePackRequestSchema) {}
export class GovernanceCommandDto extends createZodDto(governanceCommandRequestSchema) {}
export class GovernanceEvidenceCommandDto extends createZodDto(
  governanceEvidenceCommandRequestSchema,
) {}
export class WithdrawGovernancePackDto extends createZodDto(withdrawGovernancePackRequestSchema) {}
export class EmergencyWithdrawGovernancePackDto extends createZodDto(
  emergencyWithdrawGovernancePackRequestSchema,
) {}
export class BindGovernancePolicyDto extends createZodDto(bindGovernancePolicyRequestSchema) {}
export class SupersedeGovernancePackDto extends createZodDto(
  supersedeGovernancePackRequestSchema,
) {}
export class ProposeGovernancePolicyDto extends createZodDto(
  proposeGovernancePolicyRequestSchema,
) {}
export class ConfirmGovernancePolicyDto extends createZodDto(
  confirmGovernancePolicyRequestSchema,
) {}
