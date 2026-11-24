import { Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request, Response } from 'express';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import { API_ERROR_CODES } from '@khums/validation';

import { ApiProblemException } from '../common/errors/api-problem.exception';
import { ALLOW_PASSWORD_CHANGE_SESSION } from './staff-authenticated.decorator';
import {
  StaffAuthService,
  type AuthenticationFailure,
  type RequestFacts,
} from './staff-auth.service';
import { STAFF_CHALLENGE } from './staff-authorization.service';
import type { StaffAuthConfig } from '../config/app-config';
import { resolveClientIp } from './client-ip';
import { clearStaffCookies, cookieNames, readCookie } from './staff-cookies';
import { attachStaffAuthentication } from './staff-request';

/** The request facts the auth service needs (cookie, CSRF headers, client IP, request id). */
export function requestFacts(
  request: Request,
  settings: StaffAuthConfig | null,
  nowMs: number,
): RequestFacts {
  const id = request.headers['x-request-id'];
  const names = settings === null ? null : cookieNames(settings);
  const client = resolveClientIp({
    headers: request.headers,
    method: request.method,
    path: request.originalUrl.split('?')[0] ?? request.originalUrl,
    peerAddress: request.socket.remoteAddress,
    edgeSecret: settings?.edgeSecret ?? null,
    nowMs,
  });
  return {
    method: request.method,
    headers: request.headers,
    sessionToken: names === null ? undefined : readCookie(request.headers.cookie, names.session),
    deviceCookie: names === null ? undefined : readCookie(request.headers.cookie, names.device),
    // Never X-Forwarded-For / request.ip: only the web tier's signed assertion or the TCP peer.
    clientIp: client.ip,
    clientIpSource: client.source,
    requestId: typeof id === 'string' ? id.slice(0, 200) : null,
  };
}

/**
 * Authentication guard for staff routes only (M4.6.2b). Applied per controller with
 * `@StaffAuthenticated()`, never globally, so public routes stay anonymous.
 *
 * The only credential is the server-side session cookie. Authorization headers, role headers,
 * query parameters and bodies are ignored. Unsafe methods must also pass the Origin,
 * Sec-Fetch-Site and session-bound CSRF token checks. Every staff response is `no-store`.
 */
@Injectable()
export class StaffAuthGuard implements CanActivate {
  constructor(
    private readonly auth: StaffAuthService,
    private readonly reflector: Reflector,
    @InjectPinoLogger(StaffAuthGuard.name) private readonly logger: PinoLogger,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const http = context.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();
    response.setHeader('Cache-Control', 'no-store');
    const settings = this.auth.settings;
    const result = await this.auth.authenticate(requestFacts(request, settings, this.auth.now()));
    if (!result.ok) {
      // Reason codes only: never cookies, tokens or identifiers.
      this.logger.warn({ reason: reasonOf(result.error) }, 'Staff request refused');
      if (
        settings !== null &&
        ['REAUTHENTICATION_REQUIRED', 'SESSION_REVOKED', 'ACCOUNT_NOT_ACTIVE'].includes(
          result.error.kind,
        )
      ) {
        clearStaffCookies(response, settings);
      }
      throw problemFor(result.error);
    }
    const allowTemporary = this.reflector.getAllAndOverride<boolean | undefined>(
      ALLOW_PASSWORD_CHANGE_SESSION,
      [context.getHandler(), context.getClass()],
    );
    if (result.value.session.passwordChangeOnly && allowTemporary !== true) {
      throw new ApiProblemException(
        403,
        API_ERROR_CODES.PASSWORD_CHANGE_REQUIRED,
        'Change the temporary password before continuing.',
      );
    }
    attachStaffAuthentication(request, result.value);
    return true;
  }
}

const reasonOf = (failure: AuthenticationFailure): string =>
  failure.kind === 'CSRF_REJECTED' ? failure.reason : failure.kind;

export function problemFor(failure: AuthenticationFailure): ApiProblemException {
  switch (failure.kind) {
    case 'AUTHENTICATION_REQUIRED':
      return new ApiProblemException(
        401,
        API_ERROR_CODES.AUTHENTICATION_REQUIRED,
        'Staff sign-in is required.',
        STAFF_CHALLENGE,
      );
    case 'REAUTHENTICATION_REQUIRED':
      return new ApiProblemException(
        401,
        API_ERROR_CODES.REAUTHENTICATION_REQUIRED,
        'The session has ended. Sign in again.',
        STAFF_CHALLENGE,
      );
    case 'SESSION_REVOKED':
      return new ApiProblemException(
        401,
        API_ERROR_CODES.SESSION_REVOKED,
        'The session has been revoked. Sign in again.',
        STAFF_CHALLENGE,
      );
    case 'ACCOUNT_NOT_ACTIVE':
      return new ApiProblemException(
        403,
        API_ERROR_CODES.ACCOUNT_NOT_ACTIVE,
        'This staff account is not active.',
      );
    case 'CSRF_REJECTED':
      return new ApiProblemException(
        403,
        API_ERROR_CODES.CSRF_REJECTED,
        'The request was refused.',
      );
    case 'ACCESS_DENIED':
      return new ApiProblemException(403, API_ERROR_CODES.ACCESS_DENIED, 'Access denied.');
    case 'UNAVAILABLE':
      return new ApiProblemException(
        503,
        API_ERROR_CODES.AUTHENTICATION_UNAVAILABLE,
        'Staff authentication is currently unavailable.',
      );
  }
}
