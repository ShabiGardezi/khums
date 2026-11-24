import type { Db, Document } from 'mongodb';

import { ALL_COLLECTIONS, type CollectionSpec } from './collections';

/**
 * Creates or updates every collection's validator and indexes (M4.6.3a). Idempotent: safe to run
 * on every deploy and concurrently. Run by an operator with the `khumsMigrator` role
 * (`node dist/main.js --migrate-database`), never by the API runtime, whose role cannot change
 * schemas or indexes. Reports collection names only.
 */

export function validatorOf(spec: CollectionSpec): Document {
  return {
    $jsonSchema: {
      bsonType: 'object',
      required: [...spec.required],
    },
  };
}

export interface MigrationReport {
  readonly created: readonly string[];
  readonly updated: readonly string[];
}

/** The subset of the driver's `Db` the migration uses (keeps it testable without a server). */
export type MigrationDb = Pick<
  Db,
  'listCollections' | 'createCollection' | 'command' | 'collection'
>;

export async function migrateDatabase(db: MigrationDb): Promise<MigrationReport> {
  const existing = new Set(
    (await db.listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name),
  );
  const created: string[] = [];
  const updated: string[] = [];
  for (const spec of ALL_COLLECTIONS) {
    const validation = {
      validator: validatorOf(spec),
      validationLevel: 'strict',
      validationAction: 'error',
    } as const;
    if (existing.has(spec.name)) {
      await db.command({ collMod: spec.name, ...validation });
      updated.push(spec.name);
    } else {
      try {
        await db.createCollection(spec.name, validation);
        created.push(spec.name);
      } catch {
        // Created concurrently by another migrator: apply the validator instead.
        await db.command({ collMod: spec.name, ...validation });
        updated.push(spec.name);
      }
    }
    await db.collection(spec.name).createIndexes(
      spec.indexes.map((index) => ({
        name: index.name,
        key: { ...index.key },
        ...('unique' in index ? { unique: true } : {}),
        ...('expireAfterSeconds' in index ? { expireAfterSeconds: index.expireAfterSeconds } : {}),
      })),
    );
  }
  return { created, updated };
}

/** The collections added by M5.3.3 (research evidence layer) and M5.3.4 (findings, rulings). */
export const RESEARCH_COLLECTION_NAMES = [
  'researchSources',
  'sourcePassages',
  'passageTranslations',
  'evidenceArtefacts',
  'researchFindings',
  'religiousRulings',
] as const;

export interface AdditiveMigrationReport {
  readonly created: readonly string[];
  /** Already present: left exactly as they are (no validator or index change). */
  readonly alreadyPresent: readonly string[];
}

/**
 * ADDITIVE, research-only migration (M5.3.3; docs/ATLAS_INTEGRATION_TEST_PLAN.md step 1): creates
 * the four research collections with their validators and indexes ONLY if they do not exist. It
 * never touches any other collection, never changes an existing collection (no `collMod`), and
 * seeds nothing (unlike `migrateDatabase`, which also re-applies every validator and seeds the
 * governance policy registry).
 */
export async function migrateResearchCollections(
  db: MigrationDb,
): Promise<AdditiveMigrationReport> {
  const existing = new Set(
    (await db.listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name),
  );
  const created: string[] = [];
  const alreadyPresent: string[] = [];
  for (const spec of ALL_COLLECTIONS.filter((s) =>
    (RESEARCH_COLLECTION_NAMES as readonly string[]).includes(s.name),
  )) {
    if (existing.has(spec.name)) {
      alreadyPresent.push(spec.name);
      continue;
    }
    await db.createCollection(spec.name, {
      validator: validatorOf(spec),
      validationLevel: 'strict',
      validationAction: 'error',
    });
    await db.collection(spec.name).createIndexes(
      spec.indexes.map((index) => ({
        name: index.name,
        key: { ...index.key },
        ...('unique' in index ? { unique: true } : {}),
      })),
    );
    created.push(spec.name);
  }
  return { created, alreadyPresent };
}
