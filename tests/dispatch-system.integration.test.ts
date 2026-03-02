import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runOrchestrator } from '../src/lib/agent-dispatch/orchestrator.ts';
import { loadFinal, loadHandoffChain } from '../src/lib/agent-dispatch/handoff-journal.ts';
import type { Graph } from '../src/protocol.ts';

// Minimal DAG: init -> node-a, node-b -> term
function makeTestDAG(): Graph<string> {
  return {
    id: 'test-dispatch',
    desc: 'Test DAG for dispatch integration',
    init: 'init',
    term: 'term',
    nodes: {
      init: {
        id: 'init',
        desc: 'Init node',
        produces: ['init.txt'],
        consumes: [],
        deps: [],
        validate: [],
        idempotent: true,
      },
      'node-a': {
        id: 'node-a',
        desc: 'First work node',
        produces: ['a.txt'],
        consumes: [{ artifact: 'init.txt' }],
        deps: ['init'],
        validate: [],
        idempotent: true,
      },
      'node-b': {
        id: 'node-b',
        desc: 'Second work node',
        produces: ['b.txt'],
        consumes: [{ artifact: 'init.txt' }],
        deps: ['init'],
        validate: [],
        idempotent: true,
      },
      term: {
        id: 'term',
        desc: 'Terminal node',
        produces: [],
        consumes: [{ artifact: 'a.txt' }, { artifact: 'b.txt' }],
        deps: ['node-a', 'node-b'],
        validate: [],
        idempotent: true,
      },
    } as any,
  };
}

describe('dispatch-system integration', () => {
  let tmpRoot: string;

  beforeEach(async () => {
    tmpRoot = await mkdtemp(join(tmpdir(), 'dispatch-'));
    await writeFile(join(tmpRoot, 'init.txt'), 'init', 'utf-8');
    await mkdir(join(tmpRoot, '.roadmap'), { recursive: true });
  });

  afterEach(async () => {
    await rm(tmpRoot, { recursive: true });
  });

  it('should dispatch and execute a parallel batch', async () => {
    const dag = makeTestDAG();
    const result = await runOrchestrator({
      dag,
      repoRoot: tmpRoot,
      currentBatch: ['node-a', 'node-b'],
      level: 1,
      agents: ['w1', 'w2'],
      parallel: true,
    });

    expect(result.batchLevel).toBe(1);
    expect(result.assignments).toHaveLength(2);
    expect(result.results).toHaveLength(2);
    expect(result.assignments[0].agentId).toBe('w1');
    expect(result.assignments[1].agentId).toBe('w2');
  });

  it('should dispatch and execute sequentially', async () => {
    const dag = makeTestDAG();
    const result = await runOrchestrator({
      dag,
      repoRoot: tmpRoot,
      currentBatch: ['node-a'],
      level: 1,
      agents: ['w1'],
      parallel: false,
    });

    expect(result.batchLevel).toBe(1);
    expect(result.results).toHaveLength(1);
    expect(result.results[0].nodeId).toBe('node-a');
  });

  it('should write handoffs during execution', async () => {
    const dag = makeTestDAG();
    await runOrchestrator({
      dag,
      repoRoot: tmpRoot,
      currentBatch: ['node-a'],
      level: 1,
      agents: ['w1'],
    });

    const chain = await loadHandoffChain(tmpRoot, 'node-a');
    expect(chain.length).toBeGreaterThan(0);

    const final = await loadFinal(tmpRoot, 'node-a');
    expect(final).toBeDefined();
    expect(final!.progress).toBe(1.0);
  });

  it('should handle single agent across multiple nodes', async () => {
    const dag = makeTestDAG();
    const result = await runOrchestrator({
      dag,
      repoRoot: tmpRoot,
      currentBatch: ['node-a', 'node-b'],
      level: 1,
      agents: ['w1'],
    });

    expect(result.assignments[0].agentId).toBe('w1');
    expect(result.assignments[1].agentId).toBe('w1');
    expect(result.results).toHaveLength(2);
  });

  it('should collect final handoffs per node', async () => {
    const dag = makeTestDAG();
    await runOrchestrator({
      dag,
      repoRoot: tmpRoot,
      currentBatch: ['node-a', 'node-b'],
      level: 1,
      agents: ['w1', 'w2'],
      parallel: true,
    });

    const finalA = await loadFinal(tmpRoot, 'node-a');
    const finalB = await loadFinal(tmpRoot, 'node-b');
    expect(finalA).toBeDefined();
    expect(finalB).toBeDefined();
    expect(finalA!.nextNodeEntry.ready).toBe(true);
    expect(finalB!.nextNodeEntry.ready).toBe(true);
  });
});
