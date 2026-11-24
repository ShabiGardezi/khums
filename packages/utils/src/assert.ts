/** Thrown only for programmer errors — never for user input or domain failures. */
export class InvariantError extends Error {
  override readonly name: string = 'InvariantError';
}

/** Asserts a condition that must hold if the code is correct. */
export function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new InvariantError(message);
  }
}

/** Compile-time exhaustiveness check for discriminated unions. */
export function assertNever(value: never, message = 'Unexpected value'): never {
  throw new InvariantError(`${message}: ${JSON.stringify(value)}`);
}
