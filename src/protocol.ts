// @module protocol
// @exports define, graph, check, verify, order, parallelOrder, orient, advanceBatch, reconcile, merge, branch, analyze, modify, modifyAndCommit, validateNode, validateBatch, validateGraph
// @types NodeSpec, Graph, Orientation, Connection, Gap, ValidationRule, ValidationCheck, ValidationResult, ModifyAnalysis, ModificationRecord
// @entry roadmap/protocol

// --- Types ---

export type ValidationRule =
  | { type: 'artifact-exists'; target: string }
  | { type: 'artifact-schema'; target: string; schema: string }
  | { type: 'function'; target: string; fn: string }
  | { type: 'manual-approval'; target: string; reviewer?: string }
  | { type: 'expanded'; minNodes?: number };

export interface ValidationCheck {
  rule: ValidationRule;
  passed: boolean;
  evidence?: string;
}

export interface ValidationResult {
  nodeId: string;
  passed: boolean;
  checks: ValidationCheck[];
  failedReason?: string;
}

export interface NodeSpec<TAll extends string, TSelf extends TAll = TAll> {
  readonly id: TSelf;
  readonly desc: string;
  readonly produces: readonly string[];
  readonly consumes: readonly string[];
  readonly deps: readonly TAll[];
  readonly validate: readonly ValidationRule[]; // ← REQUIRED
  readonly idempotent: boolean; // ← REQUIRED: true=re-runnable, false=manual/state-changing
  readonly mode?: 'execute' | 'plan'; // default: 'execute'. 'plan' = decompose, output is DAG expansion
  readonly expandedFrom?: string; // provenance: which plan node spawned this node via expansion
}

// Inference helper — extracts T from nodes, avoids mapped-type inference limits.
export function graph<T extends string>(
  g: { id: string; desc: string; init: string; term: string; nodes: { [N in T]: NodeSpec<T, N> } },
): Graph<T> {
  return g;
}

export interface Graph<T extends string> {
  readonly id: string;
  readonly desc: string;
  readonly init: string;
  readonly term: string;
  readonly nodes: { readonly [N in T]: NodeSpec<T, N> };
}

export type Connection = { forward: string; backward: string; artifact: string };
export type Gap = { between: [string, string]; missing: string[] };

// --- Internal: flat iteration over mapped type ---

type Flat = { id: string; produces: readonly string[]; consumes: readonly string[]; deps: readonly string[]; mode?: 'execute' | 'plan'; expandedFrom?: string };

function flat<T extends string>(g: Graph<T>): Flat[] {
  return Object.values(g.nodes) as Flat[];
}

function fwd(nodes: Flat[]): Map<string, string[]> {
  const m = new Map(nodes.map(n => [n.id, [] as string[]]));
  for (const n of nodes) for (const d of n.deps) m.get(d)?.push(n.id);
  return m;
}

// --- Cycle detection (Kahn's). Returns nodes in cycle, empty if acyclic. ---

function detectCycles(nodes: Flat[]): string[] {
  const valid = new Set(nodes.map(n => n.id));
  const a = fwd(nodes);
  const deg = new Map(nodes.map(n => [n.id, n.deps.filter(d => valid.has(d)).length]));
  const q = [...deg].filter(([, d]) => d === 0).map(([id]) => id);
  let v = 0;
  while (q.length) {
    const n = q.shift()!;
    v++;
    for (const s of a.get(n) ?? []) {
      const d = deg.get(s)! - 1;
      deg.set(s, d);
      if (d === 0) q.push(s);
    }
  }
  return v < nodes.length ? [...deg].filter(([, d]) => d > 0).map(([id]) => id) : [];
}

// --- BFS reachability ---

function reach(nodes: Flat[], from: string, to: string): boolean {
  if (from === to) return true;
  const a = fwd(nodes);
  const seen = new Set<string>();
  const q = [from];
  while (q.length) {
    const n = q.shift()!;
    if (seen.has(n)) continue;
    seen.add(n);
    for (const s of a.get(n) ?? []) {
      if (s === to) return true;
      q.push(s);
    }
  }
  return false;
}

// --- define: validate structure ---
// Throws on: cycle, missing init/term. Does NOT check consumes (use verify() for that).

