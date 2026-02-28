// @module plan-exec-gate-tests
// Tests for src/lib/plan-gate.ts (unit) and CLI gate integration (complete, advance, expand).

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { requirePlanGate } from '../src/lib/plan-gate.ts';
import { writePointer } from '../src/lib/receipts/plan-selected-pointer.ts';

let tmpDir: string;
const minimalDag = { id: 'test-dag', desc: 'test', init: 'a', term: 'b', nodes: {
  a: { id: 'a', desc: 'init', produces: [], consumes: [], deps: [], validate: [], idempotent: true },
  b: { id: 'b', desc: 'term', produces: [], consumes: [], deps: ['a'], validate: [], idempotent: true },
} };

function headSha(dir: string): string {
  const bytes = readFileSync(join(dir, '.roadmap', 'head.json'));
  return createHash('sha256').update(bytes).digest('hex');
}

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'plan-exec-gate-'));
  mkdirSync(join(tmpDir, '.roadmap'), { recursive: true });
  writeFileSync(join(tmpDir, '.roadmap', 'head.json'), JSON.stringify(minimalDag, null, 2));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

// --- Unit tests: requirePlanGate ---

describe('requirePlanGate', () => {
  it('returns ok:false when no PLAN_SELECTED.json exists', () => {
    const result = requirePlanGate(tmpDir);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toMatch(/missing/i);
      expect(result.fix).toMatch(/plan select/);
    }
  });

  it('returns ok:true when pointer headSha matches current head.json', () => {
    const sha = headSha(tmpDir);
    writePointer(tmpDir, { receipt: 'plan-select-abc.json', headSha: sha, candidateId: 'main' });
    const result = requirePlanGate(tmpDir);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.pointer.candidateId).toBe('main');
      expect(result.pointer.headSha).toBe(sha);
    }
  });

  it('returns ok:false when headSha mismatches (stale pointer)', () => {
    const sha = headSha(tmpDir);
    writePointer(tmpDir, { receipt: 'plan-select-abc.json', headSha: sha, candidateId: 'main' });
    // Mutate head.json so sha diverges
    writeFileSync(join(tmpDir, '.roadmap', 'head.json'), JSON.stringify({ ...minimalDag, desc: 'mutated' }, null, 2));
    const result = requirePlanGate(tmpDir);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toMatch(/mismatch/i);
      expect(result.fix).toMatch(/plan select/);
    }
  });
});

// --- CLI integration tests ---

const repoRoot = join(import.meta.dirname, '..');
const bin = join(repoRoot, 'bin', 'roadmap.ts');

function runCli(cmd: string, cwd: string, env?: Record<string, string>) {
  const r = spawnSync('npx', ['tsx', bin, ...cmd.split(' ')], {
    cwd,
    encoding: 'utf-8',
    env: { ...process.env, ...env },
  });
  let result: any = null;
  try { result = JSON.parse(r.stdout); } catch { /* not JSON */ }
  return { status: r.status ?? -1, result, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}

describe('CLI plan gate integration', () => {
  it('complete rejects without PLAN_SELECTED.json', () => {
    const { status, result } = runCli('complete a --note test', tmpDir);
    expect(status).toBe(1);
    expect(result).not.toBeNull();
    expect(result.error).toMatch(/missing/i);
    expect(result.fix).toMatch(/plan select/);
  });

  it('complete proceeds with SKIP_PLAN_GATE=1', () => {
    // Without a plan pointer but with SKIP_PLAN_GATE, gate should be bypassed.
    // It will still fail downstream (no completed.json, etc.) but NOT on the gate.
    const { result } = runCli('complete a --note test', tmpDir, { SKIP_PLAN_GATE: '1' });
    // Should NOT contain the plan-gate error
    if (result) {
      expect(result.error ?? '').not.toMatch(/plan select/i);
    }
  });

  it('advance rejects without PLAN_SELECTED.json', () => {
    const { status, result } = runCli('advance --note test', tmpDir);
    expect(status).toBe(1);
    expect(result).not.toBeNull();
    expect(result.error).toMatch(/missing/i);
  });

  it('expand rejects without PLAN_SELECTED.json', () => {
    // expand needs a script arg, but gate runs first
    const { status, result } = runCli('expand fake.ts --note test', tmpDir);
    expect(status).toBe(1);
    expect(result).not.toBeNull();
    expect(result.error).toMatch(/missing/i);
  });
});
