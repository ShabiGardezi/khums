import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/__fixtures__/**', 'src/index.ts'],
      // docs/CODING_STANDARDS.md: the engine targets ≥ 95% branch coverage.
      thresholds: { branches: 95, lines: 95, functions: 95, statements: 95 },
    },
  },
});