export function define<T extends string>(g: Graph<T>): Graph<T> {
  const nodes = flat(g);
  const ids = new Set(nodes.map(n => n.id));

  if (!ids.has(g.init)) throw new Error(`init "${g.init}" not in nodes`);
  if (!ids.has(g.term)) throw new Error(`term "${g.term}" not in nodes`);
  if (g.init === g.term) throw new Error(`init and term cannot be the same node`);

  const c = detectCycles(nodes);
  if (c.length) throw new Error(`Cycle in "${g.id}": ${c.join(', ')}`);

  return g;
}

// --- verify: validate contracts ---
// Returns unsatisfied consumes. Empty = all contracts satisfied.

export function verify<T extends string>(g: Graph<T>): string[] {
  const nodes = flat(g);
  const ids = new Set(nodes.map(n => n.id));
  const nm = new Map(nodes.map(n => [n.id, n]));
  const errors: string[] = [];

  for (const node of nodes) {
    if (!node.consumes.length) continue;
    const preds = new Set<string>();
    const q = [...node.deps.filter(d => ids.has(d))];
    while (q.length) {
      const p = q.shift()!;
      if (preds.has(p)) continue;
      preds.add(p);
      for (const d of nm.get(p)?.deps ?? []) if (ids.has(d)) q.push(d);
    }
    const available = new Set([...preds].flatMap(p => nm.get(p)?.produces ?? []));
    for (const c of node.consumes) {
      if (!available.has(c)) errors.push(`"${node.id}" consumes "${c}" — no predecessor produces it`);
    }
  }

  return errors;
}

// --- check: termination ---
// Every node reachable from init AND can reach term.

export function check<T extends string>(g: Graph<T>): { done: boolean; orphans: string[] } {
  const nodes = flat(g);
  const orphans: string[] = [];

  // Init must reach term.
  if (!reach(nodes, g.init, g.term)) orphans.push(`${g.term}: unreachable from ${g.init}`);

  for (const n of nodes) {
    if (n.id === g.init || n.id === g.term) continue;
    if (!reach(nodes, g.init, n.id)) orphans.push(`${n.id}: unreachable from ${g.init}`);
    else if (!reach(nodes, n.id, g.term)) orphans.push(`${n.id}: cannot reach ${g.term}`);
  }
  return { done: orphans.length === 0, orphans };
}

// --- reconcile: find where forward.produces meets backward.consumes ---

export function reconcile<T extends string>(
  g: Graph<T>, forward: readonly string[], backward: readonly string[],
): { connections: Connection[]; gaps: Gap[] } {
  const nm = new Map(flat(g).map(n => [n.id, n]));
  const connections: Connection[] = [];
  const gaps: Gap[] = [];

  for (const f of forward) {
    const fn = nm.get(f);
    if (!fn) continue;
    for (const b of backward) {
      const bn = nm.get(b);
      if (!bn) continue;
      const shared = fn.produces.filter(p => bn.consumes.includes(p));
      if (shared.length) {
        for (const a of shared) connections.push({ forward: f, backward: b, artifact: a });
      } else {
        const m = bn.consumes.filter(c => !fn.produces.includes(c));
        if (m.length) gaps.push({ between: [f, b], missing: m });
      }
    }
  }

  return { connections, gaps };
}

// --- order: topological sort ---

export function order<T extends string>(g: Graph<T>): string[] {
  const nodes = flat(g);
  const valid = new Set(nodes.map(n => n.id));
  const a = fwd(nodes);
  const deg = new Map(nodes.map(n => [n.id, n.deps.filter(d => valid.has(d)).length]));
  const q = [...deg].filter(([, d]) => d === 0).map(([id]) => id);
  const out: string[] = [];
  while (q.length) {
    const n = q.shift()!;
    out.push(n);
    for (const s of a.get(n) ?? []) {
      const d = deg.get(s)! - 1;
      deg.set(s, d);
      if (d === 0) q.push(s);
    }
  }
  if (out.length < nodes.length) throw new Error('Cycle detected');
  return out;
}

// --- parallelOrder: batched topological sort ---
// Groups mutually independent nodes into concurrent execution batches.
// Each batch can run in parallel; batches execute sequentially.

