// @module speckit-import
// @exports parseTasksMd, tasksToDAG
// @types ParsedTask, ImportOptions
// @entry roadmap

// Shared graph-construction logic used by the canonical SpecIR path
// (src/lib/intake/spec-ir.ts → compileIR). The markdown-tasks surface is
// no longer supported — see docs/MIGRATION.md.

import type { Graph, NodeSpec, ValidationRule } from '../../protocol.ts';

export interface ParsedTask {
  id: string;
  desc: string;
  depends?: string[];
  produces: string[];
  consumes: string[];
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
 * SpecIR (JSON, schema_version: 2). See docs/MIGRATION.md for migration steps.
 */
export function parseTasksMd(_content: string): ParsedTask[] {
  throw new Error(
    'spec-kit markdown format is no longer supported. See docs/MIGRATION.md.',
  );
}

export function tasksToDAG(tasks: ParsedTask[], opts: ImportOptions): Graph<string> {
  if (tasks.length === 0) throw new Error('No tasks provided');

  const taskIds = new Set(tasks.map(t => t.id));

  // Validate deps reference real tasks
  for (const t of tasks) {
    for (const d of t.depends ?? []) {
      if (!taskIds.has(d)) throw new Error(`Task "${t.id}" depends on unknown task "${d}"`);
    }
  }

  // Synthesize produces for tasks lacking them — every node must have an artifact
  for (const t of tasks) {
    if (t.produces.length === 0) {
      t.produces = [`.roadmap/tasks/${t.id}.artifact.json`];
    }
  }

  const nodes: Record<string, NodeSpec<string, string>> = {};

  // Init: tasks with no depends are roots
  const rootTasks = tasks.filter(t => (t.depends ?? []).length === 0);
  if (rootTasks.length === 0) throw new Error('No root tasks found (tasks with no dependencies)');

  let initId: string;
  if (rootTasks.length === 1) {
    initId = rootTasks[0].id;
  } else {
    initId = taskIds.has('init') ? '_init' : 'init';
    nodes[initId] = {
      id: initId,
      desc: 'Synthetic init — roots all independent tasks',
      produces: [`${initId}.marker`],
      consumes: [],
      deps: [],
      validate: [],
    } as NodeSpec<string, string>;
    for (const t of rootTasks) {
      const deps = (t.depends ??= []);
      if (!deps.includes(initId)) deps.push(initId);
      if (!t.consumes.includes(`${initId}.marker`)) t.consumes.push(`${initId}.marker`);
    }
  }

  // Term: leaf task (nothing depends on it), or synthesized
  const depTargets = new Set(tasks.flatMap(t => t.depends ?? []));
  const leafTasks = tasks.filter(t => !depTargets.has(t.id));
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

  // Add all parsed tasks as nodes
  for (const t of tasks) {
    nodes[t.id] = {
      id: t.id,
      desc: t.desc,
      produces: t.produces,
      consumes: t.consumes,
      deps: t.depends ?? [],
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
