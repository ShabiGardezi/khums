import { Body, Controller, HttpCode, Post, Req, Res } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';

import { API_ERROR_CODES, type StaffLoginResponse } from '@khums/validation';

import {
  ApiContractResponse,
  ApiProblemResponses,
} from '../common/decorators/api-responses.decorator';
import { ApiProblemException } from '../common/errors/api-problem.exception';
import { checkRequestOrigin } from './csrf';
import { StaffLoginDto, StaffPasswordChangeDto } from './dto';
import { requestFacts } from './staff-auth.guard';
import {
  StaffAuthService,
  type IssuedSession,
  type PasswordChangeFailure,
} from './staff-auth.service';
import { AllowPasswordChangeSession, StaffAuthenticated } from './staff-authenticated.decorator';
import { STAFF_CHALLENGE } from './staff-authorization.service';
import { clearStaffCookies, setStaffCookies } from './staff-cookies';
import { staffAuthenticationOf, type StaffAuthentication } from './staff-request';

const ref = (id: string) => ({ schema: { $ref: `#/components/schemas/${id}` } });

function failureProblem(failure: PasswordChangeFailure): ApiProblemException {
  switch (failure.kind) {
    case 'UNAVAILABLE':
      return new ApiProblemException(
        503,
        API_ERROR_CODES.AUTHENTICATION_UNAVAILABLE,
        'Staff sign-in is currently unavailable.',
      );
    case 'INVALID_CREDENTIALS':
      return new ApiProblemException(
        401,
        API_ERROR_CODES.INVALID_CREDENTIALS,
        'The username or password is not correct.',
        STAFF_CHALLENGE,
      );
    case 'THROTTLED':
      return new ApiProblemException(
        429,
        API_ERROR_CODES.LOGIN_THROTTLED,
        'Too many attempts. Wait and try again.',
      );
    case 'ACCOUNT_NOT_ACTIVE':
      return new ApiProblemException(
        403,
        API_ERROR_CODES.ACCOUNT_NOT_ACTIVE,
        'This staff account is not active.',
      );
    case 'TEMPORARY_PASSWORD_EXPIRED':
      return new ApiProblemException(
        401,
        API_ERROR_CODES.TEMPORARY_PASSWORD_EXPIRED,
        'The temporary password has expired. Ask an administrator for a new one.',
        STAFF_CHALLENGE,
      );
    case 'PASSWORD_POLICY_VIOLATION':
      return new ApiProblemException(
        422,
        API_ERROR_CODES.PASSWORD_POLICY_VIOLATION,
        `The new password does not meet the policy (${failure.issue}).`,
      );
    case 'PASSWORD_REUSED':
      return new ApiProblemException(
        422,
        API_ERROR_CODES.PASSWORD_REUSED,
        'Choose a password different from the current one.',
      );
    case 'CONFLICT':
      return new ApiProblemException(
        409,
        API_ERROR_CODES.ADMINISTRATION_CONFLICT,
        'The account changed meanwhile. Try again.',
      );
  }
}

/**
 * Staff sign-in, sign-out and password change (M4.6.2b). Reached by browsers only through the web
 * origin's `/api/v1/*` rewrite, so cookies are first-party. Every response is `no-store`.
 */
@ApiTags('staff-auth')
@Controller('staff/auth')
export class StaffAuthController {
  constructor(private readonly auth: StaffAuthService) {}

  private respond(response: Response, session: IssuedSession): StaffLoginResponse {
    const settings = this.auth.settings;
    if (settings === null) throw failureProblem({ kind: 'UNAVAILABLE' });
    setStaffCookies(response, settings, session);
    return {
      mustChangePassword: session.mustChangePassword,
      sessionExpiresAt: session.sessionExpiresAt,
    };
  }

  @Post('login')
  @HttpCode(200)
  @ApiOperation({ summary: 'Staff sign-in (username and password)', operationId: 'staffLogin' })
  @ApiBody(ref('StaffLoginRequest'))
  @ApiContractResponse(200, 'StaffLoginResponse', 'Signed in; session and CSRF cookies set.')
  @ApiProblemResponses(400, 401, 403, 429, 503)
  async login(
    @Body() body: StaffLoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StaffLoginResponse> {
    response.setHeader('Cache-Control', 'no-store');
    const settings = this.auth.settings;
    if (settings === null) throw failureProblem({ kind: 'UNAVAILABLE' });
    // Login CSRF: the same Origin and Sec-Fetch-Site checks as every unsafe staff request.
    if (checkRequestOrigin(request.headers, settings.allowedOrigins) !== null) {
      throw new ApiProblemException(403, API_ERROR_CODES.CSRF_REJECTED, 'The request was refused.');
    }
    const result = await this.auth.login(body, requestFacts(request, settings, this.auth.now()));
    if (!result.ok) {
      if (result.error.kind === 'THROTTLED') {
        response.setHeader('Retry-After', String(result.error.retryAfterSeconds));
      }
      throw failureProblem(result.error);
    }
    return this.respond(response, result.value);
  }

  @Post('logout')
  @HttpCode(204)
  @StaffAuthenticated()
  @AllowPasswordChangeSession()
  @ApiOperation({ summary: 'Staff sign-out (revokes this session)', operationId: 'staffLogout' })
  @ApiProblemResponses(401, 403, 503)
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    const auth = authenticated(request);
    await this.auth.logout(auth, requestFacts(request, null, 0).requestId);
    const settings = this.auth.settings;
    if (settings !== null) clearStaffCookies(response, settings);
  }

  @Post('password')
  @HttpCode(200)
  @StaffAuthenticated()
  @AllowPasswordChangeSession()
  @ApiOperation({
    summary: 'Change own password (revokes every session, issues a new one)',
    operationId: 'staffChangePassword',
  })
  @ApiBody(ref('StaffPasswordChangeRequest'))
  @ApiContractResponse(200, 'StaffLoginResponse', 'Password changed; new session cookies set.')
  @ApiProblemResponses(400, 401, 403, 409, 422, 429, 503)
  async changePassword(
    @Body() body: StaffPasswordChangeDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StaffLoginResponse> {
    const result = await this.auth.changePassword(
      authenticated(request),
      body,
      requestFacts(request, this.auth.settings, this.auth.now()),
    );
    if (!result.ok) throw failureProblem(result.error);
    return this.respond(response, result.value);
  }
}

export function authenticated(request: Request): StaffAuthentication {
  const auth = staffAuthenticationOf(request);
  // The guard always attaches it; reaching here without it is a server fault (500, not 200).
  if (auth === undefined) throw new Error('staff guard did not run');
  return auth;
}
