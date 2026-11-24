import type { ApiError } from '@khums/api-client';
import { err, type Result } from '@khums/utils';

/**
 * Reads an uploaded rule-pack file in the browser (M4.6.5): JSON only, size-capped like the API
 * (100 kB), with the pack id and version taken from its metadata for the request path. The
 * content itself is validated by the server (strict schema, integrity, channel); never here.
 */
export type PackFile =
  | {
      readonly kind: 'OK';
      readonly pack: Record<string, unknown>;
      readonly packId: string;
      readonly version: string;
    }
  | { readonly kind: 'INVALID' };

export const PACK_FILE_LIMIT_BYTES = 100_000;

export function parsePackFile(text: string): PackFile {
  if (text.length === 0 || text.length > PACK_FILE_LIMIT_BYTES) return { kind: 'INVALID' };
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { kind: 'INVALID' };
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { kind: 'INVALID' };
  }
  const metadata = (parsed as { metadata?: unknown }).metadata;
  if (typeof metadata !== 'object' || metadata === null) return { kind: 'INVALID' };
  const { packId, version } = metadata as { packId?: unknown; version?: unknown };
  if (typeof packId !== 'string' || typeof version !== 'string') return { kind: 'INVALID' };
  return { kind: 'OK', pack: parsed as Record<string, unknown>, packId, version };
}

/** The file chosen in a form's `file` input, read as text (empty when none). */
export async function fileText(data: FormData, name = 'file'): Promise<string> {
  const value = data.get(name);
  return value instanceof File ? value.text() : '';
}

/** A local refusal for an unreadable file (client-only code, never sent by the server). */
export const invalidFile = (): Result<never, ApiError> =>
  err({
    kind: 'http',
    status: 422,
    problem: { type: 'about:blank', title: 'Invalid file', status: 422, code: 'FILE_INVALID' },
  });
