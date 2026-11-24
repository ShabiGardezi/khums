import { useSyncExternalStore } from 'react';

const subscribeNoop = () => () => undefined;

/**
 * True only after hydration in a browser with JavaScript (false during server rendering and in
 * the server HTML before React takes over). Client-only actions use it to stay disabled until
 * their handlers exist, so an early click or Enter never does nothing, and a form never falls back
 * to a native submission that would put its fields in the URL (M5.2.1 verification).
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribeNoop,
    () => true,
    () => false,
  );
}
