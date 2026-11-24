import { describe, expect, it } from 'vitest';

import { PUBLIC_PACK_CACHE_TTL_MS, PublicPackCache } from './public-pack-cache';

/** Audit SEC-02: a short, correctness-first cache of the public selection. */
describe('PublicPackCache', () => {
  const setup = () => {
    let now = 1_000_000;
    const cache = new PublicPackCache({ now: () => now });
    let computed = 0;
    const compute = () => {
      computed += 1;
      return Promise.resolve(`value-${String(computed)}`);
    };
    return {
      cache,
      compute,
      advance: (ms: number) => {
        now += ms;
      },
      count: () => computed,
    };
  };

  it('serves a cached value for the same key and fingerprint within the TTL', async () => {
    const t = setup();
    expect(await t.cache.getOrCompute('k', 'f', t.compute)).toBe('value-1');
    t.advance(PUBLIC_PACK_CACHE_TTL_MS - 1);
    expect(await t.cache.getOrCompute('k', 'f', t.compute)).toBe('value-1');
    expect(t.count()).toBe(1);
  });

  it('recomputes after the TTL, on a new fingerprint and after invalidation', async () => {
    const t = setup();
    await t.cache.getOrCompute('k', 'f', t.compute);
    t.advance(PUBLIC_PACK_CACHE_TTL_MS);
    expect(await t.cache.getOrCompute('k', 'f', t.compute)).toBe('value-2');
    expect(await t.cache.getOrCompute('k', 'f2', t.compute)).toBe('value-3');
    t.cache.invalidate();
    expect(await t.cache.getOrCompute('k', 'f2', t.compute)).toBe('value-4');
  });

  it('never stores a value computed across an invalidation', async () => {
    const t = setup();
    await t.cache.getOrCompute('k', 'f', async () => {
      t.cache.invalidate();
      return Promise.resolve('stale');
    });
    expect(await t.cache.getOrCompute('k', 'f', t.compute)).toBe('value-1');
  });

  it('reports a suspension key once per process unless forgotten', () => {
    const t = setup();
    expect(t.cache.firstReport('a')).toBe(true);
    expect(t.cache.firstReport('a')).toBe(false);
    t.cache.forgetReport('a');
    expect(t.cache.firstReport('a')).toBe(true);
  });
});
