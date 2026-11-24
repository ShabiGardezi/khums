import { describe, expect, it } from 'vitest';

import { assertNever, invariant, InvariantError } from './index';

describe('invariant', () => {
  it('does nothing when the condition holds', () => {
    expect(() => {
      invariant(true, 'never thrown');
    }).not.toThrow();
  });

  it('throws InvariantError when the condition fails', () => {
    expect(() => {
      invariant(false, 'broken');
    }).toThrow(InvariantError);
  });
});

describe('assertNever', () => {
  it('throws for values that escape exhaustiveness checks', () => {
    expect(() => assertNever('unexpected' as never)).toThrow(/unexpected/);
  });
});
