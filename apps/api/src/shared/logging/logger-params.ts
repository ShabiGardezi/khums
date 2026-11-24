import { randomUUID } from 'node:crypto';

import type { Params } from 'nestjs-pino';

import type { AppConfig } from '../../config';
import { API_PREFIX } from '../http/constants';

const REQUEST_ID_PATTERN = /^[\w-]{1,64}$/;

/**
 * Structured JSON logging (pino). Logs never contain request/response bodies, query strings,
 * auth headers or cookies — financial data must never reach logs (docs/SECURITY.md §7).
 */
export function createLoggerParams(config: AppConfig): Params {
  return {
    pinoHttp: {
      level: config.logging.level,
      base: { service: 'khums-api', env: config.env },
      ...(config.logging.format === 'pretty'
        ? { transport: { target: 'pino-pretty', options: { singleLine: true } } }
        : {}),
      redact: {
        paths: [
          'req.headers.authorization',
          'req.headers.cookie',
          'req.headers["x-api-key"]',
          'res.headers["set-cookie"]',
        ],
        censor: '[REDACTED]',
      },
      genReqId: (req, res) => {
        const incoming = req.headers['x-request-id'];
        const id =
          typeof incoming === 'string' && REQUEST_ID_PATTERN.test(incoming)
            ? incoming
            : randomUUID();
        res.setHeader('x-request-id', id);
        return id;
      },
      serializers: {
        req: (req: { id?: unknown; method?: string; url?: string }) => ({
          id: req.id,
          method: req.method,
          path: req.url?.split('?')[0],
        }),
        res: (res: { statusCode?: number }) => ({ statusCode: res.statusCode }),
      },
      customLogLevel: (_req, res, error) =>
        error !== undefined || res.statusCode >= 500
          ? 'error'
          : res.statusCode >= 400
            ? 'warn'
            : 'info',
      autoLogging: { ignore: (req) => req.url?.startsWith(`/${API_PREFIX}/health`) ?? false },
    },
  };
}
