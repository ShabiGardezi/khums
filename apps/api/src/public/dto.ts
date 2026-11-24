import { publicMarjaParamsSchema } from '@khums/validation';

import { createZodDto } from '../common/pipes/zod-validation.pipe';

/** Request DTOs for the public calculator (decision 65): shared strict Zod contracts. */
export class PublicMarjaParamsDto extends createZodDto(publicMarjaParamsSchema) {}
