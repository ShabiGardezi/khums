// Bundles the API into dist/main.js and dist/serverless.js (ESM) using rspack — Nest CLI's builder for ESM projects.
//
// Why bundle: shared @khums/* packages ship TypeScript source (see docs/ARCHITECTURE.md §9).
// They are compiled *into* the bundle, while every npm dependency stays external and is loaded
// from node_modules at runtime. SWC (built into rspack) emits the decorator metadata NestJS
// dependency injection needs. Type checking is done separately (`pnpm typecheck`).
const path = require('node:path');
const nodeExternals = require('webpack-node-externals');

/** Nest CLI calls this with its defaults; we return a complete, explicit config. */
module.exports = (options) => ({
  mode: 'none',
  // main: the long-running server and operator commands; serverless: the Vercel Functions entry
  // (decision 84), the same application without listen().
  entry: {
    main: path.resolve(__dirname, 'src/main.ts'),
    serverless: path.resolve(__dirname, 'src/serverless.ts'),
  },
  target: 'node24',
  devtool: 'source-map',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: '[name].js',
    module: true,
    chunkFormat: 'module',
    library: { type: 'module' },
    clean: true,
  },
  experiments: { outputModule: true },
  externalsPresets: { node: true },
  externalsType: 'module',
  externals: [
    nodeExternals({
      importType: 'module',
      // Workspace packages are TypeScript source and must be compiled into the bundle.
      allowlist: [/^@khums\//],
    }),
  ],
  resolve: { extensions: ['.ts', '.js', '.json'] },
  module: {
    rules: [
      {
        test: /\.ts$/,
        exclude: /node_modules/,
        loader: 'builtin:swc-loader',
        options: {
          jsc: {
            parser: { syntax: 'typescript', decorators: true },
            transform: { legacyDecorator: true, decoratorMetadata: true },
            target: 'es2023',
            keepClassNames: true,
          },
          module: { type: 'es6' },
        },
        type: 'javascript/auto',
      },
    ],
  },
  optimization: { minimize: false, nodeEnv: false },
  node: { __dirname: false, __filename: false },
  plugins: options.plugins ?? [],
});
