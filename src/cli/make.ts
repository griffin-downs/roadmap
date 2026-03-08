// @module cli/make
// @description Thin dispatch: parse args, load spec, build DAG, validate, return result.
// @exports run
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { define, verify, check } from '../lib/protocol/index.ts';
import { orient } from '../core/orient.ts';
import { loadContext } from '../runtime/context.ts';
import { tasksToDAG } from '../lib/intake/speckit-import.ts';

/** Thin make dispatch. Returns JSON-serialisable result. */
export function run(args: string[], repoRoot: string): object {
  const specPath = args[0];
  if (!specPath) return { error: 'Missing spec path', fix: 'roadmap make <spec-path>' };

  const resolved = resolve(repoRoot, specPath);
  if (!existsSync(resolved)) return { error: `Spec not found: ${resolved}` };

  const parsed = JSON.parse(readFileSync(resolved, 'utf-8'));
  const tasks = (parsed.tasks ?? []).map((t: any, i: number) => ({
    ...t, depends: t.depends ?? t.deps ?? [], priority: t.priority ?? i,
    mode: t.mode ?? 'execute', desc: t.desc ?? t.description ?? '',
  }));
  const dag = tasksToDAG(tasks, { dagId: parsed.dag_id ?? 'ideal-dag', dagDesc: parsed.dag_desc });
  define(dag); verify(dag); check(dag);

  const ctx = loadContext(repoRoot);
  const pos = orient(dag, (id) => ctx.completion.hasPassing(id));
  return { ok: true, dag, position: pos.position, level: pos.level };
}
