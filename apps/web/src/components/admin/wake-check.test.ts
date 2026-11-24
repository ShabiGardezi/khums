import { describe, expect, it } from 'vitest';

import { pollUntilReady } from './wake-check';

/** Cold-start polling (M4.7), with a fake clock. */

function fakeClock() {
  let now = 0;
  return {
    now: () => now,
    sleep: (ms: number) => {
      now += ms;
      return Promise.resolve();
    },
  };
}

describe('pollUntilReady', () => {
  it('returns as soon as the API answers', async () => {
    const clock = fakeClock();
    let calls = 0;
    const outcome = await pollUntilReady({
      ...clock,
      check: () => Promise.resolve(++calls === 4),
      intervalMs: 3_000,
    });
    expect(outcome).toBe('READY');
    expect(calls).toBe(4);
    expect(clock.now()).toBe(9_000);
  });

  it('gives up after the deadline', async () => {
    const clock = fakeClock();
    const outcome = await pollUntilReady({
      ...clock,
      check: () => Promise.resolve(false),
      deadlineMs: 10_000,
      intervalMs: 3_000,
    });
    expect(outcome).toBe('TIMED_OUT');
    expect(clock.now()).toBeGreaterThanOrEqual(10_000);
  });

  it('stops when cancelled (page left)', async () => {
    const clock = fakeClock();
    let cancelled = false;
    const outcome = await pollUntilReady({
      ...clock,
      check: () => {
        cancelled = true;
        return Promise.resolve(false);
      },
      cancelled: () => cancelled,
    });
    expect(outcome).toBe('CANCELLED');
  });
});
