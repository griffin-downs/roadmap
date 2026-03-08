// @module cli/orient
// @description Thin dispatch: parse args, call orient(), return JSON-ready result.
// @exports run
import type { Graph } from '../lib/protocol/types.ts';
import { orient } from '../core/orient.ts';
import { loadContext } from '../runtime/context.ts';
import { brief } from '../runtime/brief.ts';

/** Thin orient dispatch. Returns JSON-serialisable result. */
export function run(_args: string[], repoRoot: string, dag: Graph<string>): object {
  const ctx = loadContext(repoRoot);
  const pos = orient(dag, (id) => ctx.completion.hasPassing(id));

  const briefs: Record<string, object> = {};
  for (const nodeId of pos.position) {
    try { briefs[nodeId] = brief(dag, nodeId, ctx); } catch { /* best-effort */ }
  }
  return {
    position: pos.position, level: pos.level,
    produces: pos.produces, consumes: pos.consumes,
    batchRemaining: pos.batchRemaining,
    batchComplete: pos.batchRemaining.length === 0,
    done: pos.done.length, remaining: pos.remaining.length,
    complete: pos.remaining.length === 0,
    briefs,
  };
}
