// @module verify
// @exports Violation, VerifyResult, runVerify, bfsReachability, ReachabilityResult, contractClosure, ContractViolation
// @types Violation, VerifyResult, ReachabilityResult, ContractViolation
// @entry roadmap

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { define, consumeArtifact, consumeResolvedBy } from '../protocol.ts';
import type { Graph } from '../protocol.ts';

// --- FR-REACH-001: BFS reachability with witness ---

export interface ReachabilityResult {
  /** All nodes reachable from init, with BFS path evidence */
  reachable: Map<string, string[]>;  // nodeId → path from init
  /** Nodes not reachable from init */
  unreachable: string[];
  /** Nodes reachable from init but that cannot reach term */
  deadEnds: string[];
}

/**
 * Single-pass BFS reachability from init.
 * Returns witness paths for all reachable nodes and identifies unreachable + dead-end nodes.
 * Replaces multi-pass DFS (FR-REACH-001).
 */
export function bfsReachability<T extends string>(g: Graph<T>): ReachabilityResult {
  const nodes = Object.values(g.nodes) as Array<{ id: string; deps: readonly string[] }>;
  const allIds = new Set(nodes.map(n => n.id));

  // Build forward adjacency: dep → successors
  const fwd = new Map<string, string[]>(nodes.map(n => [n.id, [] as string[]]));
  for (const n of nodes) {
    for (const d of n.deps) {
      fwd.get(d)?.push(n.id);
    }
  }

  // BFS from init — O(V+E) single pass
  const reachable = new Map<string, string[]>();
  const q: Array<{ id: string; path: string[] }> = [{ id: g.init, path: [g.init] }];
  while (q.length) {
    const { id, path } = q.shift()!;
    if (reachable.has(id)) continue;
    reachable.set(id, path);
    for (const s of fwd.get(id) ?? []) {
      if (!reachable.has(s)) q.push({ id: s, path: [...path, s] });
    }
  }

  const unreachable = nodes.map(n => n.id).filter(id => !reachable.has(id));

  // Reverse BFS from term to find dead-ends (reachable from init but cannot reach term)
  const bwd = new Map<string, string[]>(nodes.map(n => [n.id, [] as string[]]));
  for (const n of nodes) {
    for (const d of n.deps) {
      bwd.get(n.id)?.push(d);
      // reverse: d ← n means n can be reached from d, so d → n in fwd; bwd[n] → [d]
    }
  }
  // Actually reverse: from each node, go to its dependents (predecessors in dependency sense)
  // We need: which nodes can reach term? Do reverse BFS from term using fwd edges in reverse
  const canReachTerm = new Set<string>();
  const rq: string[] = [g.term];
  const revAdj = new Map<string, string[]>(nodes.map(n => [n.id, [] as string[]]));
  for (const n of nodes) {
    for (const d of n.deps) {
      const succs = revAdj.get(d) ?? [];
      succs.push(n.id);
      revAdj.set(d, succs);
    }
  }
  // revAdj[node] = nodes that depend on it (successors in topological order)
  // For "can reach term": reverse the graph (term ← successors)
  const termRevAdj = new Map<string, string[]>(nodes.map(n => [n.id, [] as string[]]));
  for (const n of nodes) {
    for (const d of n.deps) {
      const arr = termRevAdj.get(n.id) ?? [];
      arr.push(d);
      termRevAdj.set(n.id, arr);
    }
  }
  // BFS from term using deps as reverse edges: if n has dep d, then d → n in fwd, so in rev: n → d? No.
  // Forward: d must complete before n. Edge d→n. Reverse: n→d.
  // "can reach term" using forward edges: start from node, follow fwd edges, can we reach term?
  // Equivalently: reverse graph has edge n→d for each dep d of n. BFS from term in reverse graph.
  const revFwd = new Map<string, string[]>(nodes.map(n => [n.id, [] as string[]]));
  for (const n of nodes) {
    for (const d of n.deps) {
      // forward edge: d → n. Reverse: n → d.
      const arr = revFwd.get(n.id) ?? [];
      arr.push(d);
      revFwd.set(n.id, arr);
    }
  }
  const canReachQ: string[] = [g.term];
  while (canReachQ.length) {
    const id = canReachQ.shift()!;
    if (canReachTerm.has(id)) continue;
    canReachTerm.add(id);
    for (const pred of revFwd.get(id) ?? []) {
      if (!canReachTerm.has(pred)) canReachQ.push(pred);
    }
  }

  const deadEnds = [...reachable.keys()].filter(id => !canReachTerm.has(id) && id !== g.term);

  return { reachable, unreachable, deadEnds };
}

