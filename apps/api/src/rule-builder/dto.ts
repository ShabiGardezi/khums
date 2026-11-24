import {
  checkScholarRuleRequestSchema,
  createRuleRequestRequestSchema,
  resolveRuleRequestRequestSchema,
  ruleInflationQuerySchema,
  ruleRequestParamsSchema,
  createScholarRuleRequestSchema,
  reviseScholarRuleRequestSchema,
  scholarRuleListQuerySchema,
  scholarRuleParamsSchema,
  testScholarRulesRequestSchema,
  verifyScholarRuleRequestSchema,
} from '@khums/validation';

import { createZodDto } from '../common/pipes/zod-validation.pipe';

/** Request DTOs for the rule builder (Phase 2): shared strict Zod contracts, never declared here. */
export class ScholarRuleListQueryDto extends createZodDto(scholarRuleListQuerySchema) {}
export class ScholarRuleParamsDto extends createZodDto(scholarRuleParamsSchema) {}
export class CreateScholarRuleDto extends createZodDto(createScholarRuleRequestSchema) {}
export class ReviseScholarRuleDto extends createZodDto(reviseScholarRuleRequestSchema) {}
export class CheckScholarRuleDto extends createZodDto(checkScholarRuleRequestSchema) {}
export class TestScholarRulesDto extends createZodDto(testScholarRulesRequestSchema) {}
export class VerifyScholarRuleDto extends createZodDto(verifyScholarRuleRequestSchema) {}
export class CreateRuleRequestDto extends createZodDto(createRuleRequestRequestSchema) {}
export class ResolveRuleRequestDto extends createZodDto(resolveRuleRequestRequestSchema) {}
export class RuleRequestParamsDto extends createZodDto(ruleRequestParamsSchema) {}
export class RuleInflationQueryDto extends createZodDto(ruleInflationQuerySchema) {}
