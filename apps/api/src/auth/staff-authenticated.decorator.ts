import { applyDecorators, SetMetadata, UseGuards } from '@nestjs/common';
import { ApiCookieAuth } from '@nestjs/swagger';

import { StaffAuthGuard } from './staff-auth.guard';

/** Metadata: the route stays available to a session signed in with a temporary password. */
export const ALLOW_PASSWORD_CHANGE_SESSION = 'khums:allow-password-change-session';

/** Marks a controller or handler as a staff (administrative) route. Never applied globally. */
export const StaffAuthenticated = (): MethodDecorator & ClassDecorator =>
  applyDecorators(UseGuards(StaffAuthGuard), ApiCookieAuth('staff-session'));

/**
 * Allows a temporary-password session (password change, sign-out, own session view). Every other
 * staff route refuses it with `PASSWORD_CHANGE_REQUIRED`.
 */
export const AllowPasswordChangeSession = (): MethodDecorator & ClassDecorator =>
  SetMetadata(ALLOW_PASSWORD_CHANGE_SESSION, true);
