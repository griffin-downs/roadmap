// @module cli/commands/dag
// @exports run
// @entry roadmap/cli/commands/dag

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { define, verify, check, parallelOrder, orient } from '../../protocol.ts';
import { CompletionStore } from '../../lib/completion-context.ts';
import type { Graph } from '../../protocol.ts';

// --- Command ---

export function run(args: string[], repoRoot: string): void {
  const headPath = join(repoRoot, '.roadmap', 'head.json');
  if (!existsSync(headPath)) {
    console.log(JSON.stringify({ ok: false, error: 'No roadmap found at .roadmap/head.json' }));
    process.exit(1);
  }

  const sub = args[0];
  if (sub === 'explain') return explainNode(args.slice(1), repoRoot);
  if (sub === 'show') return showNode(args.slice(1), repoRoot);
  if (sub === 'diff') return diffDag(args.slice(1), repoRoot);

  console.log(JSON.stringify({
    ok: false,
    error: `Unknown dag subcommand: ${sub}`,
    fix: 'Usage: cli dag explain <node-id> | cli dag show <node-id> | cli dag diff <git-ref>',
  }));
  process.exit(1);
}

function loadDAG(repoRoot: string): Graph<string> {
  return JSON.parse(readFileSync(join(repoRoot, '.roadmap', 'head.json'), 'utf-8'));
}

function explainNode(args: string[], repoRoot: string): void {
  const nodeId = args[0];
  if (!nodeId) {
    console.log(JSON.stringify({ ok: false, error: 'Missing node ID', fix: 'cli dag explain <node-id>' }));
    process.exit(1);
  }

  const dag = loadDAG(repoRoot);
  const nodes = dag.nodes as Record<string, any>;
  const node = nodes[nodeId];
  if (!node) {
    console.log(JSON.stringify({ ok: false, error: `Node "${nodeId}" not found` }));
    process.exit(1);
  }

  const store = CompletionStore.loadOrEmpty(repoRoot);
  const record = store.record(nodeId);
  const produces = (node.produces ?? []) as string[];
  const batches = parallelOrder(dag);

  // Find batch level
  let level = -1;
  for (let i = 0; i < batches.length; i++) {
    if (batches[i].includes(nodeId)) { level = i; break; }
  }

  // Produce status
  const produceStatus = produces.map((p: string) => ({
    path: p,
    exists: existsSync(join(repoRoot, p)),
  }));

  // Dependency chain: walk deps recursively
  const depChain: string[] = [];
  const visited = new Set<string>();
  function walkDeps(id: string) {
    const n = nodes[id];
    if (!n) return;
    for (const dep of (n.deps ?? []) as string[]) {
      if (visited.has(dep)) continue;
      visited.add(dep);
      depChain.push(dep);
      walkDeps(dep);
    }
  }
  walkDeps(nodeId);

  // Dependents: who depends on this node
  const dependents = Object.keys(nodes).filter(id => {
    const n = nodes[id];
    return (n.deps ?? []).includes(nodeId);
  });

  const hasReceipt = store.hasRecord(nodeId);
  const isPassing = store.hasPassing(nodeId);

  console.log(JSON.stringify({
    ok: true,
    cmd: 'dag.explain',
    data: {
      nodeId,
      desc: node.desc,
      mode: node.mode ?? 'execute',
      level,
      deps: node.deps ?? [],
      depChain,
      dependents,
      produces: produceStatus,
      consumes: node.consumes ?? [],
      validate: node.validate ?? [],
      receipt: hasReceipt ? {
        present: true,
        passing: isPassing,
        completedAt: record?.completedAt,
        owner: record?.owner,
      } : { present: false },
    },
  }));
}

function showNode(args: string[], repoRoot: string): void {
  const nodeId = args[0];
  if (!nodeId) {
    console.log(JSON.stringify({ ok: false, error: 'Missing node ID', fix: 'cli dag show <node-id>' }));
    process.exit(1);
  }

  const dag = loadDAG(repoRoot);
  const nodes = dag.nodes as Record<string, any>;
  const node = nodes[nodeId];
  if (!node) {
    console.log(JSON.stringify({ ok: false, error: `Node "${nodeId}" not found` }));
    process.exit(1);
  }

  console.log(JSON.stringify({
    ok: true,
    cmd: 'dag.show',
    data: {
      id: node.id,
      desc: node.desc,
      produces: node.produces,
      consumes: node.consumes,
      deps: node.deps,
      validate: node.validate,
      idempotent: node.idempotent,
      mode: node.mode ?? 'execute',
      ...(node.expandedFrom ? { expandedFrom: node.expandedFrom } : {}),
      ...(node.ambient?.length ? { ambient: node.ambient } : {}),
    },
  }));
}

function diffDag(args: string[], repoRoot: string): void {
  const ref = args[0];
  if (!ref) {
    console.log(JSON.stringify({ ok: false, error: 'Missing git ref', fix: 'cli dag diff <git-ref>' }));
    process.exit(1);
  }

  // Load current DAG
  const currentDag = loadDAG(repoRoot);
  const currentNodes = new Set(Object.keys(currentDag.nodes));

  // Load DAG at ref
  let oldRaw: string;
  try {
    const { execSync } = require('node:child_process');
    oldRaw = execSync(`git show ${ref}:.roadmap/head.json`, { cwd: repoRoot, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });
  } catch {
    console.log(JSON.stringify({ ok: false, error: `Cannot read .roadmap/head.json at ref "${ref}"` }));
    process.exit(1);
  }

  let oldDag: Graph<string>;
  try {
    oldDag = JSON.parse(oldRaw);
  } catch {
    console.log(JSON.stringify({ ok: false, error: `Invalid JSON in head.json at ref "${ref}"` }));
    process.exit(1);
  }

  const oldNodes = new Set(Object.keys(oldDag.nodes));
  const added = [...currentNodes].filter(n => !oldNodes.has(n));
  const removed = [...oldNodes].filter(n => !currentNodes.has(n));

  // Changed: nodes in both but with different produces/deps
  const changed: Array<{ node: string; field: string; old: unknown; new: unknown }> = [];
  for (const id of currentNodes) {
    if (!oldNodes.has(id)) continue;
    const cur = (currentDag.nodes as Record<string, any>)[id];
    const old = (oldDag.nodes as Record<string, any>)[id];
    for (const field of ['produces', 'consumes', 'deps', 'validate', 'desc'] as const) {
      const curVal = JSON.stringify(cur[field] ?? null);
      const oldVal = JSON.stringify(old[field] ?? null);
      if (curVal !== oldVal) {
        changed.push({ node: id, field, old: old[field] ?? null, new: cur[field] ?? null });
      }
    }
  }

  console.log(JSON.stringify({
    ok: true,
    cmd: 'dag.diff',
    data: {
      ref,
      currentDagId: currentDag.id,
      oldDagId: oldDag.id,
      summary: { added: added.length, removed: removed.length, changed: changed.length },
      added,
      removed,
      changed,
    },
  }));
}
