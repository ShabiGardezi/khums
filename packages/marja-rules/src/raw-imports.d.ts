/** Vite/Vitest `?raw` imports (test-only: lets tests read research documents without node:fs). */
declare module '*.md?raw' {
  const content: string;
  export default content;
}
