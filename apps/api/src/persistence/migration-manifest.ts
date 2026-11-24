import { ALL_COLLECTIONS } from './collections';
import { validatorOf } from './migrate';

/**
 * The exact manifest of `--migrate-database` on an EMPTY database (M5.3.3 plan R3): every
 * collection, index and validator it creates, and the policy records it seeds. Derived from the
 * same specs and seed the migration uses, so the reviewed manifest cannot drift from the code.
 * `--print-migration-manifest` prints it without connecting to any database.
 */
export interface MigrationManifest {
  readonly collections: readonly {
    readonly name: string;
    readonly access: string;
    readonly validator: unknown;
    readonly validationLevel: 'strict';
    readonly validationAction: 'error';
    readonly indexes: readonly {
      readonly name: string;
      readonly key: Readonly<Record<string, 1 | -1>>;
      readonly unique: boolean;
      readonly expireAfterSeconds: number | null;
    }[];
  }[];
  readonly seededPolicyRecords: readonly {
    readonly sequence: number;
    readonly recordId: string;
    readonly kind: string;
    readonly marjaId: string;
    readonly policy: string | null;
    readonly recordedAt: string;
    readonly requestId: string;
    readonly recordDigest: string;
  }[];
}

export function migrationManifest(
  seed: readonly {
    readonly sequence: number;
    readonly recordId: string;
    readonly kind: string;
    readonly marjaId: string;
    readonly recordedAt: string;
    readonly requestId: string;
    readonly recordDigest: string;
    readonly newPolicy?: string | null;
    readonly policy?: string | null;
  }[],
): MigrationManifest {
  return {
    collections: ALL_COLLECTIONS.map((spec) => ({
      name: spec.name,
      access: spec.access,
      validator: validatorOf(spec),
      validationLevel: 'strict' as const,
      validationAction: 'error' as const,
      indexes: spec.indexes.map((index) => ({
        name: index.name,
        key: index.key,
        unique: 'unique' in index,
        expireAfterSeconds:
          'expireAfterSeconds' in index ? (index.expireAfterSeconds ?? null) : null,
      })),
    })),
    seededPolicyRecords: seed.map((r) => ({
      sequence: r.sequence,
      recordId: r.recordId,
      kind: r.kind,
      marjaId: r.marjaId,
      policy: r.newPolicy ?? r.policy ?? null,
      recordedAt: r.recordedAt,
      requestId: r.requestId,
      recordDigest: r.recordDigest,
    })),
  };
}
