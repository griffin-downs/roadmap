// @module spawn-plan
// @exports buildSpawnPlan
// @types WorkerDirective, SpawnBatch, SpawnPlan
// @entry roadmap

// Converts a DAG into an explicit spawn plan for orchestrator agents.
// Maps each parallelOrder() batch to a team-spawn directive so the executor
// reads "spawn N workers for batch L" rather than inferring parallelism itself.

import type { Graph } from '../protocol.ts';
import { parallelOrder, batchConflicts } from '../protocol.ts';
import type { BatchConflict } from '../protocol.ts';

export interface WorkerDirective {
  workerId: number;   // 1-indexed within the batch
  nodeId: string;
  desc: string;
  produces: string[];
  consumes: string[];
}

export interface SpawnBatch {
  level: number;           // batch index from parallelOrder (0-based)
  spawnTeam: boolean;      // true → use TeamCreate; false → direct execution
  workerCount: number;
  workers: WorkerDirective[];
  gatedBy: number | null;  // level of the prior batch this batch waits on (null for first)
  conflicts: BatchConflict[];
}

export interface SpawnPlan {
  dagId: string;
  totalBatches: number;
  teamBatches: number;    // batches where spawnTeam === true
  batches: SpawnBatch[];
}

export function buildSpawnPlan<T extends string>(dag: Graph<T>): SpawnPlan {
  const batches = parallelOrder(dag);
  const conflicts = batchConflicts(dag);
  const nodes = dag.nodes as Record<string, any>;

  const conflictsByLevel = new Map<number, BatchConflict[]>();
  for (const c of conflicts) {
    const arr = conflictsByLevel.get(c.level) ?? [];
    arr.push(c);
    conflictsByLevel.set(c.level, arr);
  }

  const spawnBatches: SpawnBatch[] = batches.map((batch, level) => {
    const workers: WorkerDirective[] = batch.map((nodeId, i) => {
      const node = nodes[nodeId];
      return {
        workerId: i + 1,
        nodeId,
        desc: node?.desc ?? '',
        produces: node?.produces ?? [],
        consumes: node?.consumes ?? [],
      };
    });

    return {
      level,
      spawnTeam: batch.length > 1,
      workerCount: batch.length,
      workers,
      gatedBy: level === 0 ? null : level - 1,
      conflicts: conflictsByLevel.get(level) ?? [],
    };
  });

  const teamBatches = spawnBatches.filter(b => b.spawnTeam).length;

  return {
    dagId: dag.id,
    totalBatches: batches.length,
    teamBatches,
    batches: spawnBatches,
  };
}
