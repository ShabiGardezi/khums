#!/usr/bin/env node
// Smoke-tests the *built* bundle (dist/main.js): boots it, checks the health endpoint against
// the shared contract shape, then sends SIGTERM and expects a graceful shutdown.
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';

const PORT = process.env.SMOKE_PORT ?? '4999';
const BASE = `http://127.0.0.1:${PORT}/api/v1`;
const entry = fileURLToPath(new URL('../dist/main.js', import.meta.url));

const child = spawn(process.execPath, [entry], {
  env: { ...process.env, NODE_ENV: 'production', HOST: '127.0.0.1', PORT, LOG_LEVEL: 'info' },
  stdio: ['ignore', 'pipe', 'inherit'],
});
let output = '';
child.stdout.on('data', (chunk) => (output += chunk));

const fail = (message) => {
  console.error(`✖ API smoke test failed: ${message}\n${output}`);
  child.kill('SIGKILL');
  process.exit(1);
};

let health;
for (let attempt = 0; attempt < 60 && !health; attempt++) {
  try {
    const response = await fetch(`${BASE}/health`);
    if (response.ok) health = await response.json();
  } catch {
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}
if (!health) fail('health endpoint did not respond');
if (health.status !== 'ok' || health.service !== 'khums-api') {
  fail(`unexpected health payload ${JSON.stringify(health)}`);
}

const missing = await fetch(`${BASE}/missing-route`);
const problem = await missing.json();
if (missing.status !== 404 || problem.code !== 'NOT_FOUND') fail('404 is not a problem+json');

const docs = await fetch(`http://127.0.0.1:${PORT}/api/docs/openapi.json`);
if (docs.status !== 404) fail('Swagger must be disabled by default in production');

child.kill('SIGTERM');
const [code, signal] = await once(child, 'exit');
if (!output.includes('"signal":"SIGTERM"') || !output.includes('Application shut down')) {
  fail('graceful shutdown hook did not run');
}
console.log(
  `✔ API smoke test passed (health ok, problem+json 404, docs off, shutdown via ${signal ?? code}).`,
);
