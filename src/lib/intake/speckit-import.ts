// @module speckit-import
// @exports parseTasksMd, tasksToDAG
// @types ParsedTask, ImportOptions
// @entry roadmap

// Shared graph-construction logic used by the canonical SpecIR path
// (src/lib/intake/spec-ir.ts → compileIR). The markdown-tasks surface is
// no longer supported.
//
// Ordering rule (post r-rewrite-dependency-resolver):
//   Edges between tasks are derived EXCLUSIVELY from consumes ↔ produces.
//   ParsedTask.depends is no longer read. If a task has no consumes, it is
//   a root; if no other task consumes its produces, it is a leaf. Roots and
//   leaves are wired to a synthetic init/term via a ratification receipt
//   when there is more than one of either.

import type { Graph, NodeSpec, ValidationRule, ConsumeSpec } from '../../protocol.ts';
import { consumeArtifact } from '../../protocol.ts';

export interface ParsedTask {
  id: string;
  desc: string;
  /** @deprecated Ordering is derived from consumes ↔ produces. Field retained
   *  only to avoid breaking older callers; tasksToDAG does not read it. */
  depends?: string[];
  produces: string[];
  consumes: (string | ConsumeSpec)[];
  mode: 'execute' | 'plan';
  validate: ValidationRule[];
}

export interface ImportOptions {
  dagId: string;
  dagDesc?: string;
  version?: string;
}

/**
 * Spec-kit markdown parsing has been removed. The roadmap intake path is now
 * SpecIR (JSON, schema_version: 2) — run `roadmap api make` for the schema.
 */
export function parseTasksMd(_content: string): ParsedTask[] {
  throw new Error(
    'spec-kit markdown format is no longer supported. Use SpecIR JSON (schema_version: 2).',
  );
}

/**
 * Build a Graph from ParsedTask[]. Edges are derived from consumes ↔ produces.
 *
 * Procedure:
 *   1. Synthesize produces for tasks without one (every node must have an artifact).
 *   2. Index producers (artifact path → producing task id).
 *   3. For each task, derive predecessors by matching its consumes against the index.
 *      Unresolved consumes throw — every consumes path must trace to some produce.
 *   4. Roots = tasks with zero predecessors. Leaves = tasks with zero successors.
 *   5. If multiple roots: synth `init` producing a ratification receipt; every root
 *      consumes it. If multiple leaves: synth `term` consuming every leaf's produces.
 */
export function tasksToDAG(tasks: ParsedTask[], opts: ImportOptions): Graph<string> {
  if (tasks.length === 0) throw new Error('No tasks provided');

  // 1. Synthesize produces for tasks lacking them — every node must have an artifact.
  for (const t of tasks) {
    if (t.produces.length === 0) {
      t.produces = [`.roadmap/tasks/${t.id}.artifact.json`];
    }
  }

  // 2. Index producers.
  const producerOf = new Map<string, string>(); // artifact path → task id
  for (const t of tasks) {
    for (const p of t.produces) {
      const prior = producerOf.get(p);
      if (prior && prior !== t.id) {
        throw new Error(
          `Artifact "${p}" is produced by both "${prior}" and "${t.id}" — produces must be unique`,
        );
      }
      producerOf.set(p, t.id);
    }
  }

  // 3. Derive predecessors from consumes ↔ produces.
  const predsOf = new Map<string, Set<string>>();
  const taskIds = new Set(tasks.map(t => t.id));
  for (const t of tasks) {
    const preds = new Set<string>();
    for (const c of t.consumes) {
      const path = consumeArtifact(c);
      const from = producerOf.get(path);
      if (!from) {
        throw new Error(
          `Task "${t.id}" consumes "${path}" but no task produces it (every consumes edge must trace to an upstream produces)`,
        );
      }
      if (from !== t.id) preds.add(from);
    }
    predsOf.set(t.id, preds);
  }

  // 4. Roots and leaves.
  const succsOf = new Map<string, Set<string>>();
  for (const id of taskIds) succsOf.set(id, new Set());
  for (const [id, preds] of predsOf) {
    for (const p of preds) succsOf.get(p)!.add(id);
  }
  const rootTasks = tasks.filter(t => predsOf.get(t.id)!.size === 0);
  const leafTasks = tasks.filter(t => succsOf.get(t.id)!.size === 0);
  if (rootTasks.length === 0) {
    throw new Error('No root tasks found (every task consumes something — likely a cycle)');
  }

  const nodes: Record<string, NodeSpec<string, string>> = {};

  // 5a. Init: single root keeps its own id; multiple roots get a ratification receipt.
  let initId: string;
  if (rootTasks.length === 1) {
    initId = rootTasks[0].id;
  } else {
    initId = taskIds.has('init') ? '_init' : 'init';
    const receipt = `.roadmap/${initId}.receipt.json`;
    nodes[initId] = {
      id: initId,
      desc: 'Synthetic init — ratification receipt for all root tasks',
      produces: [receipt],
      consumes: [],
      deps: [],
      validate: [],
    } as NodeSpec<string, string>;
    // Wire each root to consume the receipt — this is how ordering is expressed.
    for (const t of rootTasks) {
      if (!t.consumes.map(c => consumeArtifact(c)).includes(receipt)) {
        t.consumes = [...t.consumes, receipt];
      }
    }
    // Recompute predecessors for roots after wiring.
    for (const t of rootTasks) {
      predsOf.get(t.id)!.add(initId);
    }
  }

  // 5b. Term: single leaf keeps its own id; multiple leaves get a synth term.
  let termId: string;
  if (leafTasks.length === 1) {
    termId = leafTasks[0].id;
  } else {
    termId = taskIds.has('term') ? '_term' : 'term';
    nodes[termId] = {
      id: termId,
      desc: 'Synthetic term — gates on all leaf tasks',
      produces: [],
      consumes: leafTasks.flatMap(t => t.produces).filter(Boolean),
      deps: leafTasks.map(t => t.id),
      validate: [],
    } as NodeSpec<string, string>;
  }

  // 6. Materialize task nodes. `deps` is computed from the predecessor map,
  //    not read from t.depends. The deps field exists for the engine's
  //    internal ordering pass (src/core/order.ts) but is no longer authored.
  for (const t of tasks) {
    const deps = [...(predsOf.get(t.id) ?? [])].sort();
    nodes[t.id] = {
      id: t.id,
      desc: t.desc,
      produces: t.produces,
      consumes: t.consumes,
      deps,
      validate: t.validate,
      ...(t.mode === 'plan' ? { mode: 'plan' } : {}),
    } as NodeSpec<string, string>;
  }

  return {
    id: opts.dagId,
    desc: opts.dagDesc || 'Imported from SpecIR',
    init: initId,
    term: termId,
    nodes,
    version: opts.version || '0.3.0',
    protocolVersion: '0.3.0',
  } as Graph<string>;
}