export function parallelOrder<T extends string>(g: Graph<T>): string[][] {
  const nodes = flat(g);
  const valid = new Set(nodes.map(n => n.id));
  const a = fwd(nodes);
  const deg = new Map(nodes.map(n => [n.id, n.deps.filter(d => valid.has(d)).length]));
  const batches: string[][] = [];

  let ready = [...deg].filter(([, d]) => d === 0).map(([id]) => id);
  while (ready.length) {
    batches.push(ready.sort()); // sort for determinism
    const next: string[] = [];
    for (const n of ready) {
      for (const s of a.get(n) ?? []) {
        const d = deg.get(s)! - 1;
        deg.set(s, d);
        if (d === 0) next.push(s);
      }
    }
    ready = next;
  }

  const visited = batches.flat().length;
  if (visited < nodes.length) throw new Error('Cycle detected');
  return batches;
}

// --- orient: agent reorientation ---
// Given a graph and a filesystem probe, returns current batch position, what's done,
// what to produce, what's available to consume, and what remains.
// Position is a batch (array of nodes), not a single node.

export interface Orientation {
  position: string[];         // batch: array of nodes that can run in parallel
  level: number;              // batch index (0-based)
  batchRemaining: string[];   // nodes in current batch that aren't done
  batchComplete: boolean;     // all nodes in current batch validated + artifacts exist
  done: string[];
  produces: readonly string[];
  consumes: readonly string[];
  remaining: string[];
}

export function orient<T extends string>(
  g: Graph<T>,
  exists: (artifact: string) => boolean,
  retired?: ReadonlySet<string>,
): Orientation {
  const batches = parallelOrder(g);
  const nodes = flat(g);
  const nm = new Map(nodes.map(n => [n.id, n]));
  const done: string[] = [];

  // Build expansion index: plan node → children that were expanded from it
  const expansionChildren = new Map<string, string[]>();
  for (const n of nodes) {
    if (n.expandedFrom) {
      const children = expansionChildren.get(n.expandedFrom) ?? [];
      children.push(n.id);
      expansionChildren.set(n.expandedFrom, children);
    }
  }

  for (const batch of batches) {
    const batchIncomplete = batch.filter(id => {
      if (retired?.has(id)) return false;
      const node = nm.get(id)!;
      // Plan node completion: done when expansion children exist in graph
      if (node.mode === 'plan') {
        const children = expansionChildren.get(id) ?? [];
        return children.length === 0; // incomplete if no expansion children
      }
      return !(!node.produces.length || node.produces.every(exists));
    });

    if (batchIncomplete.length > 0) {
      // This is the first incomplete batch
      const batchDone = batch.filter(id => !batchIncomplete.includes(id));
      const remainingBatches = batches.slice(batches.indexOf(batch) + 1).flat();
      const batchProduces = batch.flatMap(id => nm.get(id)!.produces);
      const batchConsumes = batch.flatMap(id => nm.get(id)!.consumes);

      return {
        position: batch,
        level: batches.indexOf(batch),
        batchRemaining: batchIncomplete,
        batchComplete: false,
        done: [...done, ...batchDone],
        produces: batchProduces,
        consumes: batchConsumes,
        remaining: remainingBatches,
      };
    }

    // All nodes in this batch are done
    done.push(...batch);
  }

  // All batches complete - position is term batch (which contains only term node)
  return {
    position: [g.term],
    level: batches.length - 1,
    batchRemaining: [],
    batchComplete: true,
    done: done.filter(id => id !== g.term),
    produces: [],
    consumes: [],
    remaining: [],
  };
}

// --- advanceBatch: move from current batch to next ---
// Validates that current batch is complete (all nodes' artifacts exist),
// then returns orientation for the next batch.
// This is the only way to advance in the batch-level position model.

export function advanceBatch<T extends string>(
  g: Graph<T>,
  exists: (artifact: string) => boolean,
  retired?: ReadonlySet<string>,
): Orientation {
  const current = orient(g, exists, retired);

  // Guard: current batch must be complete
  if (!current.batchComplete) {
    throw new Error(
      `Cannot advance: batch not complete. Remaining nodes: ${current.batchRemaining.join(', ')}`
    );
  }

  // Guard: all produced artifacts must exist (double-check)
  for (const artifact of current.produces) {
    if (!exists(artifact)) {
      throw new Error(`Cannot advance: artifact not found: ${artifact}`);
    }
  }

  // Since all artifacts now exist, calling orient() again will skip past
  // the current batch and find the next incomplete batch
  return orient(g, exists, retired);
}

