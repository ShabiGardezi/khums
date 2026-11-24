import { createPrivateKey, createPublicKey, sign, verify, type KeyObject } from 'node:crypto';

import type { CheckpointSignatureVerifier, CheckpointSigner } from '@khums/core';

/**
 * Ed25519 signing and verification for integrity checkpoints (M4.6.3a;
 * docs/AUTH_ARCHITECTURE.md §4.11). The private key is used only by the checkpoint job; the API
 * runtime only verifies with version-controlled public keys.
 */

function ed25519(key: KeyObject, kind: 'private' | 'public'): KeyObject {
  if (key.asymmetricKeyType !== 'ed25519' || key.type !== kind) {
    throw new Error(`Checkpoint key must be an Ed25519 ${kind} key`);
  }
  return key;
}

/**
 * A signer from a PKCS#8 PEM private key held by the checkpoint job (its protected secret store).
 * The key material is never logged; errors name the rule only. A KMS-backed signer implementing
 * the same `CheckpointSigner` port replaces this before M4.7.
 */
export function ed25519Signer(keyId: string, privateKeyPem: string): CheckpointSigner {
  const key = ed25519(createPrivateKey({ key: privateKeyPem, format: 'pem' }), 'private');
  return {
    keyId,
    sign: (payload) =>
      Promise.resolve(sign(null, Buffer.from(payload, 'utf8'), key).toString('base64url')),
  };
}

export interface PublicCheckpointKey {
  readonly keyId: string;
  /** SPKI PEM. */
  readonly publicKeyPem: string;
}

/** A verifier over trusted public keys. Unknown key ids and malformed signatures verify false. */
export function ed25519Verifier(keys: readonly PublicCheckpointKey[]): CheckpointSignatureVerifier {
  // Node derives a public key from a private-key PEM; refuse that, so a private key can never sit
  // in the trusted list unnoticed.
  for (const k of keys) {
    if (!k.publicKeyPem.trim().startsWith('-----BEGIN PUBLIC KEY-----')) {
      throw new Error('Checkpoint key must be an Ed25519 public key (SPKI PEM)');
    }
  }
  const byId = new Map(
    keys.map((k) => [
      k.keyId,
      ed25519(createPublicKey({ key: k.publicKeyPem, format: 'pem' }), 'public'),
    ]),
  );
  return {
    verify: (keyId, payload, signature) => {
      const key = byId.get(keyId);
      if (key === undefined) return Promise.resolve(false);
      try {
        return Promise.resolve(
          verify(null, Buffer.from(payload, 'utf8'), key, Buffer.from(signature, 'base64url')),
        );
      } catch {
        return Promise.resolve(false);
      }
    },
  };
}
