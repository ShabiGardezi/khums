import nextVitals from 'eslint-config-next/core-web-vitals';
import { defineConfig } from 'eslint/config';

import { baseConfig, COMMON_IMPORT_PATTERNS } from '../../eslint.config.mjs';

export default defineConfig(nextVitals, baseConfig, {
  rules: {
    // Religious rulings and calculations live in shared packages, never in components.
    'no-restricted-imports': ['error', { patterns: COMMON_IMPORT_PATTERNS }],
  },
});