// --- merge: combine two DAGs at reconcile() join points ---
// Merges g1 and g2 by adding edges from g1→g2 at specified connection points.
// Returns merged graph, validated by define() and verify().

export function merge<T1 extends string, T2 extends string>(
  g1: Graph<T1>,
  g2: Graph<T2>,
  connections: ReadonlyArray<{ g1Node: string; g2Node: string; artifact: string }>,
  initOverride?: string,
  termOverride?: string,
): Graph<T1 | T2> {
  // Validate inputs
  if (!g1 || !g2) throw new Error('Both g1 and g2 required for merge');

  // Check for node ID conflicts (caller must pre-qualify)
  const ids1 = new Set(Object.keys(g1.nodes));
  const ids2 = new Set(Object.keys(g2.nodes));
  const conflicts = [...ids1].filter(id => ids2.has(id));
  if (conflicts.length) throw new Error(`Node ID conflicts: ${conflicts.join(', ')}. Pre-qualify node IDs before merge.`);

  // Merge node maps
  const mergedNodes: Record<string, Flat> = {};
  for (const [id, node] of Object.entries(g1.nodes)) {
    mergedNodes[id as string] = node as Flat;
  }
  for (const [id, node] of Object.entries(g2.nodes)) {
    mergedNodes[id as string] = node as Flat;
  }

  // Add connection edges: modify g2 nodes to depend on g1 nodes
  for (const conn of connections) {
    const g2Node = mergedNodes[conn.g2Node as string];
    if (!g2Node) throw new Error(`Connection g2Node "${conn.g2Node}" not found in g2`);
    if (!g2Node.deps.includes(conn.g1Node as string)) {
      g2Node.deps = [...g2Node.deps, conn.g1Node as string];
    }
  }

  // Create merged graph with inferred init/term
  const merged: Graph<T1 | T2> = {
    id: `${g1.id}+${g2.id}`,
    desc: `${g1.desc} → ${g2.desc}`,
    init: (initOverride || g1.init) as T1 | T2,
    term: (termOverride || g2.term) as T1 | T2,
    nodes: mergedNodes as any,
  };

  // Validate merged graph
  const validated = define(merged);
  const errors = verify(validated);
  if (errors.length) throw new Error(`Merge validation failed: ${errors.join(', ')}`);

  return validated;
}

// --- branch: extract subgraph from a node to term ---
// Branches g from fromNode to g.term, creating a variant DAG.
// Returns branched graph, validated by define() and verify().

export function branch<T extends string>(
  g: Graph<T>,
  fromNode: T,
): Graph<T> {
  if (!g || !fromNode) throw new Error('Graph and fromNode required for branch');
  if (!(fromNode in g.nodes)) throw new Error(`fromNode "${fromNode}" not in graph`);

  // Forward pass: find all nodes reachable FROM fromNode
  const nodes = flat(g);
  const forward = new Set<string>();
  const q: string[] = [fromNode];
  while (q.length) {
    const n = q.shift()!;
    if (forward.has(n)) continue;
    forward.add(n);
    const nm = new Map(nodes.map(nd => [nd.id, nd]));
    const successors = nodes.filter(nd => nd.deps.includes(n)).map(nd => nd.id);
    for (const s of successors) {
      if (!forward.has(s)) q.push(s);
    }
  }

  // Extract nodes in forward set
  const branchedNodes: Record<string, Flat> = {};
  for (const node of nodes) {
    if (forward.has(node.id)) {
      branchedNodes[node.id] = node;
    }
  }

  // Create branched graph
  const branched: Graph<T> = {
    id: `${g.id}:${fromNode}`,
    desc: `Branch of ${g.desc} from ${fromNode}`,
    init: fromNode,
    term: g.term,
    nodes: branchedNodes as any,
  };

  // Validate
  const validated = define(branched);
  const errors = verify(validated);
  if (errors.length) throw new Error(`Branch validation failed: ${errors.join(', ')}`);

  return validated;
}

// --- modify: delete/skip goals during execution (replanning support) ---
// Enables agents to adapt when discovering better paths or obsolete work

