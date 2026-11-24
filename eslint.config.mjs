// Root ESLint flat config.
// - Used directly by every package under packages/* (ESLint looks up from cwd).
// - Apps import `baseConfig` and extend it with framework rules (see apps/web/eslint.config.mjs).
import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import { defineConfig, globalIgnores } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/**
 * Platform-agnostic packages. These MUST run unchanged in a browser, React Native (Hermes)
 * and Node.js, so they may not import frameworks, databases or runtime-specific APIs.
 */
const PURE_PACKAGES = [
  'core',
  'calculation-engine',
  'marja-rules',
  'shared-types',
  'validation',
  'utils',
  'money',
  'api-client',
];

/** Packages that perform or orchestrate money arithmetic. */
const FINANCIAL_PACKAGES = ['core', 'calculation-engine', 'marja-rules'];

const pureFiles = PURE_PACKAGES.map((p) => `packages/${p}/src/**/*.ts`);
const moneyFiles = ['packages/money/src/**/*.ts'];
const financialFiles = FINANCIAL_PACKAGES.map((p) => `packages/${p}/src/**/*.ts`);

const PURE_IMPORT_MESSAGE =
  'Shared packages must stay platform-agnostic (no frameworks, databases or runtime APIs). See docs/ARCHITECTURE.md.';

const PURE_RESTRICTED_GLOBALS = [
  'window',
  'document',
  'navigator',
  'localStorage',
  'sessionStorage',
  'process',
].map((name) => ({ name, message: PURE_IMPORT_MESSAGE }));

const FLOAT_MESSAGE = 'Use @khums/money for money arithmetic (docs/ARCHITECTURE.md §6).';

const PLATFORM_IMPORT_PATTERNS = [
  {
    regex:
      '^(react|react-dom|react-native|next|expo|mongoose|mongodb|pino|helmet|express)(/.*)?$|^@(nestjs|expo|react-native|next)/',
    message: PURE_IMPORT_MESSAGE,
  },
  { regex: '^node:', message: PURE_IMPORT_MESSAGE },
];

const DEEP_IMPORT_PATTERN = {
  regex: '^@khums/[^/]+/src(/.*)?$',
  message: 'Import packages through their public entry point, not their src/.',
};

/** Import rules every workspace except @khums/money follows (apps reuse this). */
export const COMMON_IMPORT_PATTERNS = [
  DEEP_IMPORT_PATTERN,
  {
    regex: '^decimal\\.js(/.*)?$',
    message: 'decimal.js is wrapped by @khums/money; import that instead.',
  },
];

export const baseConfig = defineConfig(
  globalIgnores([
    '**/node_modules/**',
    '**/dist/**',
    '**/.next/**',
    '**/.turbo/**',
    '**/coverage/**',
    '**/playwright-report/**',
    '**/test-results/**',
    '**/next-env.d.ts',
  ]),

  js.configs.recommended,
  tseslint.configs.strictTypeChecked,
  tseslint.configs.stylisticTypeChecked,

  {
    files: ['**/*.{ts,tsx,mts,cts}'],
    languageOptions: {
      parserOptions: {
        projectService: true,
      },
    },
    rules: {
      eqeqeq: ['error', 'always'],
      'no-console': 'error',
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'separate-type-imports' },
      ],
      '@typescript-eslint/consistent-type-exports': 'error',
      '@typescript-eslint/switch-exhaustiveness-check': 'error',
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },

  // Platform-agnostic shared packages.
  {
    files: pureFiles,
    ignores: moneyFiles,
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: [...PLATFORM_IMPORT_PATTERNS, ...COMMON_IMPORT_PATTERNS] },
      ],
      'no-restricted-globals': ['error', ...PURE_RESTRICTED_GLOBALS],
    },
  },

  // @khums/money: the one place decimal.js may be used. Still pure, still float-free.
  {
    files: moneyFiles,
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: [...PLATFORM_IMPORT_PATTERNS, DEEP_IMPORT_PATTERN] },
      ],
      'no-restricted-globals': [
        'error',
        ...PURE_RESTRICTED_GLOBALS,
        { name: 'parseFloat', message: FLOAT_MESSAGE },
      ],
      'no-restricted-properties': [
        'error',
        { object: 'Number', property: 'parseFloat', message: FLOAT_MESSAGE },
      ],
    },
  },

  // Money must never be computed with IEEE-754 floats.
  {
    files: financialFiles,
    ignores: ['**/*.test.ts'],
    rules: {
      // Must repeat the pure-package globals: a later config replaces, not merges, a rule.
      'no-restricted-globals': [
        'error',
        ...PURE_RESTRICTED_GLOBALS,
        { name: 'parseFloat', message: FLOAT_MESSAGE },
      ],
      'no-restricted-properties': [
        'error',
        { object: 'Number', property: 'parseFloat', message: FLOAT_MESSAGE },
        { property: 'toFixed', message: FLOAT_MESSAGE },
      ],
    },
  },

  // NestJS API (linted with this root config from apps/api).
  {
    files: ['apps/api/**/*.ts'],
    languageOptions: {
      parserOptions: { emitDecoratorMetadata: true, experimentalDecorators: true },
    },
    rules: {
      // DI needs runtime imports of injected classes; `import type` would erase them.
      // TypeScript's verbatimModuleSyntax still forces `import type` for pure types.
      '@typescript-eslint/consistent-type-imports': 'off',
      // Nest modules are decorated, intentionally empty classes.
      '@typescript-eslint/no-extraneous-class': ['error', { allowWithDecorator: true }],
      // Nest 12 declares option bags (e.g. NestApplicationOptions) as classes, so plain
      // `{ logger: false }` literals are flagged although Nest expects exactly that.
      '@typescript-eslint/no-unsafe-class-instance-assignment': 'off',
      'no-restricted-imports': ['error', { patterns: COMMON_IMPORT_PATTERNS }],
    },
  },

  // Tests may be a little looser.
  {
    files: ['**/*.test.ts', '**/*.test.tsx', '**/e2e/**/*.ts'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
      // Asymmetric matchers (expect.any, expect.arrayContaining) are typed `any` by Vitest.
      '@typescript-eslint/no-unsafe-assignment': 'off',
    },
  },

  // Plain JS config/scripts: Node globals, no type-aware rules.
  {
    files: ['**/*.{js,mjs,cjs}'],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: { globals: { ...globals.node } },
    rules: { 'no-console': 'off' },
  },
  {
    files: ['**/*.cjs'],
    languageOptions: { sourceType: 'commonjs' },
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },

  prettier,
);

export default baseConfig;
