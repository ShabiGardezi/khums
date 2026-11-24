import { describe, expectTypeOf, it } from 'vitest';

import type { Brand } from './index';

type UserId = Brand<string, 'UserId'>;
type OrderId = Brand<string, 'OrderId'>;

describe('Brand', () => {
  it('keeps the underlying primitive assignable outward', () => {
    expectTypeOf<UserId>().toExtend<string>();
  });

  it('is not interchangeable between brands or with raw primitives', () => {
    expectTypeOf<UserId>().not.toEqualTypeOf<OrderId>();
    expectTypeOf<string>().not.toExtend<UserId>();
  });
});