export interface ModifyAnalysis {
  dependents: string[]; // Nodes that depend on target
  orphaned: string[]; // Nodes left unreachable after deletion
  produces: string[]; // Artifacts target produces
  safe: boolean; // Can be safely deleted?
  reason: string; // Why safe/unsafe
}

export function analyze<T extends string>(g: Graph<T>, nodeId: string): ModifyAnalysis {
  const nodes = flat(g);
  const nm = new Map(nodes.map(n => [n.id, n]));
  const target = nm.get(nodeId);

  if (!target) {
    return {
      dependents: [],
      orphaned: [],
      produces: [],
      safe: false,
      reason: `Node "${nodeId}" not found`,
    };
  }

  // Find nodes that depend on this one
  const dependents = nodes.filter(n => n.deps.includes(nodeId)).map(n => n.id);

  // Simulate deletion: which nodes become unreachable?
  const tempNodes = { ...g.nodes };
  delete (tempNodes as any)[nodeId];

  let orphaned: string[] = [];
  try {
    // Check reachability from init in modified graph
    const reachable = new Set<string>();
    const queue = [g.init];
    reachable.add(g.init);

    while (queue.length) {
      const id = queue.shift()!;
      const node = (tempNodes as any)[id];
      if (!node) break;

      for (const dep of node.deps) {
        if (!reachable.has(dep) && dep !== nodeId) {
          reachable.add(dep);
          queue.push(dep);
        }
      }
    }

    // Nodes not reachable (except term, which is checked separately)
    orphaned = Object.keys(tempNodes)
      .filter(id => !reachable.has(id) && id !== g.term)
      .sort();
  } catch {
    // Analysis failed
  }

  const safe = orphaned.length === 0 && nodeId !== g.init && nodeId !== g.term;
  const reason = safe
    ? `Leaf node with ${dependents.length} dependents (must update their consumes)`
    : orphaned.length > 0
      ? `Deletion orphans: ${orphaned.join(', ')}`
      : `Cannot delete ${nodeId}: critical node (init or term)`;

  return {
    dependents,
    orphaned,
    produces: [...target.produces],
    safe,
    reason,
  };
}

export function modify<T extends string>(
  g: Graph<T>,
  nodeId: string,
  action: 'delete' | 'skip',
): Graph<T> | Error {
  if (action === 'skip') {
    // Skip is metadata (not implemented in core protocol)
    // Caller can use in orient() decision logic
    return g; // Return unchanged for now
  }

  if (action !== 'delete') {
    return new Error(`Unknown action: ${action}`);
  }

  if (nodeId === g.init || nodeId === g.term) {
    return new Error(`Cannot delete ${nodeId}: cannot modify init or term`);
  }

  // Build new nodes without target
  const modifiedNodes: Record<string, Flat> = {};
  for (const [id, node] of Object.entries(g.nodes)) {
    if (id === nodeId) continue; // Skip target

    // Remove nodeId from this node's deps
    const newDeps = (node as Flat).deps.filter(d => d !== nodeId);
    modifiedNodes[id] = { ...(node as Flat), deps: newDeps };
  }

  // Create modified graph
  const modified: Graph<T> = {
    id: `${g.id}:modified`,
    desc: `${g.desc} (node "${nodeId}" deleted)`,
    init: g.init,
    term: g.term,
    nodes: modifiedNodes as any,
  };

  // Re-validate: must remain acyclic, connected, with satisfied contracts
  try {
    const cycles = flat(modified).filter(n => n.id).map(n => n.id);
    const kahn = [...cycles].sort(); // Placeholder cycle detection

    // Full validation
    const defined = define(modified);
    const checkResult = check(defined);
    if (!checkResult.done) {
      return new Error(
        `Deletion breaks connectivity. Orphaned: ${checkResult.orphans?.join(', ') || 'unknown'}`,
      );
    }

    const verifyErrors = verify(defined);
    if (verifyErrors.length) {
      return new Error(`Deletion breaks contracts: ${verifyErrors.join(', ')}`);
    }

    return defined;
  } catch (e) {
    return new Error(`Deletion validation failed: ${e instanceof Error ? e.message : String(e)}`);
  }
}

// --- Atomic modifications: modify + commit for concurrent agent safety ---