// --- FR-CONTRACT-001: DP ancestor closure with witness ---

export interface ContractViolation {
  nodeId: string;
  missingArtifact: string;
  /** Which ancestor should have produced this artifact, if determinable */
  expectedProducer?: string;
  /** BFS path from init to nodeId showing the dependency chain */
  witnessPath: string[];
}

/**
 * Bottom-up DP ancestor closure: compute full ancestor set for each node,
 * then check each consumes entry against the closure's produces.
 * Emits ContractViolation with witness path for each missing artifact.
 * Replaces ad-hoc predecessor walk (FR-CONTRACT-001).
 */
export function contractClosure<T extends string>(g: Graph<T>): ContractViolation[] {
  const nodes = Object.values(g.nodes) as Array<{
    id: string;
    deps: readonly string[];
    produces: readonly string[];
    consumes: readonly string[];
  }>;
  const nm = new Map(nodes.map(n => [n.id, n]));
  const allIds = new Set(nodes.map(n => n.id));

  // BFS paths from init for witness
  const fwd = new Map<string, string[]>(nodes.map(n => [n.id, [] as string[]]));
  for (const n of nodes) {
    for (const d of n.deps) fwd.get(d)?.push(n.id);
  }
  const paths = new Map<string, string[]>();
  const bfsQ: Array<{ id: string; path: string[] }> = [{ id: g.init, path: [g.init] }];
  while (bfsQ.length) {
    const { id, path } = bfsQ.shift()!;
    if (paths.has(id)) continue;
    paths.set(id, path);
    for (const s of fwd.get(id) ?? []) {
      if (!paths.has(s)) bfsQ.push({ id: s, path: [...path, s] });
    }
  }

  // Bottom-up DP: topological order, compute ancestor set per node
  // ancestor closure = all nodes reachable from init that are predecessors of this node
  const ancestorSet = new Map<string, Set<string>>();
  // Topological sort via Kahn's
  const inDeg = new Map(nodes.map(n => [n.id, n.deps.filter(d => allIds.has(d)).length]));
  const topoQ = [...inDeg].filter(([, d]) => d === 0).map(([id]) => id);
  const topo: string[] = [];
  const inDegCopy = new Map(inDeg);
  while (topoQ.length) {
    const id = topoQ.shift()!;
    topo.push(id);
    for (const s of fwd.get(id) ?? []) {
      const d = inDegCopy.get(s)! - 1;
      inDegCopy.set(s, d);
      if (d === 0) topoQ.push(s);
    }
  }
  // Process in topo order: each node inherits ancestors of its deps
  for (const id of topo) {
    const node = nm.get(id)!;
    const ancestors = new Set<string>();
    for (const dep of node.deps.filter(d => allIds.has(d))) {
      ancestors.add(dep);
      for (const a of ancestorSet.get(dep) ?? []) ancestors.add(a);
    }
    ancestorSet.set(id, ancestors);
  }

  // Check contracts using closure
  const violations: ContractViolation[] = [];
  for (const node of nodes) {
    if (!node.consumes.length) continue;
    const ancestors = ancestorSet.get(node.id) ?? new Set();
    // All artifacts available from ancestors
    const available = new Map<string, string>(); // artifact → producing nodeId
    for (const anc of ancestors) {
      const ancNode = nm.get(anc)!;
      for (const p of ancNode.produces) {
        if (!available.has(p)) available.set(p, anc);
      }
    }

    for (const c of node.consumes) {
      const artifact = consumeArtifact(c);
      const resolver = consumeResolvedBy(c);
      if (available.has(artifact)) continue;
      if (resolver && allIds.has(resolver)) continue; // acknowledged pending
      violations.push({
        nodeId: node.id,
        missingArtifact: artifact,
        expectedProducer: available.get(artifact), // undefined if no ancestor produces it
        witnessPath: paths.get(node.id) ?? [node.id],
      });
    }
  }

  return violations;
}
import { loadCompletions, getCompletedNodeIds } from './completion-tracker.ts';
import { validatePlanSelection } from './plan-selection.ts';
import { isSpecOrigin, SPEC_ORIGIN_PATH } from './spec-origin.ts';
import { loadPeers } from './utils/federation/federation.ts';

export interface Violation {
  code: string;
  message: string;
  paths?: string[];
  nodeIds?: string[];
  fix: string[];
}

export interface VerifyResult {
  violations: Violation[];
  warnings: Violation[];
  fix: string[];
}

