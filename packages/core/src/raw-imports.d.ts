/** Vite/Vitest `?raw` imports (test-only: lets tests read frozen pack snapshots without node:fs). */
declare module '*.json?raw' {
  const content: string;
  export default content;
}
