#!/usr/bin/env node
/**
 * Pre-migration diagnostic for 20260810010000_architecture_integrity.
 *
 * Usage (repo root):
 *   npm run db:migration-safety:diagnose
 *   node scripts/migration-safety/diagnose.mjs --db agenda_pro_mig_safety_r4
 *
 * Exit codes:
 *   0 = OK (safe)
 *   2 = WARN_DEDUP (migration will mutate phones/waitlist; no overlap blocker)
 *   1 = BLOCK (active overlaps — EXCLUDE will fail) or tooling error
 *
 * Never targets production by default — requires explicit --allow-production.
 */

import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..', '..');

function parseArgs(argv) {
  const out = {
    db: process.env.MIGRATION_SAFETY_DB || '',
    url: process.env.DATABASE_URL || '',
    user: process.env.POSTGRES_USER || 'agenda',
    container: process.env.POSTGRES_CONTAINER || 'agenda-pro-postgres',
    jsonOut: '',
    allowProduction: false,
    verbose: false,
    help: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--db') out.db = argv[++i];
    else if (a === '--url') out.url = argv[++i];
    else if (a === '--user') out.user = argv[++i];
    else if (a === '--container') out.container = argv[++i];
    else if (a === '--json-out') out.jsonOut = argv[++i];
    else if (a === '--allow-production') out.allowProduction = true;
    else if (a === '--verbose' || a === '-v') out.verbose = true;
    else if (a === '--help' || a === '-h') out.help = true;
  }
  return out;
}

function usage() {
  console.log(`diagnose.mjs — pré-check architecture_integrity

Options:
  --db <name>           Database name via docker exec (preferred for local)
  --url <DATABASE_URL>  Used only to derive db name if --db omitted
  --json-out <path>     Write machine summary JSON
  --allow-production    Required if URL/db name looks like production
  --verbose             Print full SQL report

Exit: 0 OK | 2 WARN_DEDUP | 1 BLOCK/error`);
}

function looksProduction(db, url) {
  const hay = `${db} ${url}`.toLowerCase();
  return /prod|production|railway|render\.com|supabase\.co|neon\.tech|amazonaws|azure/.test(hay);
}

function dbFromUrl(url) {
  try {
    const u = new URL(url);
    return u.pathname.replace(/^\//, '').split('?')[0] || '';
  } catch {
    return '';
  }
}

function runPsqlFile({ container, user, db, file, tuplesOnly = false }) {
  const sql = readFileSync(file, 'utf8');
  const args = ['exec', '-i', container, 'psql', '-U', user, '-d', db, '-v', 'ON_ERROR_STOP=1'];
  if (tuplesOnly) args.push('-t', '-A', '-F', '|');
  args.push('-f', '-');
  return spawnSync('docker', args, {
    input: sql,
    encoding: 'utf8',
    cwd: repoRoot,
    maxBuffer: 10 * 1024 * 1024,
  });
}

function parseSummary(stdout) {
  const lines = stdout
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i--) {
    const parts = lines[i].split('|');
    if (parts.length === 4 && /^(OK|BLOCK|WARN_DEDUP)$/.test(parts[3])) {
      return {
        overlap_pairs: Number(parts[0]),
        phone_soft_deletes: Number(parts[1]),
        waitlist_expires: Number(parts[2]),
        verdict: parts[3],
      };
    }
  }
  return null;
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    usage();
    process.exit(0);
  }

  const db = opts.db || dbFromUrl(opts.url) || process.env.POSTGRES_DB || 'agenda_pro';
  if (looksProduction(db, opts.url) && !opts.allowProduction) {
    console.error(
      `Refusing DB that looks like production (${db}). Pass --allow-production if intentional.`,
    );
    process.exit(1);
  }

  const summaryFile = join(__dirname, 'diagnose-summary.sql');
  const fullFile = join(__dirname, 'diagnose-architecture-integrity.sql');

  if (opts.verbose) {
    const full = runPsqlFile({
      container: opts.container,
      user: opts.user,
      db,
      file: fullFile,
      tuplesOnly: false,
    });
    if (full.status !== 0) {
      console.error(full.stderr || full.stdout || 'psql failed');
      process.exit(1);
    }
    process.stdout.write(full.stdout);
  }

  const summaryRes = runPsqlFile({
    container: opts.container,
    user: opts.user,
    db,
    file: summaryFile,
    tuplesOnly: true,
  });
  if (summaryRes.status !== 0) {
    console.error(summaryRes.stderr || summaryRes.stdout || 'summary query failed');
    process.exit(1);
  }

  const summary = parseSummary(summaryRes.stdout);
  if (!summary) {
    console.error('Could not parse summary from psql output:');
    console.error(summaryRes.stdout);
    process.exit(1);
  }

  const report = {
    migration: '20260810010000_architecture_integrity',
    database: db,
    checkedAt: new Date().toISOString(),
    ...summary,
    notes: {
      overlaps: 'BLOCKER — EXCLUDE GiST fails; migration does not auto-resolve overlaps',
      phones: 'dedup soft-deletes rn>1 (keeps oldest createdAt,id)',
      waitlist: 'dedup sets status=EXPIRED for rn>1 open rows',
    },
  };

  console.log(JSON.stringify(report, null, 2));

  if (opts.jsonOut) {
    mkdirSync(dirname(opts.jsonOut), { recursive: true });
    writeFileSync(opts.jsonOut, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  }

  if (summary.verdict === 'BLOCK') process.exit(1);
  if (summary.verdict === 'WARN_DEDUP') process.exit(2);
  process.exit(0);
}

main();