// Structural validity: define() + single-pass BFS reachability (FR-REACH-001)
function checkStructure(dag: Graph<string>): Violation[] {
  const violations: Violation[] = [];
  try {
    define(dag);
  } catch (err) {
    violations.push({
      code: 'STRUCTURAL_INVALID',
      message: `DAG structural error: ${String(err instanceof Error ? err.message : err)}`,
      fix: ['Fix head.json structure — cycles, missing init/term, or id/key mismatches'],
    });
    return violations; // can't BFS a structurally invalid graph
  }

  // Single-pass BFS replaces multi-pass reach() calls (FR-REACH-001)
  const reach = bfsReachability(dag);

  if (reach.unreachable.length > 0) {
    violations.push({
      code: 'ORPHAN_NODES',
      message: `${reach.unreachable.length} node(s) unreachable from init`,
      nodeIds: reach.unreachable,
      fix: ['Add dependency edges to connect orphan nodes to the DAG'],
    });
  }

  if (reach.deadEnds.length > 0) {
    violations.push({
      code: 'DEAD_END_NODES',
      message: `${reach.deadEnds.length} node(s) reachable from init but cannot reach term`,
      nodeIds: reach.deadEnds,
      fix: reach.deadEnds.map(id => {
        const witness = reach.reachable.get(id) ?? [id];
        return `"${id}" (path: ${witness.join(' → ')}) — add edge to a node that reaches term`;
      }),
    });
  }

  // loopTarget validation (preserved from check())
  const nodes = Object.values(dag.nodes) as Array<{ id: string; loopTarget?: string }>;
  const ids = new Set(nodes.map(n => n.id));
  for (const n of nodes) {
    if (n.loopTarget && !ids.has(n.loopTarget)) {
      violations.push({
        code: 'INVALID_LOOP_TARGET',
        message: `"${n.id}": loopTarget "${n.loopTarget}" does not exist in this graph`,
        nodeIds: [n.id],
        fix: [`Fix loopTarget reference in node "${n.id}"`],
      });
    }
  }

  return violations;
}

// Contract validity: DP ancestor closure with witness (FR-CONTRACT-001)
function checkContracts(dag: Graph<string>): Violation[] {
  try {
    const violations = contractClosure(dag);
    if (violations.length === 0) return [];
    return violations.map(v => ({
      code: 'UNSATISFIED_CONTRACT',
      message: `"${v.nodeId}" consumes "${v.missingArtifact}" — no ancestor produces it`,
      nodeIds: [v.nodeId],
      paths: [v.witnessPath.join(' → ')],
      fix: v.expectedProducer
        ? [`Add "${v.missingArtifact}" to produces of "${v.expectedProducer}" or add it as a dependency`]
        : [`Ensure a predecessor of "${v.nodeId}" produces "${v.missingArtifact}"`],
    }));
  } catch (err) {
    return [{
      code: 'CONTRACT_CHECK_FAILED',
      message: `Contract verification error: ${String(err instanceof Error ? err.message : err)}`,
      fix: ['Fix head.json node consumes/produces declarations'],
    }];
  }
}

// CompletionStore consistency: completed nodes must exist in DAG
function checkCompletions(repoRoot: string, dag: Graph<string>): Violation[] {
  const warnings: Violation[] = [];
  const completions = loadCompletions(repoRoot);
  const completedIds = getCompletedNodeIds(completions);
  const dagNodeIds = new Set(Object.keys(dag.nodes));

  const orphanCompletions = [...completedIds].filter(id => !dagNodeIds.has(id));
  if (orphanCompletions.length > 0) {
    warnings.push({
      code: 'ORPHAN_COMPLETIONS',
      message: `${orphanCompletions.length} completion record(s) reference nodes not in the DAG`,
      nodeIds: orphanCompletions,
      fix: ['Remove stale entries from .roadmap/completed.json or re-add missing nodes'],
    });
  }

  return warnings;
}

// Plan-selection receipt validity
function checkPlanSelection(repoRoot: string): Violation[] {
  const result = validatePlanSelection(repoRoot);
  if (result.valid) return [];
  return [{
    code: 'PLAN_SELECTION_INVALID',
    message: result.reason ?? 'Plan selection receipt invalid or missing',
    fix: ['roadmap plan select <candidateId> --note "reason"'],
  }];
}

