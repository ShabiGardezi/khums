import { describe, expect, it } from 'vitest';

import { cn } from './utils';

describe('cn', () => {
  it('joins classes and drops falsy values', () => {
    expect(cn('a', undefined, null, { b: false, c: true }, 'd')).toBe('a c d');
  });

  it('lets later Tailwind utilities win conflicts', () => {
    expect(cn('px-2 py-1', 'px-4')).toBe('py-1 px-4');
  });
});
