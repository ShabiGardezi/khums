/** A store lookup: found, not found, or the store could not answer (fail closed). */
export type LookupResult<T> =
  | { readonly kind: 'FOUND'; readonly value: T }
  | { readonly kind: 'NOT_FOUND' }
  | { readonly kind: 'UNAVAILABLE' };
