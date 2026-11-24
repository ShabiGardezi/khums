import {
  createResearchRecordRequestSchema,
  createRulingVersionRequestSchema,
  evidenceListQuerySchema,
  evidenceParamsSchema,
  researchEntityParamsSchema,
  researchListQuerySchema,
  researchRevisionParamsSchema,
  researchTransitionParamsSchema,
  researchTransitionRequestSchema,
  researchTypeParamsSchema,
  reviseResearchRecordRequestSchema,
  rulingParamsSchema,
  uploadEvidenceRequestSchema,
} from '@khums/validation';

import { createZodDto } from '../common/pipes/zod-validation.pipe';

/** Request DTOs for research routes (M5.3.3): shared strict Zod contracts, never declared here. */
export class ResearchTypeParamsDto extends createZodDto(researchTypeParamsSchema) {}
export class ResearchEntityParamsDto extends createZodDto(researchEntityParamsSchema) {}
export class ResearchRevisionParamsDto extends createZodDto(researchRevisionParamsSchema) {}
export class ResearchTransitionParamsDto extends createZodDto(researchTransitionParamsSchema) {}
export class ResearchListQueryDto extends createZodDto(researchListQuerySchema) {}
export class CreateResearchRecordDto extends createZodDto(createResearchRecordRequestSchema) {}
export class ReviseResearchRecordDto extends createZodDto(reviseResearchRecordRequestSchema) {}
export class ResearchTransitionDto extends createZodDto(researchTransitionRequestSchema) {}
export class UploadEvidenceDto extends createZodDto(uploadEvidenceRequestSchema) {}
export class EvidenceParamsDto extends createZodDto(evidenceParamsSchema) {}
export class EvidenceListQueryDto extends createZodDto(evidenceListQuerySchema) {}
export class RulingParamsDto extends createZodDto(rulingParamsSchema) {}
export class CreateRulingVersionDto extends createZodDto(createRulingVersionRequestSchema) {}
