#!/usr/bin/env node
/**
 * Gate de npm audit: falha em high/critical fora da allowlist versionada.
 * Uso (raiz): node scripts/npm-audit-check.mjs
 * Allowlist: ops/npm-audit-allowlist.json
 */
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const allowPath = join(root, 'ops', 'npm-audit-allowlist.json');

const allow = JSON.parse(readFileSync(allowPath, 'utf8'));
const today = new Date().toISOString().slice(0, 10);

if (allow.expires && allow.expires < today) {
  console.error(
    `FAIL: allowlist global expirada (${allow.expires}). Atualize ops/npm-audit-allowlist.json ou remova entradas.`,
  );
  process.exit(2);
}

const res = spawnSync('npm', ['audit', '--json'], {
  cwd: root,
  encoding: 'utf8',
  maxBuffer: 20 * 1024 * 1024,
  shell: true,
});
const raw = res.stdout || '';
let report;
try {
  report = JSON.parse(raw);
} catch {
  console.error('FAIL: não foi possível parsear npm audit --json');
  console.error(raw.slice(0, 500));
  process.exit(2);
}

const vulns = report.vulnerabilities || {};
const blockers = [];
const allowedHits = [];

for (const [name, v] of Object.entries(vulns)) {
  if (!['high', 'critical'].includes(v.severity)) continue;
  const entry = (allow.allowed || []).find((a) => a.package === name);
  const severityOk =
    entry &&
    (!entry.severity ||
      entry.severity.includes(v.severity) ||
      entry.severity.includes('*'));
  const notExpired = entry && (!entry.until || entry.until >= today);
  if (entry && severityOk && notExpired) {
    allowedHits.push({ name, severity: v.severity, until: entry.until, reason: entry.reason });
  } else {
    blockers.push({
      name,
      severity: v.severity,
      range: v.range,
      why: !entry
        ? 'não listado na allowlist'
        : !notExpired
          ? `allowlist expirada (${entry.until})`
          : 'severity não coberta',
    });
  }
}

console.log('npm-audit-check');
console.log(`  allowlist: ${allowPath} (expires ${allow.expires || 'n/a'})`);
console.log(`  allowed hits: ${allowedHits.length}`);
for (const h of allowedHits) {
  console.log(`    - ${h.name} (${h.severity}) until ${h.until}`);
}
console.log(`  blockers: ${blockers.length}`);
for (const b of blockers) {
  console.log(`    - ${b.name} (${b.severity}) — ${b.why}`);
}

if (blockers.length) {
  console.error('\nFAIL: vulnerabilidades high/critical fora da allowlist.');
  process.exit(1);
}

console.log('\nOK: audit gate passed (allowlist consciente).');
process.exit(0);
