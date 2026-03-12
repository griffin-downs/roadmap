import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { loadFleetContext } from '../src/runtime/fleet.ts';
import { writeLoopReceipt, readLoopHistory, verifyLoopChain } from '../src/runtime/loop.ts';
import type { LoopReceipt } from '../src/lib/fleet-types.ts';

let compilerDir: string;
let repoADir: string;
let repoBDir: string;

function setupRepo(dir: string, dagId: string, remaining: number): void {
  mkdirSync(join(dir, '.roadmap'), { recursive: true });
  const nodes: Record<string, unknown> = {
    init: { id: 'init', desc: 'start', produces: [], consumes: [], deps: [] },
  };
  for (let i = 0; i < remaining; i++) {
    nodes[`task-${i}`] = { id: `task-${i}`, desc: `task ${i}`, produces: [], consumes: [], deps: ['init'] };
  }
  nodes['term'] = { id: 'term', desc: 'end', produces: [], consumes: [], deps: remaining > 0 ? [`task-${remaining - 1}`] : ['init'] };

  writeFileSync(join(dir, '.roadmap', 'head.json'), JSON.stringify({
    id: dagId, desc: 'test dag', init: 'init', term: 'term', nodes,
  }));
  // Write proper completed.json as array
  writeFileSync(join(dir, '.roadmap', 'completed.json'), '[]');
}

beforeEach(() => {
  compilerDir = mkdtempSync(join(tmpdir(), 'fleet-int-compiler-'));
  repoADir = mkdtempSync(join(tmpdir(), 'fleet-int-a-'));
  repoBDir = mkdtempSync(join(tmpdir(), 'fleet-int-b-'));

  mkdirSync(join(compilerDir, '.roadmap'), { recursive: true });
  writeFileSync(join(compilerDir, '.roadmap', 'completed.json'), '[]');

  setupRepo(repoADir, 'dag-a', 2);
  setupRepo(repoBDir, 'dag-b', 0);

  writeFileSync(join(compilerDir, '.roadmap', 'fleet.json'), JSON.stringify({
    compiler: '.',
    repos: [
      { name: 'repo-a', path: repoADir },
      { name: 'repo-b', path: repoBDir },
    ],
  }));
});

afterEach(() => {
  rmSync(compilerDir, { recursive: true, force: true });
  rmSync(repoADir, { recursive: true, force: true });
  rmSync(repoBDir, { recursive: true, force: true });
});

describe('fleet orient integration', () => {
  it('loads fleet context with mixed repo states', () => {
    const fleet = loadFleetContext(compilerDir);
    expect(fleet.repos).toHaveLength(2);
    expect(fleet.repos[0].context).not.toBeNull();
    expect(fleet.repos[1].context).not.toBeNull();
  });

  it('handles repo with no head.json gracefully', () => {
    rmSync(join(repoADir, '.roadmap', 'head.json'));
    const fleet = loadFleetContext(compilerDir);
    expect(fleet.repos[0].warning).toContain('no .roadmap/head.json');
    expect(fleet.repos[0].context).toBeNull();
  });
});

describe('loop lifecycle integration', () => {
  it('start → generate → mine → close writes receipt chain', () => {
    // Start iteration 0
    const r0: LoopReceipt = {
      iteration: 0,
      startedAt: new Date().toISOString(),
      compilerCommit: 'abc123',
      generations: [],
      previousSha: null,
    };
    const written0 = writeLoopReceipt(compilerDir, r0);
    expect(written0.sha).toBeDefined();

    // Generate for repo-a
    written0.generations.push({
      repo: 'repo-a', dagId: 'dag-a', headCommit: 'def456', status: 'active',
    });
    writeLoopReceipt(compilerDir, written0);

    // Generate for repo-b
    written0.generations.push({
      repo: 'repo-b', dagId: 'dag-b', headCommit: 'ghi789', status: 'complete',
    });
    writeLoopReceipt(compilerDir, written0);

    // Mine
    written0.mining = {
      extracted: ['shared pattern X'],
      requestFixes: ['repo-a.json: added field Y'],
      stalled: [],
    };
    writeLoopReceipt(compilerDir, written0);

    // Close
    written0.closedAt = new Date().toISOString();
    const closed0 = writeLoopReceipt(compilerDir, written0);

    // Start iteration 1 linked to iteration 0
    const r1: LoopReceipt = {
      iteration: 1,
      startedAt: new Date().toISOString(),
      compilerCommit: 'jkl012',
      generations: [],
      previousSha: closed0.sha!,
    };
    const written1 = writeLoopReceipt(compilerDir, r1);

    // Close iteration 1
    written1.closedAt = new Date().toISOString();
    writeLoopReceipt(compilerDir, written1);

    // Verify chain
    const history = readLoopHistory(compilerDir);
    expect(history).toHaveLength(2);
    expect(history[0].iteration).toBe(0);
    expect(history[1].iteration).toBe(1);
    expect(history[0].mining!.extracted).toContain('shared pattern X');

    const chainResult = verifyLoopChain(history);
    expect(chainResult.valid).toBe(true);
  });

  it('detects broken SHA chain across iterations', () => {
    const r0: LoopReceipt = {
      iteration: 0,
      startedAt: new Date().toISOString(),
      compilerCommit: 'abc',
      generations: [],
      previousSha: null,
    };
    writeLoopReceipt(compilerDir, r0);

    // Write iteration 1 with wrong previousSha
    const r1: LoopReceipt = {
      iteration: 1,
      startedAt: new Date().toISOString(),
      compilerCommit: 'def',
      generations: [],
      previousSha: 'wrong-sha-value',
    };
    writeLoopReceipt(compilerDir, r1);

    const history = readLoopHistory(compilerDir);
    const result = verifyLoopChain(history);
    expect(result.valid).toBe(false);
    expect(result.brokenAt).toBe(1);
  });

  it('loop receipts persist across reads', () => {
    const r: LoopReceipt = {
      iteration: 0,
      startedAt: '2026-03-12T10:00:00Z',
      compilerCommit: 'abc',
      generations: [{ repo: 'keel', dagId: 'seed', headCommit: 'def', status: 'complete' }],
      mining: { extracted: ['pattern A'], requestFixes: [], stalled: [] },
      previousSha: null,
    };
    writeLoopReceipt(compilerDir, r);

    // Re-read from disk
    const history = readLoopHistory(compilerDir);
    expect(history).toHaveLength(1);
    expect(history[0].compilerCommit).toBe('abc');
    expect(history[0].generations[0].repo).toBe('keel');
    expect(history[0].mining!.extracted).toContain('pattern A');
    expect(history[0].sha).toBeDefined();
  });
});
