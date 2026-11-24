import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

import { testSelection } from './test/support/live-selection';

const selection = testSelection(process.env);

export default defineConfig({
  // SWC emits the decorator metadata NestJS dependency injection relies on.
  plugins: [swc.vite({ module: { type: 'es6' }, jsc: { target: 'es2023' } })],
  test: {
    environment: 'node',
    // Live MongoDB suites only with KHUMS_LIVE_TESTS=1 (set by `test:live`); see live-selection.ts.
    include: selection.include,
    exclude: selection.exclude,
    fileParallelism: selection.fileParallelism,
    setupFiles: ['./test/setup.ts'],
  },
});
