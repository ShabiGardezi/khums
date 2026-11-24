import { describe, expect, it } from 'vitest';

import { environmentForCommand, loadConfig, needsNoDatabase } from './index';

/** No-database commands never see a real Atlas URI (M5.3.3 plan R4). */
const env = {
  NODE_ENV: 'development',
  LOG_LEVEL: 'silent',
  MONGODB_URI: 'mongodb+srv://placeholder:placeholder@placeholder.invalid/',
};

describe('command environment', () => {
  it('drops MONGODB_URI for OpenAPI and the printers, so no database client is configured', () => {
    for (const flag of [
      '--generate-openapi',
      '--print-migration-manifest',
      '--print-database-roles',
    ]) {
      const argv = ['node', 'main.js', flag];
      expect(needsNoDatabase(argv)).toBe(true);
      const config = loadConfig(environmentForCommand(argv, env));
      expect(config.ok && config.value.mongodb.uri).toBeUndefined();
    }
  });

  it('keeps the environment for commands that need the database', () => {
    const argv = ['node', 'main.js', '--inventory-database'];
    expect(needsNoDatabase(argv)).toBe(false);
    expect(environmentForCommand(argv, env)).toBe(env);
  });
});
