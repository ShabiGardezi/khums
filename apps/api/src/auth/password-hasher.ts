import { argon2, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Argon2id password hashing (M4.6.2b; docs/AUTH_ARCHITECTURE.md §4.10) with Node's built-in
 * `crypto.argon2` (Node ≥ 24.7; no native add-on). Hashes are stored in the PHC string format
 * `$argon2id$v=19$m=<KiB>,t=<passes>,p=<lanes>$<salt>$<hash>` (unpadded base64). Verification
 * re-derives with the stored parameters and compares in constant time. Passwords are never logged.
 */

export interface Argon2Parameters {
  /** Memory in KiB. */
  readonly memory: number;
  readonly passes: number;
  readonly parallelism: number;
}

/** RFC 9106 second recommended option (64 MiB, t=3, p=4); reviewed at implementation. */
export const PRODUCTION_ARGON2: Argon2Parameters = { memory: 65_536, passes: 3, parallelism: 4 };
/** Fast parameters for tests only. */
export const TEST_ARGON2: Argon2Parameters = { memory: 1_024, passes: 1, parallelism: 1 };

const TAG_LENGTH = 32;
const SALT_LENGTH = 16;
/** Bounds for stored parameters, so a corrupted hash cannot exhaust memory or CPU. */
const LIMITS = { memory: [1_024, 262_144], passes: [1, 10], parallelism: [1, 8] } as const;

export interface PasswordHasher {
  hash(password: string): Promise<string>;
  verify(encoded: string, password: string): Promise<boolean>;
  /** True when the stored hash uses weaker parameters than the current ones. */
  needsRehash(encoded: string): boolean;
  /** Spends the same work as a real verification (unknown usernames; no timing oracle). */
  dummyVerify(password: string): Promise<void>;
}

export const PASSWORD_HASHER = Symbol('PASSWORD_HASHER');

const b64 = (bytes: Buffer) => bytes.toString('base64').replace(/=+$/, '');

function derive(password: string, salt: Buffer, params: Argon2Parameters): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    argon2(
      'argon2id',
      {
        message: Buffer.from(password, 'utf8'),
        nonce: salt,
        parallelism: params.parallelism,
        tagLength: TAG_LENGTH,
        memory: params.memory,
        passes: params.passes,
      },
      (error, derived) => {
        if (error) reject(error);
        else resolve(derived);
      },
    );
  });
}

interface Parsed {
  readonly params: Argon2Parameters;
  readonly salt: Buffer;
  readonly hash: Buffer;
}

const within = (value: number, [min, max]: readonly [number, number]) =>
  Number.isInteger(value) && value >= min && value <= max;

export function parseArgon2id(encoded: string): Parsed | null {
  const match =
    /^\$argon2id\$v=19\$m=(\d+),t=(\d+),p=(\d+)\$([A-Za-z0-9+/]+)\$([A-Za-z0-9+/]+)$/.exec(encoded);
  if (match === null) return null;
  const [, m, t, p, salt, hash] = match;
  const params = { memory: Number(m), passes: Number(t), parallelism: Number(p) };
  if (
    !within(params.memory, LIMITS.memory) ||
    !within(params.passes, LIMITS.passes) ||
    !within(params.parallelism, LIMITS.parallelism)
  ) {
    return null;
  }
  const saltBytes = Buffer.from(salt ?? '', 'base64');
  const hashBytes = Buffer.from(hash ?? '', 'base64');
  if (saltBytes.length < 16 || hashBytes.length !== TAG_LENGTH) return null;
  return { params, salt: saltBytes, hash: hashBytes };
}

export function argon2idHasher(params: Argon2Parameters = PRODUCTION_ARGON2): PasswordHasher {
  const hash = async (password: string) => {
    const salt = randomBytes(SALT_LENGTH);
    const derived = await derive(password, salt, params);
    return `$argon2id$v=19$m=${String(params.memory)},t=${String(params.passes)},p=${String(params.parallelism)}$${b64(salt)}$${b64(derived)}`;
  };
  // A fixed hash with the current parameters, verified against for unknown usernames.
  let dummy: Promise<string> | null = null;
  const verify = async (encoded: string, password: string) => {
    const parsed = parseArgon2id(encoded);
    if (parsed === null) return false;
    const derived = await derive(password, parsed.salt, parsed.params);
    return derived.length === parsed.hash.length && timingSafeEqual(derived, parsed.hash);
  };
  return {
    hash,
    verify,
    needsRehash: (encoded) => {
      const parsed = parseArgon2id(encoded);
      return (
        parsed === null ||
        parsed.params.memory < params.memory ||
        parsed.params.passes < params.passes ||
        parsed.params.parallelism < params.parallelism
      );
    },
    dummyVerify: async (password) => {
      dummy ??= hash('dummy-password-for-timing-only');
      await verify(await dummy, password);
    },
  };
}
