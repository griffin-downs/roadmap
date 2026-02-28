#!/usr/bin/env npx tsx
// @module gitsha-gate
// @exports (CI script — no programmatic exports)
//
// US1: Verify all completion records in completed.json have gitSha.
// Exit 0: all records have gitSha (or no completed.json exists).
// Exit 1: at least one record is missing gitSha.
//
// stdout: JSON { passed, total, withGitSha, missing }

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '../..');
const completedPath = join(root, '.roadmap', 'completed.json');

if (!existsSync(completedPath)) {
  process.stdout.write(JSON.stringify({ passed: true, total: 0, withGitSha: 0, missing: [] }) + '\n');
  process.exit(0);
}

let records: any[];
try {
  records = JSON.parse(readFileSync(completedPath, 'utf-8'));
  if (!Array.isArray(records)) {
    process.stdout.write(JSON.stringify({ passed: false, error: 'completed.json is not an array' }) + '\n');
    process.exit(1);
  }
} catch (e: any) {
  process.stdout.write(JSON.stringify({ passed: false, error: `Failed to parse completed.json: ${e.message}` }) + '\n');
  process.exit(1);
}

const withGitSha = records.filter(r => typeof r.gitSha === 'string' && r.gitSha.length > 0);
const missing = records
  .filter(r => !r.gitSha)
  .map(r => ({ nodeId: r.nodeId, completedAt: r.completedAt }));

const passed = missing.length === 0;

process.stdout.write(JSON.stringify({
  passed,
  total: records.length,
  withGitSha: withGitSha.length,
  missing,
}, null, 2) + '\n');

if (!passed) {
  process.stderr.write(
    `\ngitsha-gate: ${missing.length} completion record(s) missing gitSha:\n` +
    missing.map(m => `  - ${m.nodeId} (completed ${m.completedAt})`).join('\n') + '\n',
  );
}

process.exit(passed ? 0 : 1);
