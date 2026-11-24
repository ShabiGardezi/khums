import { Injectable, type OnApplicationShutdown } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

/**
 * Graceful shutdown: `enableShutdownHooks()` makes Nest close the HTTP server (finishing
 * in-flight requests) and run every `onModuleDestroy` / `onApplicationShutdown` hook on
 * SIGTERM/SIGINT. Database connections will close through the same hooks (Milestone 6).
 */
@Injectable()
export class ShutdownLoggerService implements OnApplicationShutdown {
  constructor(@InjectPinoLogger(ShutdownLoggerService.name) private readonly logger: PinoLogger) {}

  onApplicationShutdown(signal?: string): void {
    this.logger.info({ signal }, 'Application shut down');
  }
}
