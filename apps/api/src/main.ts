import 'reflect-metadata';

import { writeFile } from 'node:fs/promises';

import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Logger } from 'nestjs-pino';

import { AppModule } from './app.module';
import {
  hasCheckpointSigningKey,
  environmentForCommand,
  hasBackupKey,
  hasEvidenceRotationKey,
  loadBackupKey,
  loadEvidenceRotationKey,
  loadCheckpointSigningConfig,
  loadConfig,
  loadEnvFileForLocalDevelopment,
  needsNoDatabase,
  type AppConfig,
} from './config';
import {
  bootstrap as bootstrapSuperAdminCommand,
  createCheckpoints,
  exportCheckpoints,
  inventory,
  liftMaintenanceFenceCommand,
  resetIntegrationRun,
  restorePreproductionBackupCommand,
  verifyPreproductionBackupCommand,
  migrate,
  migrateResearch,
  printDatabaseRoles,
  printMigrationManifest,
  terminalPrompt,
  verify,
  withDatabase,
  type CommandResult,
} from './persistence/operator-commands';
import {
  backupEvidenceCommand,
  deleteEvidenceOrphansCommand,
  evidenceOrphansCommand,
  graceFromArgs,
  restoreEvidenceCommand,
  rotateEvidenceKeyCommand,
  verifyEvidenceBackupCommand,
  verifyEvidenceCommand,
} from './research/evidence-commands';
import { configureApp } from './shared/http/configure-app';
import { API_PREFIX } from './shared/http/constants';
import { createOpenApiDocument } from './shared/openapi/create-openapi-document';

async function generateOpenApi(config: AppConfig, outputPath: string): Promise<void> {
  const quiet: AppConfig = { ...config, logging: { ...config.logging, level: 'silent' } };
  const app = await NestFactory.create<NestExpressApplication>(AppModule.register(quiet), {
    logger: false,
  });
  configureApp(app, { ...quiet, swagger: { enabled: false } });
  const document = createOpenApiDocument(app);
  await writeFile(outputPath, `${JSON.stringify(document, null, 2)}\n`);
  await app.close();
  process.stdout.write(`OpenAPI document written to ${outputPath}\n`);
}

/** Operator commands (M4.6.3a). Returns null when no operator flag is given. */
async function runOperatorCommand(config: AppConfig): Promise<CommandResult | null> {
  const argv = process.argv;
  const bootstrapFlag = argv.indexOf('--bootstrap-super-admin');
  if (bootstrapFlag !== -1) {
    return bootstrapSuperAdminCommand(config, argv[bootstrapFlag + 1], terminalPrompt, () =>
      Date.now(),
    );
  }
  if (argv.includes('--print-database-roles')) return printDatabaseRoles(config);
  if (argv.includes('--print-migration-manifest')) return printMigrationManifest();
  // READ-ONLY: what exists in the database (names, counts, indexes); writes nothing.
  if (argv.includes('--inventory-database')) return inventory(config);
  const resetCommand = [
    '--reset-integration-test-run',
    '--lift-maintenance-fence',
    '--restore-preproduction-backup',
    '--verify-preproduction-backup',
  ].find((flag) => argv.includes(flag));
  if (resetCommand !== undefined) {
    const value = (flag: string) =>
      argv.includes(flag) ? argv[argv.indexOf(flag) + 1] : undefined;
    // The key comes from the environment only (entered with `read -rs`), never an argument.
    // Lifting a fence restores validators from the manifest and never needs the key.
    const needsKey = resetCommand !== '--lift-maintenance-fence';
    const key = needsKey
      ? loadBackupKey(process.env)
      : { ok: true as const, value: new Uint8Array(0) };
    if (!key.ok) return { exitCode: 1, output: { error: 'BACKUP_KEY_INVALID', issues: key.error } };
    const positional = value(resetCommand);
    const input = {
      runId: resetCommand === '--reset-integration-test-run' ? positional : value('--run'),
      backupFile:
        resetCommand === '--restore-preproduction-backup' ||
        resetCommand === '--verify-preproduction-backup'
          ? positional
          : value('--backup'),
      manifestFile: value('--manifest'),
      confirmation: value('--confirm'),
      backupKey: key.value,
    };
    switch (resetCommand) {
      case '--reset-integration-test-run':
        return resetIntegrationRun(config, input, () => Date.now());
      case '--lift-maintenance-fence':
        return liftMaintenanceFenceCommand(config, input);
      case '--restore-preproduction-backup':
        return restorePreproductionBackupCommand(config, input);
      default:
        return verifyPreproductionBackupCommand(input);
    }
  }
  if (argv.includes('--migrate-database')) return migrate(config);
  // ADDITIVE: creates only the missing research collections; touches nothing else.
  if (argv.includes('--migrate-research-collections')) return migrateResearch(config);
  if (argv.includes('--create-integrity-checkpoints')) {
    const signing = loadCheckpointSigningConfig(process.env);
    if (!signing.ok)
      return { exitCode: 1, output: { error: 'SIGNING_CONFIG_INVALID', issues: signing.error } };
    const archiveFlag = argv.indexOf('--archive');
    const archiveFile = archiveFlag === -1 ? undefined : argv[archiveFlag + 1];
    if (archiveFlag !== -1 && (archiveFile === undefined || archiveFile.startsWith('--'))) {
      return { exitCode: 1, output: { error: 'ARCHIVE_FILE_REQUIRED' } };
    }
    return createCheckpoints(config, signing.value, () => Date.now(), archiveFile);
  }
  const exportFlag = argv.indexOf('--export-integrity-checkpoints');
  if (exportFlag !== -1) return exportCheckpoints(config, argv[exportFlag + 1]);
  const verifyFlag = argv.indexOf('--verify-integrity');
  if (verifyFlag !== -1) return verify(config, argv[verifyFlag + 1]);
  return runEvidenceCommand(config, argv);
}

