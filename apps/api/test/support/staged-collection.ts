import type {
  AppendOnlyCollection,
  FindOptions,
} from '../../src/persistence/append-only-collection';

/**
 * TEST ONLY (M4.6.4a): an append-only collection whose inserts are staged until `commit()`, over a
 * base collection, with the same unique-index semantics. Tests use one per unit of work to get
 * real rollback in memory (a unit of work that throws `Rollback` never commits).
 */
const keyOf = (doc: object, fields: readonly string[]) =>
  JSON.stringify(fields.map((f) => (doc as Record<string, unknown>)[f] ?? null));

export function staged(base: AppendOnlyCollection) {
  let buffer: object[] = [];
  const all = async () => {
    const found = await base.find({}, { sort: { field: '_none', direction: 1 } });
    if (!found.ok) throw new Error('base unavailable');
    return [...(found.value as object[]), ...buffer];
  };
  const collection: AppendOnlyCollection = {
    spec: base.spec,
    insert: async (document) => {
      const existing = await all();
      for (const index of base.spec.indexes) {
        if (!('unique' in index)) continue;
        const fields = Object.keys(index.key);
        if (existing.some((d) => keyOf(d, fields) === keyOf(document, fields))) {
          return { kind: 'DUPLICATE', index: index.name };
        }
      }
      buffer.push(structuredClone({ ...document }));
      return { kind: 'INSERTED' };
    },
    find: async (filter, options: FindOptions) => {
      const matches = (await all())
        .map((d) => d as Record<string, unknown>)
        .filter((d) => Object.entries(filter).every(([f, v]) => d[f] === v))
        .sort((a, b) => {
          const x = a[options.sort.field];
          const y = b[options.sort.field];
          const order =
            typeof x === 'number' && typeof y === 'number'
              ? x - y
              : String(x).localeCompare(String(y));
          return order * options.sort.direction;
        });
      const limited = options.limit === undefined ? matches : matches.slice(0, options.limit);
      return { ok: true, value: limited.map((d) => structuredClone(d)) };
    },
  };
  return {
    collection,
    commit: async () => {
      for (const doc of buffer) await base.insert(doc);
      buffer = [];
    },
  };
}
