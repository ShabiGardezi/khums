/**
 * Minimal structural types for `fetch`, so this package needs neither DOM nor Node typings.
 * The browser's, React Native's and Node's global `fetch` all satisfy `FetchLike`.
 */
export interface RequestInitLike {
  readonly method: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly body?: string;
}

export interface ResponseLike {
  readonly ok: boolean;
  readonly status: number;
  readonly headers: { get(name: string): string | null };
  json(): Promise<unknown>;
}

export type FetchLike = (url: string, init: RequestInitLike) => Promise<ResponseLike>;
