#!/usr/bin/env npx tsx

// @module audit
// @exports (CLI script — no programmatic exports)
// @entry tools/audit-env-bypasses

// FR-GOV-012: Scan src/, bin/, scripts/, tests/ for process.env usage.
// Classify as bypass/config/test-harness/ci. Exit 1 if any bypass keys outside tests/.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = join(import.meta.dirname, '..');
const SCAN_DIRS = ['src', 'bin', 'scripts', 'tests'];

// --- Patterns ---

const ENV_ACCESS = /process\.env\[['"](\w+)['"]\]|process\.env\.(\w+)/g;
const ENV_MERGE = /\.\.\.\s*process\.env/g;

// --- Classification ---

const BYPASS_KEYS = new Set([
  'SKIP_PLAN_GATE', 'SKIP_DAG_CHECK', 'SKIP_BATCH_COMMIT',
  'ROADMAP_VALIDATING',
]);

const CONFIG_KEYS = new Set([
  'HOME', 'PATH', 'TMPDIR', 'AGENT_ID', 'USER', 'NODE_ENV',
  'CDP_URL', 'CDP_PORT',
  'ROADMAP_EXPANSION_TYPE', 'ROADMAP_SIBLING_ROOT',
  'DEBUG',
]);

const CI_KEYS = new Set([
  'CI', 'CI_MODE',
  'GITHUB_SHA', 'GITHUB_BASE_REF', 'GITHUB_REF', 'GITHUB_EVENT_NAME',
  'PROTECTED_BRANCH',
  'VITEST_JSON', 'LEDGER_STRICT', 'LEDGER_ALLOW',
  'NODE_NO_WARNINGS',
  'TEST_CLI_PATH',
]);

export type Category = 'bypass' | 'config' | 'test-harness' | 'ci';

export interface Finding {
  file: string;
  line: number;
  variable: string;
  category: Category;
  inTestDir: boolean;
}

export interface Violation {
  file: string;
  line: number;
  variable: string;
  reason: string;
}

export interface AuditResult {
  findings: Finding[];
  summary: { total: number; bypass: number; config: number; testHarness: number; ci: number };
  violations: Violation[];
  passed: boolean;
}

export function classify(variable: string): Category {
  if (BYPASS_KEYS.has(variable)) return 'bypass';
  if (CI_KEYS.has(variable)) return 'ci';
  if (CONFIG_KEYS.has(variable)) return 'config';
  if (/^(SKIP_|BYPASS_|DISABLE_|IGNORE_)/.test(variable)) return 'bypass';
  if (/^ROADMAP_/.test(variable)) return 'bypass';
  return 'config';
}

// --- File walker ---

function walkTs(dir: string): string[] {
  const abs = join(root, dir);
  const out: string[] = [];
  try {
    for (const entry of readdirSync(abs, { withFileTypes: true })) {
      const full = join(abs, entry.name);
      if (entry.isDirectory()) {
        out.push(...walkTsAbs(full));
      } else if (entry.name.endsWith('.ts')) {
        out.push(full);
      }
    }
  } catch {
    // directory doesn't exist — skip
  }
  return out;
}

function walkTsAbs(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walkTsAbs(full));
    } else if (entry.name.endsWith('.ts')) {
      out.push(full);
    }
  }
  return out;
}

// --- Scanner ---

export function scan(projectRoot?: string): AuditResult {
  const scanRoot = projectRoot ?? root;
  const findings: Finding[] = [];

  for (const dir of SCAN_DIRS) {
    const absDir = join(scanRoot, dir);
    let files: string[];
    try {
      files = walkTsFromRoot(absDir);
    } catch {
      continue;
    }

    for (const absPath of files) {
      const rel = relative(scanRoot, absPath);
      const inTestDir = rel.startsWith('tests/') || rel.startsWith('tests\\');
      const content = readFileSync(absPath, 'utf-8');
      const lines = content.split('\n');

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        // Named env access
        let match: RegExpExecArray | null;
        ENV_ACCESS.lastIndex = 0;
        while ((match = ENV_ACCESS.exec(line)) !== null) {
          const variable = match[1] || match[2];
          if (!variable) continue;
          const cat = classify(variable);
          // test-harness: bypass/config keys inside test dir reclassify
          const category: Category = inTestDir && cat === 'bypass' ? 'test-harness' : cat;
          findings.push({ file: rel, line: i + 1, variable, category, inTestDir });
        }
      }
    }
  }

  // Summary
  const summary = { total: 0, bypass: 0, config: 0, testHarness: 0, ci: 0 };
  for (const f of findings) {
    summary.total++;
    if (f.category === 'bypass') summary.bypass++;
    else if (f.category === 'config') summary.config++;
    else if (f.category === 'test-harness') summary.testHarness++;
    else if (f.category === 'ci') summary.ci++;
  }

  // Violations: bypass keys outside tests/
  const violations: Violation[] = findings
    .filter(f => f.category === 'bypass' && !f.inTestDir)
    .map(f => ({
      file: f.file,
      line: f.line,
      variable: f.variable,
      reason: 'bypass key outside tests/',
    }));

  return { findings, summary, violations, passed: violations.length === 0 };
}

function walkTsFromRoot(dir: string): string[] {
  const out: string[] = [];
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walkTsFromRoot(full));
    } else if (entry.name.endsWith('.ts')) {
      out.push(full);
    }
  }
  return out;
}

// --- Main (when run as script) ---

const isMain = process.argv[1] && (
  process.argv[1].endsWith('audit-env-bypasses.ts') ||
  process.argv[1].includes('audit-env-bypasses')
);

if (isMain) {
  const result = scan();
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.passed ? 0 : 1);
}
