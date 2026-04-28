// @module dag-mutator
// @exports MutationRecord, MutationLog, insertNode, removeNode, modifyNode, validateMutation, commitMutation, loadMutationLog
// @types MutationRecord, MutationLog
// @entry roadmap

// DAG mutation engine. All mutations to head.json go through here.
// Provenance receipts flow through trail.jsonl via the trailAppender callback.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { define, verify, check } from '../protocol.ts';
import type { Graph, NodeSpec } from '../protocol.ts';

export interface MutationRecord {
  op: 'insert' | 'remove' | 'modify';
  nodeId: string;
  timestamp: string;
  note: string;
  before?: Partial<NodeSpec<string, string>>;
  after?: Partial<NodeSpec<string, string>>;
  dagValidation: {
    define: boolean;
    verify: boolean;
    check: boolean;
  };
}

export interface MutationLog {
  mutations: MutationRecord[];
}

// Deep clone a Graph (JSON round-trip — sufficient for serializable DAGs)
function cloneGraph(g: Graph<string>): Graph<string> {
  return JSON.parse(JSON.stringify(g));
}

// Run define/verify/check on a graph, return structured result
export function validateMutation(before: Graph<string>, after: Graph<string>): { valid: boolean; errors: string[]; warnings?: string[] } {
  const errors: string[] = [];

  try {
    define(after);
  } catch (e) {
    errors.push(`define: ${e instanceof Error ? e.message : String(e)}`);
  }

  const verifyErrors = verify(after);
  for (const ve of verifyErrors) {
    errors.push(`verify: ${ve}`);
  }

  const warnings: string[] = [];
  try {
    const c = check(after);
    if (!c.done && c.orphans.length > 0) {
      for (const o of c.orphans) {
        warnings.push(`check: ${o}`);
      }
    }
  } catch (e) {
    warnings.push(`check: ${e instanceof Error ? e.message : String(e)}`);
  }

  return { valid: errors.length === 0, errors: [...errors, ...warnings], warnings };
}

// Build a MutationRecord with validation results
function buildReceipt(
  op: MutationRecord['op'],
  nodeId: string,
  note: string,
  validation: { valid: boolean; errors: string[] },
  before?: Partial<NodeSpec<string, string>>,
  after?: Partial<NodeSpec<string, string>>,
): MutationRecord {
  const allMessages = validation.errors;
  return {
    op,
    nodeId,
    timestamp: new Date().toISOString(),
    note,
    ...(before !== undefined && { before }),
    ...(after !== undefined && { after }),
    dagValidation: {
      define: !allMessages.some(e => e.startsWith('define:')),
      verify: !allMessages.some(e => e.startsWith('verify:')),
      check: !allMessages.some(e => e.startsWith('check:')),
    },
  };
}

export function insertNode(
  dag: Graph<string>,
  node: { id: string; desc: string; produces: string[]; consumes: string[]; deps: string[]; validate?: any[]; idempotent?: boolean; mode?: 'execute' | 'plan' },
  note: string,
): { dag: Graph<string>; receipt: MutationRecord } {
  const result = cloneGraph(dag);
  const nodes = result.nodes as Record<string, any>;

  if (nodes[node.id]) {
    throw new Error(`Node "${node.id}" already exists in DAG`);
  }

  // Validate deps exist in the graph
  const existingIds = new Set(Object.keys(nodes));
  for (const dep of (node.deps ?? [])) {
    if (!existingIds.has(dep)) {
      throw new Error(`Dep "${dep}" not found in DAG`);
    }
  }

  // Build a full NodeSpec
  const spec: any = {
    id: node.id,
    desc: node.desc,
    produces: node.produces ?? [],
    consumes: node.consumes ?? [],
    deps: node.deps ?? [],
    validate: node.validate ?? [{ type: 'artifact-exists' as const }],
    idempotent: node.idempotent ?? true,
  };
  if (node.mode) spec.mode = node.mode;

  nodes[node.id] = spec;

  const validation = validateMutation(dag, result);
  const receipt = buildReceipt('insert', node.id, note, validation, undefined, spec);

  if (!validation.valid) {
    throw new MutationError(`Insert "${node.id}" failed validation`, validation.errors, receipt);
  }

  return { dag: result, receipt };
}

