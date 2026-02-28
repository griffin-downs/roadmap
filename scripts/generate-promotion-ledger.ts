#!/usr/bin/env npx tsx
// FR-GOV-010: Promotion ledger generator.
// Produces a cryptographically stable snapshot binding all gate evidence.
//
// Determinism contract:
//   - Same commit + same artifacts → byte-identical JSON output.
//   - No wall-clock dependency: timestamp from git commit.
//   - JSON keys sorted, hashes from file contents only.
//
// Required: head.json, git SHA. Missing optional artifacts → null hash.
//
// Usage:
//   npx tsx scripts/generate-promotion-ledger.ts                  # stdout
//   npx tsx scripts/generate-promotion-ledger.ts --out <path>     # write to file
//   npx tsx scripts/generate-promotion-ledger.ts --ci-mode main   # override ci_mode
//
// ENV:
//   CI_MODE          — wip|promote|main (auto-detected from GITHUB_* if unset)
//   GITHUB_SHA       — commit SHA (falls back to git rev-parse HEAD)
//   GITHUB_BASE_REF  — PR base (for mode detection)

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { createHash } from 'crypto';
import { execSync } from 'child_process';

const root = join(import.meta.dirname, '..');

// --- argument parsing ---
const args = process.argv.slice(2);
const outIdx = args.indexOf('--out');
const outPath = outIdx !== -1 ? args[outIdx + 1] : null;
const modeIdx = args.indexOf('--ci-mode');
const modeOverride = modeIdx !== -1 ? args[modeIdx + 1] : null;

// --- deterministic hash ---
function fileHash(path: string): string | null {
  const abs = path.startsWith('/') ? path : join(root, path);
  if (!existsSync(abs)) return null;
  return createHash('sha256').update(readFileSync(abs)).digest('hex');
}

// --- git SHA ---
const gitSha = process.env.GITHUB_SHA
  || execSync('git rev-parse HEAD', { cwd: root, encoding: 'utf-8' }).trim();

// --- git commit timestamp (deterministic, not wall clock) ---
const commitTimestamp = execSync(
  `git show -s --format=%cI ${gitSha}`,
  { cwd: root, encoding: 'utf-8' },
).trim();

// --- CI mode detection ---
function detectCiMode(): string {
  if (modeOverride) return modeOverride;
  if (process.env.CI_MODE) return process.env.CI_MODE;
  const event = process.env.GITHUB_EVENT_NAME;
  const ref = process.env.GITHUB_REF || '';
  const baseRef = process.env.GITHUB_BASE_REF;
  if (event === 'push' && ref.startsWith('refs/heads/wip/')) return 'wip';
  if (event === 'pull_request' && baseRef === 'master') return 'promote';
  if (event === 'push' && (ref === 'refs/heads/master' || ref === 'refs/heads/main')) return 'main';
  return 'local';
}

// --- tool versions (deterministic: version strings only) ---
function toolVersion(cmd: string): string | null {
  try {
    return execSync(cmd, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim().split('\n')[0];
  } catch {
    return null;
  }
}

// --- artifact paths (extend as FRs land) ---
const artifacts: Record<string, string> = {
  'head.json': '.roadmap/head.json',
  'completed.json': '.roadmap/completed.json',
  'test-ledger.json': 'scripts/test-ledger.json',
  'sbom.json': 'governance/sbom.json',
  'release.manifest.json': 'governance/release.manifest.json',
  'policy-report.json': 'governance/policy-report.json',
};

// --- required artifacts (exit 1 if missing) ---
const required = ['head.json'];

// --- build hashes ---
const hashes: Record<string, string | null> = {};
for (const [name, path] of Object.entries(artifacts)) {
  hashes[name] = fileHash(path);
}

// --- check required ---
const missing = required.filter(name => hashes[name] === null);
if (missing.length > 0) {
  const err = { ok: false, error: `Required artifacts missing: ${missing.join(', ')}` };
  process.stderr.write(JSON.stringify(err) + '\n');
  process.exit(1);
}

// --- invariants (re-derive, don't trust cached results) ---
function checkDefine(): boolean {
  try {
    const { define } = require('../src/protocol.ts');
    const dag = JSON.parse(readFileSync(join(root, '.roadmap/head.json'), 'utf-8'));
    define(dag);
    return true;
  } catch {
    // fallback: run as subprocess for ESM compatibility
    try {
      execSync('npx tsx scripts/ci-dag-check.ts --define', { cwd: root, stdio: 'pipe' });
      return true;
    } catch {
      return false;
    }
  }
}

function checkNoWip(): boolean {
  // Only meaningful in PR context; true by default for push-to-master
  if (!process.env.GITHUB_BASE_REF) return true;
  try {
    execSync('npx tsx scripts/ci-intent-check.ts', {
      cwd: root,
      stdio: 'pipe',
      env: { ...process.env },
    });
    return true;
  } catch {
    return false;
  }
}

// --- assemble ledger ---
const ledger = {
  schema_version: 1,
  git_sha: gitSha,
  timestamp: commitTimestamp,
  ci_mode: detectCiMode(),
  artifact_hashes: Object.fromEntries(
    Object.entries(hashes).sort(([a], [b]) => a.localeCompare(b)),
  ),
  tool_versions: {
    node: toolVersion('node --version'),
    npm: toolVersion('npm --version'),
    tsx: toolVersion('npx tsx --version'),
    syft: toolVersion('syft --version'),
    cosign: toolVersion('cosign version'),
  },
  invariants: {
    dag_define_passed: checkDefine(),
    no_wip_commits: checkNoWip(),
  },
  ledger_hash: '', // filled below
};

// --- self-hash: hash of the ledger content without ledger_hash field ---
const contentForHash = JSON.stringify({ ...ledger, ledger_hash: undefined }, Object.keys(ledger).sort(), 0);
ledger.ledger_hash = createHash('sha256').update(contentForHash).digest('hex');

// --- output ---
const output = JSON.stringify(ledger, null, 2) + '\n';

if (outPath) {
  writeFileSync(outPath.startsWith('/') ? outPath : join(root, outPath), output);
  // Also write to stdout for CI artifact capture
  process.stdout.write(output);
} else {
  process.stdout.write(output);
}
