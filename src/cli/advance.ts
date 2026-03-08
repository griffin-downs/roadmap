// @module cli/advance
// @description Thin dispatch: parse args, call advanceBatch/orient, return JSON-ready result.
// @exports run
import type { Graph } from '../lib/protocol/types.ts';
import { orient } from '../core/orient.ts';
import { advanceBatch } from '../core/batch.ts';
import { loadContext } from '../runtime/context.ts';

/** Thin advance dispatch. Returns JSON-serialisable result. */
export function run(args: string[], repoRoot: string, dag: Graph<string>): object {
  const ctx = loadContext(repoRoot);
  const pos = orient(dag, (id) => ctx.completion.hasPassing(id));
  const nodeId = args[0];

  if (nodeId) {
    if (!pos.batchRemaining.includes(nodeId) && !pos.position.includes(nodeId)) {
      return { error: `Node ${nodeId} is not in current batch`, currentBatch: pos.position };
    }
    return { advancing: nodeId, produces: dag.nodes[nodeId]?.produces ?? [] };
  }
  // Batch advance: verify complete, return next position
  const next = advanceBatch(dag, ctx.completion);
  return {
    advanced: true, level: next.level,
    position: next.position, produces: next.produces, consumes: next.consumes,
  };
}