export interface ModificationRecord {
  timestamp: number;
  action: 'delete' | 'skip';
  nodeId: string;
  reason: string;
  evidence?: string;
  commitHash?: string;
  graphAfter?: Graph<string>;
}

/**
 * Atomic modify: apply modification then commit to git.
 * All agents see committed state on next spawn.
 *
 * Returns: { success, graph, commitHash, error? }
 * On failure: error returned, no commit made.
 */
export async function modifyAndCommit(
  g: Graph<any>,
  nodeId: string,
  action: 'delete' | 'skip',
  reason: string,
  repoRoot: string,
  evidence?: string,
): Promise<{ success: boolean; graph?: Graph<any>; commitHash?: string; error?: string }> {
  // Attempt modification (in-memory)
  const modResult = modify(g, nodeId, action);
  if (modResult instanceof Error) {
    return { success: false, error: modResult.message };
  }

  // Modification succeeded, now commit it
  try {
    const { execSync } = await import('node:child_process');
    const { writeFileSync } = await import('node:fs');
    const { join } = await import('node:path');

    // Write modified roadmap back to file (roadmap.ts)
    const roadmapPath = join(repoRoot, 'roadmap.ts');
    const roadmapContent = `export default ${JSON.stringify(modResult, null, 2)};\n`;

    writeFileSync(roadmapPath, roadmapContent);

    // Commit the change
    execSync(`git add roadmap.ts`, { cwd: repoRoot, stdio: 'ignore' });
    const commitMsg = `roadmap: ${action} ${nodeId} — ${reason}`;
    execSync(`git commit -m "${commitMsg}"`, { cwd: repoRoot, stdio: 'ignore' });

    // Get commit hash
    const commitHash = execSync('git rev-parse HEAD', { cwd: repoRoot, encoding: 'utf-8' }).trim();

    // Post-commit hook will update git-state.json automatically

    return { success: true, graph: modResult, commitHash };
  } catch (e) {
    return { success: false, error: `Commit failed: ${e instanceof Error ? e.message : String(e)}` };
  }
}

// --- Validation: Proof of delivery ---

/**
 * Execute validation rules for a node
 * Validates that the node delivered what it claimed (produces)
 */
export async function validateNode<T extends string>(
  g: Graph<T>,
  nodeId: string,
  exists: (artifact: string) => boolean,
): Promise<ValidationResult> {
  const node = g.nodes[nodeId as keyof typeof g.nodes] as any;

  if (!node) {
    return {
      nodeId,
      passed: false,
      checks: [],
      failedReason: `Node "${nodeId}" not found`,
    };
  }

  const checks: ValidationCheck[] = [];
  let allPassed = true;

  // Execute each validation rule
  for (const rule of (node.validate || [])) {
    let passed = false;
    let evidence = '';

    if (rule.type === 'artifact-exists') {
      passed = exists(rule.target);
      evidence = passed ? `artifact exists: ${rule.target}` : `artifact missing: ${rule.target}`;
    } else if (rule.type === 'artifact-schema') {
      // TODO: Implement schema validation
      passed = false;
      evidence = 'schema validation not yet implemented';
    } else if (rule.type === 'function') {
      // Run shell command synchronously; exit 0 = pass, non-zero = fail
      // Guard against recursion (e.g. vitest validate → spawns vitest → validate → ...)
      if (process.env.ROADMAP_VALIDATING) {
        passed = true;
        evidence = `skipped (already inside validation): ${rule.fn}`;
      } else {
        try {
          const { execSync } = await import('node:child_process');
          execSync(rule.fn, { stdio: 'pipe', env: { ...process.env, ROADMAP_VALIDATING: '1' } });
          passed = true;
          evidence = `command passed: ${rule.fn}`;
        } catch (e: any) {
          passed = false;
          const stderr = e.stderr?.toString().trim() || e.message || '';
          evidence = `command failed: ${rule.fn} — ${stderr.slice(0, 200)}`;
        }
      }
    } else if (rule.type === 'expanded') {
      // Plan node expansion: check that children with expandedFrom exist
      const allNodes = Object.values(g.nodes) as any[];
      const children = allNodes.filter((n: any) => n.expandedFrom === nodeId);
      const minNodes = rule.minNodes ?? 1;
      passed = children.length >= minNodes;
      evidence = passed
        ? `expanded into ${children.length} node(s): ${children.map((c: any) => c.id).join(', ')}`
        : `expansion incomplete: found ${children.length} child node(s), need >= ${minNodes}`;
    } else if (rule.type === 'manual-approval') {
      // Manual approval requires external sign-off
      passed = false;
      evidence = `manual approval pending${rule.reviewer ? ` from ${rule.reviewer}` : ''}`;
    }

    checks.push({ rule, passed, evidence });
    if (!passed) allPassed = false;
  }

  return {
    nodeId,
    passed: allPassed,
    checks,
    failedReason: allPassed ? undefined : `${checks.filter(c => !c.passed).length} validation(s) failed`,
  };
}

