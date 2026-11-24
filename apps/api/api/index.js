// Vercel Functions entry (decision 84; docs/DEPLOYMENT_VERCEL.md). Every request is rewritten here
// (vercel.json); the bundled Nest application in dist/serverless.js answers it.
export { default } from '../dist/serverless.js';