/** Evidence operator commands (M5.3.3 hardening; maintainer machine only, never production). */
async function runEvidenceCommand(
  config: AppConfig,
  argv: readonly string[],
): Promise<CommandResult | null> {
  const after = (flag: string) => argv[argv.indexOf(flag) + 1];
  const grace = graceFromArgs(argv);
  if (argv.includes('--evidence-orphans')) {
    if (grace === null) return { exitCode: 1, output: { error: 'GRACE_DAYS_INVALID' } };
    return evidenceOrphansCommand(config, withDatabase, () => Date.now(), grace);
  }
  if (argv.includes('--delete-evidence-orphans')) {
    if (grace === null) return { exitCode: 1, output: { error: 'GRACE_DAYS_INVALID' } };
    const confirmation = argv.includes('--confirm') ? after('--confirm') : undefined;
    return deleteEvidenceOrphansCommand(
      config,
      withDatabase,
      () => Date.now(),
      grace,
      after('--delete-evidence-orphans'),
      confirmation,
    );
  }
  if (argv.includes('--verify-evidence')) return verifyEvidenceCommand(config, withDatabase);
  if (argv.includes('--backup-evidence')) {
    return backupEvidenceCommand(config, after('--backup-evidence'));
  }
  if (argv.includes('--verify-evidence-backup')) {
    return verifyEvidenceBackupCommand(config, after('--verify-evidence-backup'));
  }
  if (argv.includes('--restore-evidence')) {
    return restoreEvidenceCommand(config, after('--restore-evidence'));
  }
  if (argv.includes('--rotate-evidence-key')) {
    const newKey = loadEvidenceRotationKey(process.env);
    if (!newKey.ok) {
      return { exitCode: 1, output: { error: 'ROTATION_KEY_INVALID', issues: newKey.error } };
    }
    return rotateEvidenceKeyCommand(config, after('--rotate-evidence-key'), newKey.value);
  }
  return null;
}

async function bootstrap(): Promise<void> {
  // No-database commands (OpenAPI, printers) never read the local .env or a real MONGODB_URI.
  if (!needsNoDatabase(process.argv)) loadEnvFileForLocalDevelopment();

  const config = loadConfig(environmentForCommand(process.argv, process.env));
  if (!config.ok) {
    process.stderr.write(
      `Invalid API configuration:\n${config.error.map((issue) => `  - ${issue}`).join('\n')}\n`,
    );
    process.exit(1);
  }

  const openApiFlag = process.argv.indexOf('--generate-openapi');
  if (openApiFlag !== -1) {
    await generateOpenApi(config.value, process.argv[openApiFlag + 1] ?? 'openapi.json');
    return;
  }

  const command = await runOperatorCommand(config.value);
  if (command !== null) {
    process.stdout.write(`${JSON.stringify(command.output, null, 2)}\n`);
    process.exitCode = command.exitCode;
    return;
  }

  // The pre-production backup key belongs only to the reset family (never the API runtime).
  if (hasBackupKey(process.env)) {
    process.stderr.write(
      'Refusing to start: KHUMS_BACKUP_KEY must not be present in the API runtime.\n',
    );
    process.exit(1);
  }

  // A key-rotation key belongs only to `--rotate-evidence-key` (never the API runtime).
  if (hasEvidenceRotationKey(process.env)) {
    process.stderr.write(
      'Refusing to start: KHUMS_EVIDENCE_NEW_KEY must not be present in the API runtime.\n',
    );
    process.exit(1);
  }

  // The checkpoint signing key belongs only to the checkpoint job (AUTH_ARCHITECTURE §4.11).
  if (hasCheckpointSigningKey(process.env)) {
    process.stderr.write(
      'Refusing to start: AUDIT_CHECKPOINT_SIGNING_KEY must not be present in the API runtime.\n',
    );
    process.exit(1);
  }

  const app = await NestFactory.create<NestExpressApplication>(AppModule.register(config.value), {
    bufferLogs: true,
  });
  const logger = app.get(Logger);
  app.useLogger(logger);
  configureApp(app, config.value);

  await app.listen(config.value.port, config.value.host);
  logger.log(
    `API listening on http://${config.value.host}:${config.value.port}/${API_PREFIX}` +
      (config.value.swagger.enabled ? ' (docs: /api/docs)' : ''),
    'Bootstrap',
  );
}

bootstrap().catch((error: unknown) => {
  process.stderr.write(`Fatal error during startup: ${String(error)}\n`);
  process.exit(1);
});