export function removeNode(
  dag: Graph<string>,
  nodeId: string,
  note: string,
  opts?: { cascade?: boolean },
): { dag: Graph<string>; receipt: MutationRecord } {
  const result = cloneGraph(dag);
  const nodes = result.nodes as Record<string, any>;

  if (!nodes[nodeId]) {
    throw new Error(`Node "${nodeId}" not found in DAG`);
  }

  // Cannot remove init or term
  if (nodeId === result.init) {
    throw new Error(`Cannot remove init node "${nodeId}"`);
  }
  if (nodeId === result.term) {
    throw new Error(`Cannot remove term node "${nodeId}"`);
  }

  const beforeSnapshot = { ...nodes[nodeId] };

  // Find dependents (nodes that have nodeId in their deps)
  const dependents = Object.keys(nodes).filter(
    nid => nid !== nodeId && (nodes[nid].deps as string[]).includes(nodeId),
  );

  if (dependents.length > 0 && !opts?.cascade) {
    throw new Error(
      `Cannot remove "${nodeId}": depended on by [${dependents.join(', ')}]. Use --cascade to remove dependents.`,
    );
  }

  // Cascade: collect all nodes that ONLY depend on the removed chain
  const toRemove = new Set<string>([nodeId]);
  if (opts?.cascade) {
    let changed = true;
    while (changed) {
      changed = false;
      for (const nid of Object.keys(nodes)) {
        if (toRemove.has(nid)) continue;
        if (nid === result.init || nid === result.term) continue;
        const deps = nodes[nid].deps as string[];
        // Remove if ALL deps are in the removal set
        if (deps.length > 0 && deps.every((d: string) => toRemove.has(d))) {
          toRemove.add(nid);
          changed = true;
        }
      }
    }
  }

  // Remove nodes
  for (const rid of toRemove) {
    delete nodes[rid];
  }

  // Clean up dangling dep references in remaining nodes
  for (const nid of Object.keys(nodes)) {
    const n = nodes[nid];
    n.deps = (n.deps as string[]).filter((d: string) => !toRemove.has(d));
  }

  const validation = validateMutation(dag, result);
  const receipt = buildReceipt('remove', nodeId, note, validation, beforeSnapshot);

  if (!validation.valid) {
    throw new MutationError(`Remove "${nodeId}" failed validation`, validation.errors, receipt);
  }

  return { dag: result, receipt };
}

export function modifyNode(
  dag: Graph<string>,
  nodeId: string,
  changes: Partial<{ desc: string; produces: string[]; consumes: string[]; deps: string[]; validate: any[]; idempotent: boolean; mode: 'execute' | 'plan' }>,
  note: string,
): { dag: Graph<string>; receipt: MutationRecord } {
  const result = cloneGraph(dag);
  const nodes = result.nodes as Record<string, any>;

  if (!nodes[nodeId]) {
    throw new Error(`Node "${nodeId}" not found in DAG`);
  }

  const beforeSnapshot = { ...nodes[nodeId] };

  // Apply changes
  const node = nodes[nodeId];
  for (const [key, value] of Object.entries(changes)) {
    if (value !== undefined) {
      node[key] = value;
    }
  }

  const validation = validateMutation(dag, result);
  const afterSnapshot = { ...nodes[nodeId] };
  const receipt = buildReceipt('modify', nodeId, note, validation, beforeSnapshot, afterSnapshot);

  if (!validation.valid) {
    throw new MutationError(`Modify "${nodeId}" failed validation`, validation.errors, receipt);
  }

  return { dag: result, receipt };
}