// Spec-origin integrity: if spec-origin.json exists, it must parse as valid SpecOrigin
function checkSpecOrigin(repoRoot: string): Violation[] {
  const p = join(repoRoot, SPEC_ORIGIN_PATH);
  if (!existsSync(p)) return []; // no spec origin = OK (not all DAGs are spec-compiled)

  try {
    const raw = JSON.parse(readFileSync(p, 'utf-8'));
    if (!isSpecOrigin(raw)) {
      return [{
        code: 'SPEC_ORIGIN_MALFORMED',
        message: 'spec-origin.json exists but does not conform to SpecOrigin schema',
        paths: [p],
        fix: ['Re-import: roadmap import --spec-compiled <path> --note "..."'],
      }];
    }
  } catch (err) {
    return [{
      code: 'SPEC_ORIGIN_PARSE_ERROR',
      message: `Failed to parse spec-origin.json: ${String(err instanceof Error ? err.message : err)}`,
      paths: [p],
      fix: ['Fix or regenerate .roadmap/spec-origin.json'],
    }];
  }

  return [];
}

// Orphan receipt detection: receipts in .roadmap/receipts/ that don't match any DAG node or known receipt type
function checkOrphanReceipts(repoRoot: string, dag: Graph<string>): Violation[] {
  const receiptsDir = join(repoRoot, '.roadmap', 'receipts');
  if (!existsSync(receiptsDir)) return [];

  const files = readdirSync(receiptsDir).filter(f => f.endsWith('.json'));
  const dagNodeIds = new Set(Object.keys(dag.nodes));
  const knownPrefixes = ['plan-select-', 'spec-import-', 'PLAN_SELECTED', 'certify-', 'advance-', 'complete-'];

  const orphans: string[] = [];
  for (const f of files) {
    // Skip known receipt types
    if (knownPrefixes.some(p => f.startsWith(p))) continue;

    // Check if receipt filename contains a node ID
    const matchesNode = [...dagNodeIds].some(id => f.includes(id));
    if (!matchesNode) orphans.push(f);
  }

  if (orphans.length === 0) return [];
  return [{
    code: 'ORPHAN_RECEIPTS',
    message: `${orphans.length} receipt file(s) in .roadmap/receipts/ do not match any known pattern or DAG node`,
    paths: orphans.map(f => join(receiptsDir, f)),
    fix: ['Remove stale receipt files or investigate their origin'],
  }];
}

// Env-var bypass scan: find process.env references in src/ that could bypass governance
function checkEnvBypasses(repoRoot: string): Violation[] {
  const srcDir = join(repoRoot, 'src');
  if (!existsSync(srcDir)) return [];

  const bypassPatterns = ['SKIP_BATCH_COMMIT', 'SKIP_TEST_CHECK', 'SKIP_VALIDATE', 'ROADMAP_SKIP'];
  const found: string[] = [];

  try {
    const result = execSync(
      `grep -rn "process\\.env\\[" "${srcDir}" --include="*.ts" 2>/dev/null || true`,
      { encoding: 'utf-8', timeout: 5000 },
    );

    for (const line of result.split('\n')) {
      if (!line.trim()) continue;
      for (const pat of bypassPatterns) {
        if (line.includes(pat)) {
          found.push(line.trim());
        }
      }
    }
  } catch {
    // grep failure is non-fatal
  }

  if (found.length === 0) return [];
  return [{
    code: 'ENV_BYPASS_DETECTED',
    message: `${found.length} governance bypass env-var reference(s) found in src/`,
    paths: found,
    fix: ['Review and remove unnecessary bypass env-vars from source code'],
  }];
}

// No artifact-only completion: completed nodes should have validation evidence, not just artifact existence
function checkArtifactOnlyCompletions(repoRoot: string, dag: Graph<string>): Violation[] {
  const completions = loadCompletions(repoRoot);
  const dagNodeIds = new Set(Object.keys(dag.nodes));
  const suspect: string[] = [];

  for (const [nodeId, record] of completions) {
    if (!dagNodeIds.has(nodeId)) continue; // orphan, handled elsewhere
    const node = (dag.nodes as Record<string, unknown>)[nodeId] as { validate?: ReadonlyArray<{ type: string }> } | undefined;
    if (!node) continue;

    // If node has shell/build-produces validators but completion has no checkpoint, flag it
    const hasRealValidators = node.validate?.some(
      v => v.type === 'shell' || v.type === 'build-produces' || v.type === 'launch-check',
    );
    if (hasRealValidators && !record.checkpointId) {
      suspect.push(nodeId);
    }
  }

  if (suspect.length === 0) return [];
  return [{
    code: 'ARTIFACT_ONLY_COMPLETION',
    message: `${suspect.length} node(s) with validators completed without checkpoint evidence`,
    nodeIds: suspect,
    fix: ['Re-complete these nodes via `roadmap complete <node> --note "..."`'],
  }];
}

