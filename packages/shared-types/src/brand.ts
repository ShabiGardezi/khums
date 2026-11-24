declare const brand: unique symbol;

/**
 * Nominal ("branded") type helper. Prevents accidentally mixing structurally identical
 * primitives, e.g. passing a `RuleSetVersion` where a `CurrencyCode` is expected.
 *
 * @example
 * type CurrencyCode = Brand<string, 'CurrencyCode'>;
 */
export type Brand<T, B extends string> = T & { readonly [brand]: B };