// Persist mutated DAG and record receipt.
// trailAppender: optional callback that receives the receipt for trail logging (injected by caller).
export function commitMutation(
  repoRoot: string,
  dag: Graph<string>,
  receipt: MutationRecord,
  trailAppender?: (receipt: MutationRecord) => void,
): void {
  const roadmapDir = join(repoRoot, '.roadmap');
  const headPath = join(roadmapDir, 'head.json');
  const headsDir = join(roadmapDir, 'heads');
  const perDagPath = join(headsDir, `${dag.id}.json`);

  if (!existsSync(roadmapDir)) mkdirSync(roadmapDir, { recursive: true });

  // Multi-DAG topology: heads/<dagId>.json is the source of truth that
  // orient reads (see cli/orient.ts). Write through to it whenever the
  // heads/ directory exists, otherwise mutations are invisible to orient.
  let perDagWritten = false;
  if (existsSync(headsDir) || existsSync(perDagPath)) {
    if (!existsSync(headsDir)) mkdirSync(headsDir, { recursive: true });
    // Preserve _lineage and any other extra fields already in heads/<dagId>.json
    let merged: Record<string, unknown> = dag as unknown as Record<string, unknown>;
    if (existsSync(perDagPath)) {
      try {
        const existing = JSON.parse(readFileSync(perDagPath, 'utf-8')) as Record<string, unknown>;
        merged = { ...existing, ...(dag as unknown as Record<string, unknown>) };
      } catch { /* fall back to bare dag */ }
    }
    writeFileSync(perDagPath, JSON.stringify(merged, null, 2) + '\n');
    perDagWritten = true;
  }

  // Always keep head.json in sync as the legacy/auto-merge cache.
  writeFileSync(headPath, JSON.stringify(dag, null, 2) + '\n');

  // Post-write invariant: confirm the mutation actually landed on the path
  // orient will read. Surface as a thrown error so the CLI returns ok:false
  // instead of silently reporting success.
  const verifyPath = perDagWritten ? perDagPath : headPath;
  try {
    const written = JSON.parse(readFileSync(verifyPath, 'utf-8')) as { nodes?: Record<string, unknown> };
    const expectedIds = Object.keys(dag.nodes as Record<string, unknown>);
    const actualIds = new Set(Object.keys(written.nodes ?? {}));
    const missing = expectedIds.filter(id => !actualIds.has(id));
    if (missing.length > 0) {
      throw new Error(`post-write verification failed at ${verifyPath}: missing nodes [${missing.join(', ')}]`);
    }
  } catch (e) {
    throw new MutationError(
      `commitMutation post-write verification failed`,
      [e instanceof Error ? e.message : String(e)],
      receipt,
    );
  }

  trailAppender?.(receipt);
}

const DAG_MUTATION_CMDS = new Set(['dag.insert', 'dag.remove', 'dag.modify']);

// Load mutation history from trail.jsonl by filtering dag mutation events.
export function loadMutationLog(repoRoot: string): MutationLog {
  const trailPath = join(repoRoot, '.roadmap', 'trail.jsonl');
  if (!existsSync(trailPath)) return { mutations: [] };

  const lines = readFileSync(trailPath, 'utf-8').split('\n').filter(l => l.trim());
  const mutations: MutationRecord[] = [];
  for (const line of lines) {
    try {
      const entry = JSON.parse(line);
      if (DAG_MUTATION_CMDS.has(entry.cmd) && entry.detail?.receipt) {
        mutations.push(entry.detail.receipt as MutationRecord);
      }
    } catch { /* skip corrupt lines */ }
  }
  return { mutations };
}

// Check if a recent mutation receipt exists for a given timestamp window
export function hasRecentMutationReceipt(repoRoot: string, withinMs: number = 60_000): boolean {
  const log = loadMutationLog(repoRoot);
  if (log.mutations.length === 0) return false;
  const last = log.mutations[log.mutations.length - 1];
  const elapsed = Date.now() - new Date(last.timestamp).getTime();
  return elapsed <= withinMs;
}

// Structured error for rejected mutations
export class MutationError extends Error {
  readonly errors: string[];
  readonly receipt: MutationRecord;

  constructor(message: string, errors: string[], receipt: MutationRecord) {
    super(`${message}: ${errors.join('; ')}`);
    this.name = 'MutationError';
    this.errors = errors;
    this.receipt = receipt;
  }
}
