#!/usr/bin/env node
/** Cross-platform launcher: sets E2E_LIVE=1 then runs Playwright. */
const { spawnSync } = require('child_process');
const env = { ...process.env, E2E_LIVE: '1' };
const result = spawnSync(
  'npx',
  ['playwright', 'test', '--config=e2e/playwright.config.ts', ...process.argv.slice(2)],
  { stdio: 'inherit', env, shell: true },
);
process.exit(result.status ?? 1);