// Cross-repo dependency verification: peer::<repoId>::<nodeId> deps
function checkCrossRepoDeps(repoRoot: string, dag: Graph<string>): Violation[] {
  const violations: Violation[] = [];
  const dagNodes = dag.nodes as unknown as Record<string, { deps?: readonly string[] }>;

  // Collect all cross-repo deps
  const crossDeps: { nodeId: string; peerId: string; remoteNodeId: string }[] = [];
  for (const [nodeId, spec] of Object.entries(dagNodes)) {
    for (const dep of spec.deps ?? []) {
      const match = dep.match(/^peer::([^:]+)::(.+)$/);
      if (match) {
        crossDeps.push({ nodeId, peerId: match[1], remoteNodeId: match[2] });
      }
    }
  }

  if (crossDeps.length === 0) return [];

  const peers = loadPeers(repoRoot);
  const peerMap = new Map(peers.map(p => [p.id, p]));

  for (const { nodeId, peerId, remoteNodeId } of crossDeps) {
    const peer = peerMap.get(peerId);
    if (!peer) {
      violations.push({
        code: 'UNKNOWN_PEER',
        message: `Node "${nodeId}" depends on peer "${peerId}" which is not in federation peers`,
        nodeIds: [nodeId],
        fix: [`roadmap federation add --id ${peerId} --path <repo-path> --note "add peer"`],
      });
      continue;
    }

    // Check if the remote node is completed
    const completedPath = join(peer.path, '.roadmap', 'completed.json');
    if (!existsSync(completedPath)) {
      violations.push({
        code: 'PEER_DEP_UNSATISFIED',
        message: `Node "${nodeId}" depends on peer "${peerId}::${remoteNodeId}" but peer has no completion store`,
        nodeIds: [nodeId],
        fix: [`Complete node "${remoteNodeId}" in peer repo at ${peer.path}`],
      });
      continue;
    }

    try {
      const records = JSON.parse(readFileSync(completedPath, 'utf-8'));
      const completedIds = new Set(Array.isArray(records) ? records.map((r: any) => r.nodeId) : []);
      if (!completedIds.has(remoteNodeId)) {
        violations.push({
          code: 'PEER_DEP_UNSATISFIED',
          message: `Node "${nodeId}" depends on peer "${peerId}::${remoteNodeId}" which is not yet completed`,
          nodeIds: [nodeId],
          fix: [`Complete node "${remoteNodeId}" in peer repo at ${peer.path}`],
        });
      }
    } catch {
      violations.push({
        code: 'PEER_DEP_UNSATISFIED',
        message: `Node "${nodeId}" depends on peer "${peerId}::${remoteNodeId}" but peer completion store is unreadable`,
        nodeIds: [nodeId],
        fix: [`Check peer repo at ${peer.path}`],
      });
    }
  }

  return violations;
}

export function runVerify(repoRoot: string): VerifyResult {
  const headPath = join(repoRoot, '.roadmap', 'head.json');
  if (!existsSync(headPath)) {
    return {
      violations: [{
        code: 'NO_DAG',
        message: 'No .roadmap/head.json found',
        paths: [headPath],
        fix: ['Run `roadmap init <dag-id>` or create head.json'],
      }],
      warnings: [],
      fix: ['roadmap init <dag-id>'],
    };
  }

  let dag: Graph<string>;
  try {
    dag = JSON.parse(readFileSync(headPath, 'utf-8'));
  } catch (err) {
    return {
      violations: [{
        code: 'DAG_PARSE_ERROR',
        message: `Failed to parse head.json: ${String(err instanceof Error ? err.message : err)}`,
        paths: [headPath],
        fix: ['Fix JSON syntax in .roadmap/head.json'],
      }],
      warnings: [],
      fix: ['Fix .roadmap/head.json'],
    };
  }

  const violations = [
    ...checkStructure(dag),
    ...checkContracts(dag),
    ...checkSpecOrigin(repoRoot),
    ...checkCrossRepoDeps(repoRoot, dag),
  ];

  const warnings = [
    ...checkCompletions(repoRoot, dag),
    ...checkPlanSelection(repoRoot),
    ...checkOrphanReceipts(repoRoot, dag),
    ...checkEnvBypasses(repoRoot),
    ...checkArtifactOnlyCompletions(repoRoot, dag),
  ];

  const fix = violations.flatMap(v => v.fix);

  return { violations, warnings, fix };
}
