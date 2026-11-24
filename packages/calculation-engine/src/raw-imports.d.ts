/** Vite/Vitest `?raw` imports (tests only: read source files without node:fs). */
declare module '*.ts?raw' {
  const content: string;
  export default content;
}