/**
 * Validate a batch of nodes (all nodes in a parallel execution group).
 * Batch validation is stricter than individual node validation:
 * - All nodes must pass validation
 * - All produced artifacts must exist (artifact materialization)
 * Returns pass/fail for the entire batch
 */
export async function validateBatch<T extends string>(
  g: Graph<T>,
  batch: string[],
  exists: (artifact: string) => boolean,
): Promise<{
  passed: boolean;
  results: ValidationResult[];
  summary: string;
  missingArtifacts: string[];
}> {
  // Validate each node in the batch
  const results: ValidationResult[] = [];
  const missingArtifacts: string[] = [];

  for (const nodeId of batch) {
    const result = await validateNode(g, nodeId, exists);
    results.push(result);
  }

  // Check that all produced artifacts exist (artifact materialization requirement)
  for (const nodeId of batch) {
    const node = g.nodes[nodeId as keyof typeof g.nodes] as any;
    if (node && node.produces) {
      for (const artifact of node.produces) {
        if (!exists(artifact)) {
          missingArtifacts.push(artifact);
        }
      }
    }
  }

  const allNodesPass = results.every(r => r.passed);
  const allArtifactsExist = missingArtifacts.length === 0;
  const passed = allNodesPass && allArtifactsExist;

  const summary = (() => {
    if (passed) {
      return `Batch complete: ${batch.length} node(s) validated, all artifacts present`;
    }
    const failedNodes = results.filter(r => !r.passed).length;
    const issues: string[] = [];
    if (failedNodes > 0) issues.push(`${failedNodes} node(s) failed validation`);
    if (missingArtifacts.length > 0) issues.push(`${missingArtifacts.length} artifact(s) missing`);
    return `Batch incomplete: ${issues.join(', ')}`;
  })();

  return { passed, results, summary, missingArtifacts };
}

/**
 * Validate all nodes in a graph
 * Returns summary of what passed/failed
 */
export async function validateGraph<T extends string>(
  g: Graph<T>,
  exists: (artifact: string) => boolean,
): Promise<{
  passed: boolean;
  results: ValidationResult[];
  summary: { total: number; passed: number; failed: number; structuralPassed: number; structuralFailed: number; artifactPassed: number; artifactFailed: number };
}> {
  const nodes = Object.keys(g.nodes);
  const results: ValidationResult[] = [];

  for (const nodeId of nodes) {
    const result = await validateNode(g, nodeId, exists);
    results.push(result);
  }

  // Structural: define/check/verify (graph integrity)
  let structuralPassed = 0;
  let structuralFailed = 0;
  try {
    define(g);
    check(g);
    const verifyErrors = verify(g);
    structuralPassed = verifyErrors.length === 0 ? nodes.length : nodes.length - verifyErrors.length;
    structuralFailed = verifyErrors.length;
  } catch {
    structuralFailed = nodes.length;
  }

  // Artifact: artifact-exists rules only
  let artifactPassed = 0;
  let artifactFailed = 0;
  for (const r of results) {
    const artifactChecks = r.checks.filter(c => c.rule.type === 'artifact-exists');
    artifactPassed += artifactChecks.filter(c => c.passed).length;
    artifactFailed += artifactChecks.filter(c => !c.passed).length;
  }

  const passed = results.every(r => r.passed);
  const summary = {
    total: results.length,
    passed: results.filter(r => r.passed).length,
    failed: results.filter(r => !r.passed).length,
    structuralPassed,
    structuralFailed,
    artifactPassed,
    artifactFailed,
  };

  return { passed, results, summary };
}

