import { Global, Inject, Injectable, Module } from '@nestjs/common';

import { CLOCK, type Clock } from '../auth/auth.tokens';

/**
 * A short in-process cache of the public calculator's computed selection (audit SEC-02): the
 * catalogue and each Marja's verified pack, so anonymous reads do not replay every ledger and
 * reload every research chain on every request. No infrastructure: process memory only.
 *
 * Correctness first:
 * - entries live at most `PUBLIC_PACK_CACHE_TTL_MS` (30 s), and every entry is keyed by a cheap
 *   fingerprint of the governance store's version list, so a new version published by ANY process
 *   is seen on the next request;
 * - every governance command, source verification and research change in THIS process calls
 *   `invalidate()` after it commits, so a withdrawal or a research change (which suspends a live
 *   builder pack, BLD-01) takes effect on the very next request here;
 * - in another process (several API instances), a withdrawal or research change is served from
 *   cache for at most the TTL, never longer. A computation that started before an invalidation
 *   is never stored (generation check).
 *
 * Holds no visitor data: only pack selections, which are public anyway.
 */
export const PUBLIC_PACK_CACHE_TTL_MS = 30_000;

interface Entry {
  readonly at: number;
  readonly fingerprint: string;
  readonly value: unknown;
}

@Injectable()
export class PublicPackCache {
  private readonly entries = new Map<string, Entry>();
  private generation = 0;
  /** Suspension keys already reported (audit/log once per process; see LivePackResearch). */
  private readonly reported = new Set<string>();

  constructor(@Inject(CLOCK) private readonly clock: Clock) {}

  /** The cached value for `key` (same fingerprint, younger than the TTL), or computes it. */
  async getOrCompute<T>(key: string, fingerprint: string, compute: () => Promise<T>): Promise<T> {
    const now = this.clock.now();
    const hit = this.entries.get(key);
    if (hit?.fingerprint === fingerprint && now - hit.at < PUBLIC_PACK_CACHE_TTL_MS) {
      return hit.value as T;
    }
    const generation = this.generation;
    const value = await compute();
    if (generation === this.generation) {
      this.entries.set(key, { at: now, fingerprint, value });
    }
    return value;
  }

  /** Drops every entry (after a publication, withdrawal or research change in this process). */
  invalidate(): void {
    this.generation += 1;
    this.entries.clear();
  }

  /** True the first time `key` is seen in this process (later calls: false). */
  firstReport(key: string): boolean {
    if (this.reported.has(key)) return false;
    if (this.reported.size > 10_000) this.reported.clear();
    this.reported.add(key);
    return true;
  }

  /** Forgets a report that could not be recorded (it is reported again next time). */
  forgetReport(key: string): void {
    this.reported.delete(key);
  }
}

/** Global so governance, research, the rule builder and the public module share one cache. */
@Global()
@Module({ providers: [PublicPackCache], exports: [PublicPackCache] })
export class PublicPackCacheModule {}
