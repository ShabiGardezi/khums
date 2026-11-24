import { existsSync } from 'node:fs';

/**
 * Loads `.env` for local development only. Production configuration must come from the real
 * environment (platform secret store). Existing variables are never overridden.
 */
export function loadEnvFileForLocalDevelopment(path = '.env'): void {
  if (process.env.NODE_ENV === 'production') return;
  if (existsSync(path)) process.loadEnvFile(path);
}
