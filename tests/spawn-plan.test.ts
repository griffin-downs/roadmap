import { describe, it, expect } from 'vitest';
import { buildSpawnPlan } from '../src/lib/recipes/spawn/spawn-plan.ts';
import { define } from '../src/protocol.ts';
import type { Graph } from '../src/protocol.ts';

// Minimal DAG builders
function linearDag(): Graph<'init' | 'a' | 'term'> {
  return define({
    id: 'linear', desc: 'linear', init: 'init', term: 'term',
    nodes: {
      init: { id: 'init', desc: 'start', produces: ['x'], consumes: [], deps: [], validate: [], idempotent: true },
      a:    { id: 'a',    desc: 'middle', produces: ['y'], consumes: ['x'], deps: ['init'], validate: [], idempotent: true },
      term: { id: 'term', desc: 'end', produces: [], consumes: ['y'], deps: ['a'], validate: [], idempotent: false },
    },
  });
}

function parallelDag(): Graph<'init' | 'a' | 'b' | 'term'> {
  return define({
    id: 'parallel', desc: 'parallel', init: 'init', term: 'term',
    nodes: {
      init: { id: 'init', desc: 'start', produces: ['base'], consumes: [], deps: [], validate: [], idempotent: true },
      a:    { id: 'a', desc: 'worker a', produces: ['out-a'], consumes: ['base'], deps: ['init'], validate: [], idempotent: true },
      b:    { id: 'b', desc: 'worker b', produces: ['out-b'], consumes: ['base'], deps: ['init'], validate: [], idempotent: true },
      term: { id: 'term', desc: 'end', produces: [], consumes: ['out-a', 'out-b'], deps: ['a', 'b'], validate: [], idempotent: false },
    },
  });
}

function conflictDag(): Graph<'init' | 'a' | 'b' | 'term'> {
  return define({
    id: 'conflict', desc: 'conflict', init: 'init', term: 'term',
    nodes: {
      init: { id: 'init', desc: 'start', produces: ['base'], consumes: [], deps: [], validate: [], idempotent: true },
      a:    { id: 'a', desc: 'writer a', produces: ['shared.ts'], consumes: ['base'], deps: ['init'], validate: [], idempotent: true },
      b:    { id: 'b', desc: 'writer b', produces: ['shared.ts'], consumes: ['base'], deps: ['init'], validate: [], idempotent: true },
      term: { id: 'term', desc: 'end', produces: [], consumes: ['shared.ts'], deps: ['a', 'b'], validate: [], idempotent: false },
    },
  });
}

describe('buildSpawnPlan', () => {
  it('linear dag: 3 single-node batches, no teams', () => {
    const plan = buildSpawnPlan(linearDag());
    expect(plan.totalBatches).toBe(3);
    expect(plan.teamBatches).toBe(0);
    expect(plan.batches.every(b => !b.spawnTeam)).toBe(true);
    expect(plan.batches.every(b => b.workerCount === 1)).toBe(true);
  });

  it('linear dag: gatedBy chain is null → 0 → 1', () => {
    const plan = buildSpawnPlan(linearDag());
    expect(plan.batches[0].gatedBy).toBeNull();
    expect(plan.batches[1].gatedBy).toBe(0);
    expect(plan.batches[2].gatedBy).toBe(1);
  });

  it('parallel dag: middle batch spawns team with 2 workers', () => {
    const plan = buildSpawnPlan(parallelDag());
    expect(plan.teamBatches).toBe(1);
    const teamBatch = plan.batches.find(b => b.spawnTeam)!;
    expect(teamBatch.workerCount).toBe(2);
    expect(teamBatch.workers.map(w => w.nodeId).sort()).toEqual(['a', 'b']);
  });

  it('parallel dag: workers carry produces/consumes from dag', () => {
    const plan = buildSpawnPlan(parallelDag());
    const teamBatch = plan.batches.find(b => b.spawnTeam)!;
    const workerA = teamBatch.workers.find(w => w.nodeId === 'a')!;
    expect(workerA.produces).toEqual(['out-a']);
    expect(workerA.consumes).toEqual(['base']);
  });

  it('parallel dag: workerId is 1-indexed within batch', () => {
    const plan = buildSpawnPlan(parallelDag());
    const teamBatch = plan.batches.find(b => b.spawnTeam)!;
    const ids = teamBatch.workers.map(w => w.workerId).sort();
    expect(ids).toEqual([1, 2]);
  });

  it('conflict dag: reports produces-overlap conflict in parallel batch', () => {
    const plan = buildSpawnPlan(conflictDag());
    const teamBatch = plan.batches.find(b => b.spawnTeam)!;
    expect(teamBatch.conflicts.length).toBeGreaterThan(0);
    const conflict = teamBatch.conflicts[0];
    expect(conflict.type).toBe('produces-overlap');
    expect(conflict.file).toBe('shared.ts');
    expect(conflict.writers.sort()).toEqual(['a', 'b']);
  });

  it('dagId propagates to plan', () => {
    const plan = buildSpawnPlan(linearDag());
    expect(plan.dagId).toBe('linear');
  });

  it('two-node dag: 2 batches, no teams', () => {
    const dag = define({
      id: 'tiny', desc: 'tiny', init: 'init', term: 'term',
      nodes: {
        init: { id: 'init', desc: 'start', produces: ['x'], consumes: [], deps: [], validate: [], idempotent: true },
        term: { id: 'term', desc: 'end', produces: [], consumes: ['x'], deps: ['init'], validate: [], idempotent: false },
      },
    });
    const plan = buildSpawnPlan(dag);
    expect(plan.totalBatches).toBe(2);
    expect(plan.teamBatches).toBe(0);
    expect(plan.batches[0].gatedBy).toBeNull();
    expect(plan.batches[1].gatedBy).toBe(0);
  });
});
