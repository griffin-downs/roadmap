// @module plan-status-tests
// Tests for `roadmap plan status` CLI subcommand.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { writePointer } from '../src/lib/receipts/plan-selected-pointer.ts';

const repoRoot = join(import.meta.dirname, '..');
const bin = join(repoRoot, 'bin', 'roadmap.ts');

const minimalDag = {
  id: 'test-dag', desc: 'test', init: 'a', term: 'b',
  nodes: {
    a: { id: 'a', desc: 'init', produces: [], consumes: [], deps: [], validate: [], idempotent: true },
    b: { id: 'b', desc: 'term', produces: [], consumes: [], deps: ['a'], validate: [], idempotent: true },
  },
};

function headSha(dir: string): string {
  const bytes = readFileSync(join(dir, '.roadmap', 'head.json'));
  return createHash('sha256').update(bytes).digest('hex');
}

function writePlanReceipt(dir: string, candidateId: string, sha: string) {
  const receiptsDir = join(dir, '.roadmap', 'receipts');
  mkdirSync(receiptsDir, { recursive: true });
  const receiptFile = `plan-select-test123.json`;
  writeFileSync(join(receiptsDir, receiptFile), JSON.stringify({
    type: 'plan-select',
    headSha: sha,
    candidateId,
    selectedAt: '2026-02-28T12:00:00.000Z',
    selector: 'test-user',
    note: 'test selection',
  }, null, 2) + '\n');
  return receiptFile;
}

function runCli(cwd: string, env?: Record<string, string>) {
  const cleanEnv = { ...process.env };
  delete cleanEnv['SKIP_PLAN_GATE'];
  const r = spawnSync('npx', ['tsx', bin, 'plan', 'status'], {
    cwd,
    encoding: 'utf-8',
    env: { ...cleanEnv, ...env },
  });
  let result: any = null;
  try {
    const raw = JSON.parse(r.stdout);
    if (raw && typeof raw === 'object' && 'schema_version' in raw) {
      if ('data' in raw) result = raw.data;
      else if ('error' in raw) result = { error: raw.error.message ?? raw.error, ...raw.error };
      else result = raw;
    } else {
      result = raw;
    }
  } catch { /* not JSON */ }
  return { status: r.status ?? -1, result, stdout: r.stdout, stderr: r.stderr };
}

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'plan-status-'));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('plan status — no roadmap', () => {
  it('exits 1 with error when no .roadmap/head.json', () => {
    const { status, result } = runCli(tmpDir);
    expect(status).toBe(1);
    expect(result).not.toBeNull();
    expect(result.error).toMatch(/no roadmap/i);
  });
});

describe('plan status — no pointer', () => {
  beforeEach(() => {
    mkdirSync(join(tmpDir, '.roadmap'), { recursive: true });
    writeFileSync(join(tmpDir, '.roadmap', 'head.json'), JSON.stringify(minimalDag, null, 2));
  });

  it('exits 1 with invalid status, reason, and fix', () => {
    const { status, result } = runCli(tmpDir);
    expect(status).toBe(1);
    expect(result.status).toBe('invalid');
    expect(result.reason).toMatch(/missing/i);
    expect(result.fix).toMatch(/plan select/);
  });
});

describe('plan status — valid pointer', () => {
  beforeEach(() => {
    mkdirSync(join(tmpDir, '.roadmap'), { recursive: true });
    writeFileSync(join(tmpDir, '.roadmap', 'head.json'), JSON.stringify(minimalDag, null, 2));
    const sha = headSha(tmpDir);
    const receiptFile = writePlanReceipt(tmpDir, 'main', sha);
    writePointer(tmpDir, { receipt: receiptFile, headSha: sha, candidateId: 'main' });
  });

  it('exits 0 with valid status, headShaMatch true, receipt field', () => {
    const { status, result } = runCli(tmpDir);
    expect(status).toBe(0);
    expect(result.status).toBe('valid');
    expect(result.headShaMatch).toBe(true);
    expect(result.receipt).toMatch(/plan-select/);
    expect(result.candidateId).toBe('main');
    expect(result.headSha).toBeTruthy();
    expect(result.selectedAt).toBeTruthy();
    expect(result.selector).toBe('test-user');
  });
});

describe('plan status — stale pointer', () => {
  beforeEach(() => {
    mkdirSync(join(tmpDir, '.roadmap'), { recursive: true });
    writeFileSync(join(tmpDir, '.roadmap', 'head.json'), JSON.stringify(minimalDag, null, 2));
    const sha = headSha(tmpDir);
    const receiptFile = writePlanReceipt(tmpDir, 'main', sha);
    writePointer(tmpDir, { receipt: receiptFile, headSha: sha, candidateId: 'main' });
    // Mutate head.json to invalidate sha
    writeFileSync(join(tmpDir, '.roadmap', 'head.json'), JSON.stringify({ ...minimalDag, desc: 'mutated' }, null, 2));
  });

  it('exits 1 with invalid status, headShaMatch false, fix, staleReceipt with receipt field', () => {
    const { status, result } = runCli(tmpDir);
    expect(status).toBe(1);
    expect(result.status).toBe('invalid');
    expect(result.headShaMatch).toBe(false);
    expect(result.fix).toMatch(/plan select/);
    expect(result.staleReceipt).toBeDefined();
    expect(result.staleReceipt.candidateId).toBe('main');
    expect(result.staleReceipt.receipt).toMatch(/plan-select/);
  });
});
