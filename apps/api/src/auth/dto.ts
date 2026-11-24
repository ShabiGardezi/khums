import {
  createStaffAccountRequestSchema,
  grantStaffRoleRequestSchema,
  replaceStaffRoleRequestSchema,
  setStaffAccountStatusRequestSchema,
  staffAccountParamsSchema,
  staffAdministrationReasonRequestSchema,
  staffLoginRequestSchema,
  staffPasswordChangeRequestSchema,
  staffRoleParamsSchema,
} from '@khums/validation';

import { createZodDto } from '../common/pipes/zod-validation.pipe';

/** Request DTOs for staff routes (M4.6.2b): shared strict Zod contracts, never declared here. */
export class StaffLoginDto extends createZodDto(staffLoginRequestSchema) {}
export class StaffPasswordChangeDto extends createZodDto(staffPasswordChangeRequestSchema) {}
export class CreateStaffAccountDto extends createZodDto(createStaffAccountRequestSchema) {}
export class StaffReasonDto extends createZodDto(staffAdministrationReasonRequestSchema) {}
export class SetStaffAccountStatusDto extends createZodDto(setStaffAccountStatusRequestSchema) {}
export class GrantStaffRoleDto extends createZodDto(grantStaffRoleRequestSchema) {}
export class ReplaceStaffRoleDto extends createZodDto(replaceStaffRoleRequestSchema) {}
export class StaffAccountParamsDto extends createZodDto(staffAccountParamsSchema) {}
export class StaffRoleParamsDto extends createZodDto(staffRoleParamsSchema) {}
