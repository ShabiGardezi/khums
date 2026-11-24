/**
 * Commands that never need a database (M5.3.3 plan R4, local development safety): OpenAPI
 * generation and the printers. For them the local `.env` (which may hold the real Atlas URI) is
 * not loaded, and any `MONGODB_URI` already exported is dropped before configuration is parsed,
 * so no MongoDB client is ever constructed with real credentials. Values are never printed.
 */
export const NO_DATABASE_FLAGS = [
  '--generate-openapi',
  '--print-migration-manifest',
  '--print-database-roles',
] as const;

export const needsNoDatabase = (argv: readonly string[]): boolean =>
  NO_DATABASE_FLAGS.some((flag) => argv.includes(flag));

export function environmentForCommand(
  argv: readonly string[],
  env: Readonly<Record<string, string | undefined>>,
): Readonly<Record<string, string | undefined>> {
  if (!needsNoDatabase(argv)) return env;
  const { MONGODB_URI: _dropped, ...rest } = env;
  return rest;
}
