import { ALL_COLLECTIONS, COLLECTIONS, type CollectionSpec } from './collections';

/**
 * Least-privilege MongoDB Atlas custom roles (M4.6.3a; docs/DATABASE_SCHEMA.md §3.9), derived
 * from the collection specs so a new collection cannot be added without a decision on its access.
 * Printed in Atlas Admin API format by `node dist/main.js --print-database-roles` and created in
 * Atlas by an operator (the application never creates roles or users).
 */

/** Atlas privilege action names used here. */
export type AtlasAction =
  | 'FIND'
  | 'INSERT'
  | 'UPDATE'
  | 'CREATE_COLLECTION'
  | 'CREATE_INDEX'
  | 'COLL_MOD'
  | 'LIST_COLLECTIONS'
  | 'LIST_INDEXES';

export interface AtlasCustomRole {
  readonly roleName: 'khumsApp' | 'khumsCheckpoint' | 'khumsMigrator';
  readonly actions: readonly {
    readonly action: AtlasAction;
    readonly resources: readonly { readonly db: string; readonly collection: string }[];
  }[];
  readonly inheritedRoles: readonly never[];
}

type Grant = readonly [collection: string, actions: readonly AtlasAction[]];

const appGrant = (spec: CollectionSpec): Grant => [
  spec.name,
  spec.access === 'APPEND_ONLY' ? ['FIND', 'INSERT'] : ['FIND', 'INSERT', 'UPDATE'],
];

const CHAINED = [
  COLLECTIONS.auditEvents.name,
  COLLECTIONS.governanceLedgerRecords.name,
  COLLECTIONS.governancePolicyRegistry.name,
  // Research revision chains, checkpointed from their first collection (M5.3.3).
  COLLECTIONS.researchSources.name,
  COLLECTIONS.sourcePassages.name,
  COLLECTIONS.passageTranslations.name,
  COLLECTIONS.researchFindings.name,
  COLLECTIONS.religiousRulings.name,
];

function role(
  roleName: AtlasCustomRole['roleName'],
  db: string,
  grants: readonly Grant[],
): AtlasCustomRole {
  const byAction = new Map<AtlasAction, string[]>();
  for (const [collection, actions] of grants) {
    for (const action of actions)
      byAction.set(action, [...(byAction.get(action) ?? []), collection]);
  }
  return {
    roleName,
    actions: [...byAction.entries()].map(([action, collections]) => ({
      action,
      resources: collections.map((collection) => ({ db, collection })),
    })),
    inheritedRoles: [],
  };
}

export function databaseRoles(db: string): readonly AtlasCustomRole[] {
  return [
    // API runtime.
    role('khumsApp', db, ALL_COLLECTIONS.map(appGrant)),
    // Checkpoint job: reads the chains, writes checkpoints. Nothing else.
    role('khumsCheckpoint', db, [
      ...CHAINED.map((name): Grant => [name, ['FIND']]),
      [COLLECTIONS.auditCheckpoints.name, ['FIND', 'INSERT']],
    ]),
    // Operator during migration: schema and indexes, plus the initial policy seed.
    role('khumsMigrator', db, [
      ...ALL_COLLECTIONS.map((spec): Grant => [
        spec.name,
        ['CREATE_COLLECTION', 'CREATE_INDEX', 'COLL_MOD', 'LIST_INDEXES'],
      ]),
      ['', ['LIST_COLLECTIONS']],
      [COLLECTIONS.governancePolicyRegistry.name, ['FIND', 'INSERT']],
    ]),
  ];
}

/** `collection → actions` for one role (tests and reviews). */
export function privilegesOf(
  roleDefinition: AtlasCustomRole,
): ReadonlyMap<string, ReadonlySet<AtlasAction>> {
  const result = new Map<string, Set<AtlasAction>>();
  for (const { action, resources } of roleDefinition.actions) {
    for (const { collection } of resources) {
      result.set(collection, (result.get(collection) ?? new Set()).add(action));
    }
  }
  return result;
}
