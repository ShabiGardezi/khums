import { Inject, Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

import { API_ERROR_CODES } from '@khums/validation';

import { CLOCK, type Clock } from '../../auth/auth.tokens';
import { resolveClientIp } from '../../auth/client-ip';
import { InjectAppConfig, type AppConfig } from '../../config';
import { API_PREFIX } from '../../shared/http/constants';
import { ApiProblemException } from '../errors/api-problem.exception';

/** The only route reachable without the edge signature: the host's liveness probe. */
const HEALTH_PATH = `/${API_PREFIX}/health`;

const pathOf = (request: Request): string =>
  request.originalUrl.split('?')[0] ?? request.originalUrl;

/**
 * True when the request must be refused: edge signatures are required and this request (other
 * than `GET`/`HEAD` of the health check) has no valid, fresh HMAC signature over its client IP,
 * time, method and path (the same assertion the staff guard uses for throttling).
 */
export function lacksEdgeSignature(
  request: Request,
  edge: AppConfig['edgeSignature'],
  nowMs: number,
): boolean {
  if (!edge.required) return false;
  const path = pathOf(request);
  if ((request.method === 'GET' || request.method === 'HEAD') && path === HEALTH_PATH) return false;
  if (edge.secret === null) return true;
  const client = resolveClientIp({
    headers: request.headers,
    method: request.method,
    path,
    peerAddress: request.socket.remoteAddress,
    edgeSecret: edge.secret,
    nowMs,
  });
  return client.source !== 'SIGNED_EDGE';
}

/**
 * Private deployment guard (M4.7; docs/DEPLOYMENT_FREE_TIER.md §4). Global, before every other
 * guard: with `KHUMS_REQUIRE_EDGE_SIGNATURE`, the API answers only requests forwarded by the web
 * tier (Vercel `proxy.ts` for browser requests, the server staff client for Server Components).
 * A request to the API host's public URL gets 403 without reaching authentication. It adds a
 * gate; it replaces none: sessions, CSRF and authorization still apply to every forwarded request.
 */
@Injectable()
export class EdgeSignatureGuard implements CanActivate {
  constructor(
    @InjectAppConfig() private readonly config: AppConfig,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    if (lacksEdgeSignature(request, this.config.edgeSignature, this.clock.now())) {
      throw new ApiProblemException(
        403,
        API_ERROR_CODES.EDGE_SIGNATURE_REQUIRED,
        'This API accepts requests only through the web application.',
      );
    }
    return true;
  }
}
