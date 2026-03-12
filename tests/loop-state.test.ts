import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { writeLoopReceipt, readLoopHistory, computeLoopSha, verifyLoopChain } from '../src/runtime/loop.ts';
import type { LoopReceipt } from '../src/lib/fleet-types.ts';

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'loop-state-'));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

function makeReceipt(iteration: number, previousSha: string | null): LoopReceipt {
  return {
    iteration,
    startedAt: '2026-03-12T10:00:00Z',
    compilerCommit: `commit-${iteration}`,
    generations: [{ repo: 'keel', dagId: `dag-${iteration}`, headCommit: `head-${iteration}`, status: 'complete' }],
    previousSha,
  };
}

describe('computeLoopSha', () => {
  it('is deterministic', () => {
    const r = makeReceipt(0, null);
    expect(computeLoopSha(r)).toBe(computeLoopSha(r));
  });

  it('excludes sha field', () => {
    const r = makeReceipt(0, null);
    const withSha = { ...r, sha: 'garbage' };
    expect(computeLoopSha(withSha)).toBe(computeLoopSha(r));
  });

  it('changes with content', () => {
    const a = makeReceipt(0, null);
    const b = makeReceipt(1, null);
    expect(computeLoopSha(a)).not.toBe(computeLoopSha(b));
  });
});

describe('writeLoopReceipt', () => {
  it('creates loops directory and writes file', () => {
    const r = makeReceipt(0, null);
    const written = writeLoopReceipt(tmpDir, r);
    expect(written.sha).toBeDefined();
    expect(existsSync(join(tmpDir, '.roadmap/loops/0.json'))).toBe(true);
  });

  it('written file is parseable', () => {
    const r = makeReceipt(0, null);
    writeLoopReceipt(tmpDir, r);
    const content = JSON.parse(readFileSync(join(tmpDir, '.roadmap/loops/0.json'), 'utf-8'));
    expect(content.iteration).toBe(0);
    expect(content.sha).toBeDefined();
  });
});

describe('readLoopHistory', () => {
  it('returns empty for missing directory', () => {
    expect(readLoopHistory(tmpDir)).toEqual([]);
  });

  it('reads and sorts receipts', () => {
    writeLoopReceipt(tmpDir, makeReceipt(0, null));
    const r0 = readLoopHistory(tmpDir)[0];
    const r1 = writeLoopReceipt(tmpDir, makeReceipt(1, r0.sha!));
    writeLoopReceipt(tmpDir, makeReceipt(2, r1.sha!));

    const history = readLoopHistory(tmpDir);
    expect(history).toHaveLength(3);
    expect(history[0].iteration).toBe(0);
    expect(history[2].iteration).toBe(2);
  });
});

describe('verifyLoopChain', () => {
  it('validates correct chain', () => {
    const r0 = writeLoopReceipt(tmpDir, makeReceipt(0, null));
    const r1 = writeLoopReceipt(tmpDir, makeReceipt(1, r0.sha!));
    writeLoopReceipt(tmpDir, makeReceipt(2, r1.sha!));

    const history = readLoopHistory(tmpDir);
    expect(verifyLoopChain(history)).toEqual({ valid: true });
  });

  it('detects broken chain', () => {
    writeLoopReceipt(tmpDir, makeReceipt(0, null));
    writeLoopReceipt(tmpDir, makeReceipt(1, 'wrong-sha'));

    const history = readLoopHistory(tmpDir);
    expect(verifyLoopChain(history).valid).toBe(false);
    expect(verifyLoopChain(history).brokenAt).toBe(1);
  });

  it('validates empty chain', () => {
    expect(verifyLoopChain([])).toEqual({ valid: true });
  });

  it('rejects first receipt with non-null previousSha', () => {
    writeLoopReceipt(tmpDir, { ...makeReceipt(0, 'should-be-null') });
    const history = readLoopHistory(tmpDir);
    expect(verifyLoopChain(history).valid).toBe(false);
  });
});
