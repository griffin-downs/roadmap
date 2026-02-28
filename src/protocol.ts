// @module protocol
// @exports define, graph, check, verify, order, parallelOrder, batchConflicts, orient, advanceBatch, readyNodes, nextBatch, criticalPath, reconcile, merge, branch, analyze, modify, modifyAndCommit, validateNode, validateBatch, validateGraph, CompletionStore
// @types NodeSpec, Graph, SpecMeta, Orientation, ReadyNode, NextBatch, BatchConflict, Connection, Gap, ValidationRule, ValidationCheck, ValidationResult, ModifyAnalysis, ModificationRecord, ConsumeSpec, RuntimeExploreRule, ObservationSpec, ObservationResult, ExploreResult, IntentFailure, ConvergenceLimits, EscalationResult, IntentDiagnosis
// @entry roadmap/protocol

import { CompletionStore } from './lib/completion-context.ts';
export { CompletionStore } from './lib/completion-context.ts';

// --- Types ---

export type ValidationRule =
  | { type: 'artifact-exists'; target?: string; path?: string; _propagatedFrom?: string }
  | { type: 'artifact-schema'; target: string; schema: string }
  | { type: 'function'; target: string; fn: string }
  | { type: 'manual-approval'; target: string; reviewer?: string }
  | { type: 'expanded'; minNodes?: number }
  | { type: 'shell'; command: string | string[]; expectExitCode?: number }
  | { type: 'build-produces'; command: string; outputs: string[] }
  | { type: 'launch-check'; command: string; timeout?: number; successSignal?: string }
  | { type: 'spec-conformance'; spec: string; stories: number[]; criteria?: number[] }
  | { type: 'intent'; statement: string; confidence: number; evaluator: 'self' | 'council'; context?: string[]; expandOnFail?: boolean; maxExpansionDepth?: number }
  | { type: 'runtime-explore'; script: string; launch?: string; port?: number; timeout?: number; observations: ObservationSpec[] };

// LLM-provided judgment for one intent statement.
// Passed via --evaluate '[{...}]' on the complete command.
export interface IntentJudgment {
  statement: string;   // must match rule.statement exactly
  confidence: number;  // 0.0–1.0
  reasoning: string;   // one paragraph
  evidence?: string[]; // file:line references (optional)
}

// Runtime exploration types — CDP-based behavioral observation
export interface ObservationSpec {
  id: string;                        // unique identifier for this observation
  description: string;               // human-readable: "todo text visible in light mode"
  type: 'assertion' | 'measurement'; // assertion = pass/fail, measurement = value capture
}

export interface ObservationResult {
  id: string;                          // matches ObservationSpec.id
  pass: boolean;
  value?: string | number | boolean;   // measured value
  evidence: string;                    // human-readable: "color: #1a1a1a on bg: #ffffff"
}

export interface ExploreResult {
  observations: ObservationResult[];
  screenshots?: string[];              // paths to captured screenshots (for audit)
  duration: number;                    // ms
}

export interface ValidationCheck {
  rule: ValidationRule;
  passed: boolean;
  evidence?: string;
  judgment?: IntentJudgment;                  // populated when judgment was provided
  intentStatus?: 'evaluated' | 'unevaluated'; // present only for intent rules
  observations?: ObservationResult[];         // populated when runtime-explore results provided
}

export interface ValidationResult {
  nodeId: string;
  passed: boolean;
  checks: ValidationCheck[];
  failedReason?: string;
  expansionStatus?: 'expanding' | 'escalated'; // set when expandOnFail triggers
  failingIntents?: IntentFailure[];             // populated when expansionStatus is set
  escalation?: EscalationResult;                // populated when expansionStatus === 'escalated'
}

// Intent failure captured for expansion
export interface IntentFailure {
  statement: string;
  achieved: number;    // actual confidence
  threshold: number;   // required confidence
  reasoning: string;
  evidence: string[];
  context?: string[];  // from intent rule — scopes fix node produces
}

// Convergence limits for intent-driven expansion
export interface ConvergenceLimits {
  maxExpansionDepth: number;    // hard recursion limit (default: 3)
  stallThreshold: number;       // min confidence improvement per level (default: 0.05)
  maxExpansionCost?: number;    // USD budget cap (optional)
}

// Escalation when expansion cannot converge
export interface EscalationResult {
  status: 'escalated';
  node: string;
  statement: string;
  history: Array<{ depth: number; confidence: number }>;
  diagnosis: string;
  reason: 'depth-exceeded' | 'stalled' | 'budget-exceeded';
  budgetInfo?: {
    maxBudget: number;        // USD cap
    cumulativeCost: number;   // USD spent
    levelCost: number;        // USD required for next level
    shortfall: number;        // (cumulativeCost + levelCost) - maxBudget
  };
}

// Intent diagnosis with observation-informed details for intent-driven expansion
export interface IntentDiagnosis {
  statement: string;
  achievedConfidence: number;
  threshold: number;
  reasoning: string;
  evidence: string[];
  expansionDepth: number;
  observationFailures?: Array<{ id: string; description: string; evidence: string }>;  // failed observations from runtime-explore
  informedBy?: 'runtime-explore' | 'llm' | 'hybrid' | 'unevaluated'; // judgment source
}

// Consume entry: plain string (artifact path) or acknowledged pending contract.
// resolvedBy: this artifact is intentionally unresolved until the named node completes.
// verify() suppresses the warning while the resolver node is still incomplete.
export type ConsumeSpec = string | { artifact: string; resolvedBy: string };

export function consumeArtifact(c: ConsumeSpec): string {
  return typeof c === 'string' ? c : c.artifact;
}

export function consumeResolvedBy(c: ConsumeSpec): string | undefined {
  return typeof c === 'string' ? undefined : c.resolvedBy;
}

export interface NodeSpec<TAll extends string, TSelf extends TAll = TAll> {
  readonly id: TSelf;
  readonly desc: string;
  readonly produces: readonly string[];
  readonly consumes: readonly (ConsumeSpec)[];
  readonly deps: readonly TAll[];
  readonly validate: readonly ValidationRule[]; // ← REQUIRED
  readonly idempotent: boolean; // ← REQUIRED: true=re-runnable, false=manual/state-changing
  readonly mode?: 'execute' | 'plan'; // default: 'execute'. 'plan' = decompose, output is DAG expansion
  readonly nodeType?: 'execute' | 'emit-gallery'; // dispatch dimension: pipeline type (orthogonal to mode)
  readonly expandedFrom?: string; // provenance: which plan node spawned this node via expansion
  readonly loopTarget?: string; // re-entry node when convergence check fails (soft loop)
  readonly convergenceCheck?: { readonly maxCoverageDelta?: number; readonly requireEmptyProposals?: boolean; readonly minWallClockDeltaMs?: number }; // loop termination criteria
  readonly ambient?: readonly string[]; // agent reads these for context; not a dep, not validated, never gates readiness
  readonly _intentDiagnosis?: IntentDiagnosis; // provenance: what failing intent triggered this fix node's creation
  readonly track?: number; // governance track index (e.g., 0=default, 1=security, 2=perf)
  readonly affects?: readonly string[]; // file paths or areas this node modifies beyond produces
}

export interface EmitGalleryNodeSpec {
  id: string
  nodeType: 'emit-gallery'           // discriminant, distinct from mode
  candidates: number                 // how many implementations to generate
  strategies: string[]               // e.g. ['faithful', 'minimal', 'robust', 'budget']
  selectionMode: 'auto' | 'manual'  // auto = LLM selects via Judgment
  validate: ValidationRule[]         // gate suite applied to each candidate
  produces: string[]
  deps?: string[]               // local node IDs or cross-repo: "peer::<repoId>::<nodeId>"
  desc?: string
}

// Inference helper — extracts T from nodes, avoids mapped-type inference limits.
export function graph<T extends string>(
  g: { id: string; desc: string; init: string; term: string; nodes: { [N in T]: NodeSpec<T, N> }; termGates?: readonly TermGate[]; spec?: SpecMeta },
): Graph<T> {
  return g;
}

/**
 * Term gate in stacked gate architecture
 * Multiple reviewers validate different aspects of the running system
 */
export interface TermGate {
  readonly id: string;
  readonly reviewer: string;  // e.g., "Visual Engineer", "Feature Engineer"
  readonly validates: string;  // e.g., "App is visible and running"
  readonly checks: readonly ValidationRule[];
  readonly expandOnFail?: boolean;  // if true, expand DAG when this gate fails
}

// Spec provenance metadata — compiled hash, engine version, and source inputs.
export interface SpecMeta {
  readonly compiled_sha256: string;
  readonly engine: { readonly name: string; readonly version: string | null };
  readonly inputs: ReadonlyArray<{ readonly path: string; readonly sha256: string; readonly role: string }>;
}

export interface Graph<T extends string> {
  readonly id: string;
  readonly desc: string;
  readonly init: string;
  readonly term: string;
  readonly nodes: { readonly [N in T]: NodeSpec<T, N> };
  readonly termGates?: readonly TermGate[];  // stacked term gates (optional, for new DAGs)
  readonly spec?: SpecMeta;  // FR-SPEC-003: compiled spec provenance
}

export type Connection = { forward: string; backward: string; artifact: string };
export type Gap = { between: [string, string]; missing: string[] };

// --- Internal: flat iteration over mapped type ---

type Flat = { id: string; produces: readonly string[]; consumes: readonly string[]; deps: readonly string[]; mode?: 'execute' | 'plan'; expandedFrom?: string; loopTarget?: string; convergenceCheck?: { maxCoverageDelta?: number; requireEmptyProposals?: boolean; minWallClockDeltaMs?: number }; ambient?: readonly string[]; track?: number; affects?: readonly string[] };

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

const CONVERGENCE_CHECK_KEYS = new Set(['maxCoverageDelta', 'requireEmptyProposals', 'minWallClockDeltaMs']);

export function define<T extends string>(g: Graph<T>): Graph<T> {
  const nodes = flat(g);
  const ids = new Set(nodes.map(n => n.id));

  if (!ids.has(g.init)) throw new Error(`init "${g.init}" not in nodes`);
  if (!ids.has(g.term)) throw new Error(`term "${g.term}" not in nodes`);
  if (g.init === g.term) throw new Error(`init and term cannot be the same node`);

  const c = detectCycles(nodes);
  if (c.length) throw new Error(`Cycle in "${g.id}": ${c.join(', ')}`);

  // Validate convergenceCheck keys — unknown keys are silently wrong, catch them early.
  for (const n of nodes) {
    if (!n.convergenceCheck) continue;
    const unknown = Object.keys(n.convergenceCheck).filter(k => !CONVERGENCE_CHECK_KEYS.has(k));
    if (unknown.length) throw new Error(`Node "${n.id}" convergenceCheck has unknown keys: ${unknown.join(', ')} — valid keys: ${[...CONVERGENCE_CHECK_KEYS].join(', ')}`);
  }

  // Validate track/affects
  for (const n of nodes) {
    const spec = n as unknown as { track?: unknown; affects?: unknown };
    if (spec.track !== undefined) {
      if (typeof spec.track !== 'number' || !Number.isInteger(spec.track) || spec.track < 0) {
        throw new Error(`Node "${n.id}" track must be a non-negative integer, got: ${spec.track}`);
      }
    }
    if (spec.affects !== undefined) {
      if (!Array.isArray(spec.affects)) {
        throw new Error(`Node "${n.id}" affects must be an array`);
      }
      for (const a of spec.affects) {
        if (typeof a !== 'string' || a.length === 0) {
          throw new Error(`Node "${n.id}" affects entries must be non-empty strings`);
        }
      }
    }
  }

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
      const artifact = consumeArtifact(c);
      const resolver = consumeResolvedBy(c);
      if (available.has(artifact)) continue;
      // Acknowledged pending: suppress warning if resolver node exists in the DAG
      if (resolver && ids.has(resolver)) continue;
      errors.push(`"${node.id}" consumes "${artifact}" — no predecessor produces it`);
    }
  }

  return errors;
}

// --- check: termination ---
// Every node reachable from init AND can reach term.

export function check<T extends string>(g: Graph<T>): { done: boolean; orphans: string[] } {
  const nodes = flat(g);
  const ids = new Set(nodes.map(n => n.id));
  const orphans: string[] = [];

  // Init must reach term.
  if (!reach(nodes, g.init, g.term)) orphans.push(`${g.term}: unreachable from ${g.init}`);

  for (const n of nodes) {
    if (n.id === g.init || n.id === g.term) continue;
    if (!reach(nodes, g.init, n.id)) orphans.push(`${n.id}: unreachable from ${g.init}`);
    else if (!reach(nodes, n.id, g.term)) orphans.push(`${n.id}: cannot reach ${g.term}`);

    // loopTarget must reference an existing node — a typo produces a silent dead loop.
    if (n.loopTarget && !ids.has(n.loopTarget)) {
      orphans.push(`${n.id}: loopTarget "${n.loopTarget}" does not exist in this graph`);
    }
  }
  // Check term node loopTarget too.
  const termNode = nodes.find(n => n.id === g.term);
  if (termNode?.loopTarget && !ids.has(termNode.loopTarget)) {
    orphans.push(`${g.term}: loopTarget "${termNode.loopTarget}" does not exist in this graph`);
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
      const bnArtifacts = bn.consumes.map(consumeArtifact);
      const shared = fn.produces.filter(p => bnArtifacts.includes(p));
      if (shared.length) {
        for (const a of shared) connections.push({ forward: f, backward: b, artifact: a });
      } else {
        const m = bnArtifacts.filter(c => !fn.produces.includes(c));
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
    // Lexicographic sort within batch — stable by policy (FR-DET-001)
    batches.push(ready.sort((a, b) => a.localeCompare(b)));
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

// --- batchConflicts: detect resource conflicts within parallel batches ---
// Two nodes in the same batch that write the same file will clobber each other
// if assigned to different agents. This finds those conflicts.

export interface BatchConflict {
  level: number;
  file: string;
  writers: string[];     // produces overlap: multiple nodes write same file
  type: 'produces-overlap' | 'consumes-produces-race';
}

export function batchConflicts<T extends string>(g: Graph<T>): BatchConflict[] {
  const batches = parallelOrder(g);
  const nodes = flat(g);
  const nm = new Map(nodes.map(n => [n.id, n]));
  const conflicts: BatchConflict[] = [];

  for (let level = 0; level < batches.length; level++) {
    const batch = batches[level];
    if (batch.length < 2) continue;

    // Produces overlap: two nodes write the same file
    const writers = new Map<string, string[]>();
    for (const id of batch) {
      const produces = nm.get(id)!.produces ?? [];
      if (!Array.isArray(produces)) continue;
      for (const p of produces) {
        const w = writers.get(p) ?? [];
        w.push(id);
        writers.set(p, w);
      }
    }
    for (const [file, w] of writers) {
      if (w.length > 1) conflicts.push({ level, file, writers: w, type: 'produces-overlap' });
    }

    // Consumes-produces race: node A consumes what node B in same batch produces
    const producedInBatch = new Map<string, string>();
    for (const id of batch) {
      const produces = nm.get(id)!.produces ?? [];
      if (!Array.isArray(produces)) continue;
      for (const p of produces) producedInBatch.set(p, id);
    }
    for (const id of batch) {
      const consumes = nm.get(id)!.consumes ?? [];
      if (!Array.isArray(consumes)) continue;
      for (const c of consumes.map(consumeArtifact)) {
        const producer = producedInBatch.get(c);
        if (producer && producer !== id) {
          conflicts.push({ level, file: c, writers: [producer, id], type: 'consumes-produces-race' });
        }
      }
    }
  }

  return conflicts;
}

// --- orient: agent reorientation ---
// Given a graph and a filesystem probe, returns current batch position, what's done,
// what to produce, what's available to consume, and what remains.
// Position is a batch (array of nodes), not a single node.

export interface LoopSignal {
  target: string;             // re-entry node ID
  convergenceCheck?: { maxCoverageDelta?: number; requireEmptyProposals?: boolean };
}

export interface PlanReceipt {
  nodeId: string;
  mode: 'plan';
  preGateActive: boolean;
  expandedChildren: string[];
}

export interface Orientation {
  position: string[];         // batch: array of nodes that can run in parallel
  level: number;              // batch index (0-based)
  batchRemaining: string[];   // nodes in current batch that aren't done
  batchComplete: boolean;     // all nodes in current batch validated + artifacts exist
  preGate: string[];          // plan nodes workable before deps close (investigation can start)
  done: string[];
  produces: readonly string[];
  consumes: readonly string[];
  remaining: string[];
  loop?: LoopSignal;          // present if a position node has loopTarget (soft loop)
  planReceipts?: PlanReceipt[];  // plan nodes in current batch — allows orchestrators to distinguish plan vs execute (FR-ORIENT-001)
  intentPolicyActive?: boolean;  // true when kernel.json intentPolicy is enforcing advancement gates
}

export function orient<T extends string>(
  g: Graph<T>,
  completion: CompletionStore,
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
      // Plan node: receipt or expansion children
      if (node.mode === 'plan') {
        if (completion.hasPassing(id)) return false;
        const children = expansionChildren.get(id) ?? [];
        return children.length === 0;
      }
      // Receipt-only: node is done iff it has a passing receipt
      return !completion.hasPassing(id);
    });

    if (batchIncomplete.length > 0) {
      // This is the first incomplete batch
      const batchDone = batch.filter(id => !batchIncomplete.includes(id));
      const remainingBatches = batches.slice(batches.indexOf(batch) + 1).flat();
      const batchProduces = batch.flatMap(id => nm.get(id)!.produces);
      const batchConsumes = batch.flatMap(id => nm.get(id)!.consumes.map(consumeArtifact));
      const doneSet = new Set([...done, ...batchDone]);

      // Pre-gate: plan nodes in future batches workable before deps close.
      // A plan node is pre-gate workable iff:
      //   1. mode === 'plan'
      //   2. Not already done or in current batch
      //   3. None of its direct deps that are also plan nodes are uncompleted
      //      (execute deps don't matter — code doesn't affect research direction)
      const preGate: string[] = [];
      for (const id of remainingBatches) {
        const node = nm.get(id)!;
        if (node.mode !== 'plan') continue;
        if (retired?.has(id)) continue;
        // Check plan-dep filter: all plan-mode deps must be done
        const planDepsBlocking = node.deps.some(depId => {
          const dep = nm.get(depId as string);
          return dep?.mode === 'plan' && !doneSet.has(depId as string);
        });
        if (!planDepsBlocking) preGate.push(id);
      }

      // Detect loop signals in current batch
      const loopNode = batch.map(id => nm.get(id)!).find(n => n.loopTarget);
      const loop = loopNode ? { target: loopNode.loopTarget!, ...(loopNode.convergenceCheck ? { convergenceCheck: loopNode.convergenceCheck } : {}) } : undefined;

      // Plan receipts: plan-mode nodes in current batch (FR-ORIENT-001)
      const planReceiptsArr: PlanReceipt[] = batch
        .map(id => nm.get(id)!)
        .filter(n => n.mode === 'plan')
        .map(n => ({
          nodeId: n.id,
          mode: 'plan' as const,
          preGateActive: preGate.includes(n.id),
          expandedChildren: expansionChildren.get(n.id) ?? [],
        }));

      return {
        position: batch,
        level: batches.indexOf(batch),
        batchRemaining: batchIncomplete,
        batchComplete: false,
        preGate,
        done: [...done, ...batchDone],
        produces: batchProduces,
        consumes: batchConsumes,
        remaining: remainingBatches,
        ...(loop ? { loop } : {}),
        ...(planReceiptsArr.length > 0 ? { planReceipts: planReceiptsArr } : {}),
      };
    }

    // All nodes in this batch are done
    done.push(...batch);
  }

  // All batches complete — DAG is done.
  const termNode = nm.get(g.term);
  const termLoop = termNode?.loopTarget
    ? { target: termNode.loopTarget, ...(termNode.convergenceCheck ? { convergenceCheck: termNode.convergenceCheck } : {}) }
    : undefined;

  return {
    position: [],
    level: batches.length,
    batchRemaining: [],
    batchComplete: true,
    preGate: [],
    done,
    produces: [],
    consumes: [],
    remaining: [],
    ...(termLoop ? { loop: termLoop } : {}),
  };
}

// --- advanceBatch: move from current batch to next ---
// Validates that current batch is complete (all receipts present),
// then returns orientation for the next batch.

export function advanceBatch<T extends string>(
  g: Graph<T>,
  completion: CompletionStore,
  retired?: ReadonlySet<string>,
): Orientation {
  const current = orient(g, completion, retired);

  if (!current.batchComplete) {
    throw new Error(
      `Cannot advance: batch not complete. Remaining nodes: ${current.batchRemaining.join(', ')}`
    );
  }

  return orient(g, completion, retired);
}

// --- readyNodes: eager dispatch beyond current batch ---
// Returns nodes from future batches whose deps are fully satisfied,
// even though their batch hasn't opened yet. Read-only query —
// does not advance or mutate batch state.

export interface ReadyNode {
  id: string;
  level: number;              // batch index this node belongs to
  produces: readonly string[];
  consumes: string[];
  mode: 'execute' | 'plan';
}

export function readyNodes<T extends string>(
  g: Graph<T>,
  completion: CompletionStore,
  retired?: ReadonlySet<string>,
): ReadyNode[] {
  const batches = parallelOrder(g);
  const nodes = flat(g);
  const nm = new Map(nodes.map(n => [n.id, n]));

  // Build expansion index for plan nodes
  const expansionChildren = new Map<string, string[]>();
  for (const n of nodes) {
    if (n.expandedFrom) {
      const children = expansionChildren.get(n.expandedFrom) ?? [];
      children.push(n.id);
      expansionChildren.set(n.expandedFrom, children);
    }
  }

  // Compute done set — receipt-only, same as orient()
  const done = new Set<string>();
  for (const n of nodes) {
    if (retired?.has(n.id)) { done.add(n.id); continue; }
    if (n.mode === 'plan') {
      if (completion.hasPassing(n.id)) { done.add(n.id); continue; }
      if ((expansionChildren.get(n.id) ?? []).length > 0) done.add(n.id);
    } else if (completion.hasPassing(n.id)) {
      done.add(n.id);
    }
  }

  // Find current batch level (first incomplete)
  let currentLevel = -1;
  for (let i = 0; i < batches.length; i++) {
    if (batches[i].some(id => !done.has(id))) {
      currentLevel = i;
      break;
    }
  }

  // All done — nothing to dispatch
  if (currentLevel === -1) return [];

  // Scan future batches for nodes whose deps are all in done set.
  // allDepsDone subsumes the plan-dep filter (plan deps are deps),
  // so plan nodes with unfinished plan-mode deps are excluded automatically.
  const ready: ReadyNode[] = [];
  for (let level = currentLevel + 1; level < batches.length; level++) {
    for (const id of batches[level]) {
      if (done.has(id)) continue;
      if (retired?.has(id)) continue;

      const node = nm.get(id)!;
      if (!node.deps.every(d => done.has(d as string))) continue;

      ready.push({
        id,
        level,
        produces: node.produces,
        consumes: node.consumes.map(c => consumeArtifact(c as ConsumeSpec)),
        mode: (node.mode ?? 'execute') as 'execute' | 'plan',
      });
    }
  }

  return ready;
}

// --- nextBatch: lookahead for orchestrator pre-warming ---
// Returns the batch after the current one, with pre-checked conflicts.
// Always returns the next batch regardless of current batch completeness —
// the orchestrator decides whether to act.

export interface NextBatch {
  nodes: string[];
  level: number;
  produces: string[];     // union of all next-batch produces
  conflicts: string[];    // files with batchConflicts in the next batch
}

export function nextBatch<T extends string>(
  g: Graph<T>,
  completion: CompletionStore,
  retired?: ReadonlySet<string>,
): NextBatch | null {
  const batches = parallelOrder(g);
  const current = orient(g, completion, retired);
  const nextLevel = current.level + 1;

  if (nextLevel >= batches.length) return null;

  const batch = batches[nextLevel];
  const nodes = flat(g);
  const nm = new Map(nodes.map(n => [n.id, n]));
  const produces = batch.flatMap(id => [...nm.get(id)!.produces]);

  // Filter batchConflicts to next batch level only
  const allConflicts = batchConflicts(g);
  const conflicts = allConflicts
    .filter(c => c.level === nextLevel)
    .map(c => c.file);

  return { nodes: batch, level: nextLevel, produces, conflicts };
}

// --- criticalPath: longest path from init to term ---
// Standard DAG longest-path via reverse topo sort. O(V+E).
// Weight = 1 per node (node count). Returns the path as ordered node IDs.

export function criticalPath<T extends string>(g: Graph<T>): string[] {
  const nodes = flat(g);
  const adj = fwd(nodes);
  const order_ = order(g);

  // dist[node] = longest path from init to node (inclusive)
  const dist = new Map<string, number>();
  const pred = new Map<string, string | null>();

  for (const id of order_) {
    dist.set(id, 1);
    pred.set(id, null);
  }

  // Forward pass in topo order — O(V+E) via adjacency list
  for (const id of order_) {
    const d = dist.get(id)!;
    for (const succ of adj.get(id) ?? []) {
      const candidate = d + 1;
      if (candidate > dist.get(succ)!) {
        dist.set(succ, candidate);
        pred.set(succ, id);
      }
    }
  }

  // Trace back from term
  const path: string[] = [];
  let cur: string | null = g.term;
  while (cur !== null) {
    path.unshift(cur);
    cur = pred.get(cur) ?? null;
  }

  return path;
}

// --- Merge/branch witness types (FR-MERGE-001, FR-BRANCH-001) ---

/** Collision detected when two graphs share a node ID during merge. */
export interface MergeConflict {
  type: 'node-id-collision';
  nodeId: string;
  left: unknown;   // NodeSpec from g1
  right: unknown;  // NodeSpec from g2
}

/** Records which nodes were included in a branch and why (reachable from fromNode). */
export interface BranchWitness {
  fromNode: string;
  includedNodes: string[];
  reachabilityReason: Record<string, string[]>; // nodeId → BFS path from fromNode
}

/**
 * Detect node ID collisions before merging two graphs.
 * Returns conflicts array — non-empty means merge would fail.
 * Use this for pre-flight collision detection without throwing.
 */
export function mergeCheck<T1 extends string, T2 extends string>(
  g1: Graph<T1>,
  g2: Graph<T2>,
): MergeConflict[] {
  const ids1 = new Set(Object.keys(g1.nodes));
  const conflicts: MergeConflict[] = [];
  for (const [id, node] of Object.entries(g2.nodes)) {
    if (ids1.has(id)) {
      conflicts.push({
        type: 'node-id-collision',
        nodeId: id,
        left: (g1.nodes as Record<string, unknown>)[id],
        right: node,
      });
    }
  }
  return conflicts;
}

/**
 * Branch a subgraph from fromNode to g.term, returning graph + reachability witness.
 * Backward-compatible companion to branch() — use when witness evidence is needed.
 */
export function branchWithWitness<T extends string>(
  g: Graph<T>,
  fromNode: T,
): { graph: Graph<T>; witness: BranchWitness } {
  if (!g || !fromNode) throw new Error('Graph and fromNode required for branchWithWitness');
  if (!(fromNode in g.nodes)) throw new Error(`fromNode "${fromNode}" not in graph`);

  const nodes = flat(g);
  // BFS from fromNode, recording path to each node
  const reachabilityReason: Record<string, string[]> = {};
  const q: Array<{ id: string; path: string[] }> = [{ id: fromNode, path: [fromNode] }];
  const visited = new Set<string>();
  while (q.length) {
    const { id, path } = q.shift()!;
    if (visited.has(id)) continue;
    visited.add(id);
    reachabilityReason[id] = path;
    const successors = nodes.filter(nd => nd.deps.includes(id)).map(nd => nd.id);
    for (const s of successors) {
      if (!visited.has(s)) q.push({ id: s, path: [...path, s] });
    }
  }

  const includedNodes = [...visited].sort((a, b) => a.localeCompare(b));

  const branchedNodes: Record<string, Flat> = {};
  for (const node of nodes) {
    if (visited.has(node.id)) branchedNodes[node.id] = node;
  }

  const branched: Graph<T> = {
    id: `${g.id}:${fromNode}`,
    desc: `Branch of ${g.desc} from ${fromNode}`,
    init: fromNode,
    term: g.term,
    nodes: branchedNodes as any,
  };

  const validated = define(branched);
  const errors = verify(validated);
  if (errors.length) throw new Error(`Branch validation failed: ${errors.join(', ')}`);

  return {
    graph: validated,
    witness: { fromNode, includedNodes, reachabilityReason },
  };
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
  opts?: { intentJudgments?: IntentJudgment[]; exploreResults?: Array<{ script: string; success: boolean; result?: ExploreResult; error?: string }>; validating?: boolean },
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
      const artifact = rule.target ?? rule.path;
      if (!artifact) { evidence = 'artifact-exists rule missing both target and path'; }
      else { passed = exists(artifact); evidence = passed ? `artifact exists: ${artifact}` : `artifact missing: ${artifact}`; }
    } else if (rule.type === 'artifact-schema') {
      // TODO: Implement schema validation
      passed = false;
      evidence = 'schema validation not yet implemented';
    } else if (rule.type === 'function') {
      // Run shell command synchronously; exit 0 = pass, non-zero = fail
      // Guard against recursion (e.g. vitest validate → spawns vitest → validate → ...)
      // Primary: opts.validating (call-stack). Fallback: ROADMAP_VALIDATING env (child process recursion guard).
      const fnValidating = opts?.validating ?? !!process.env.ROADMAP_VALIDATING;
      if (fnValidating) {
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
    } else if (rule.type === 'shell') {
      // Run shell command; check exit code matches expectExitCode (default 0)
      // Primary: opts.validating (call-stack). Fallback: ROADMAP_VALIDATING env (child process recursion guard).
      const shellValidating = opts?.validating ?? !!process.env.ROADMAP_VALIDATING;
      if (shellValidating) {
        passed = true;
        evidence = `skipped (already inside validation): ${rule.command}`;
      } else {
        try {
          const { execSync } = await import('node:child_process');
          const expectedCode = rule.expectExitCode ?? 0;
          execSync(rule.command, { stdio: 'pipe', env: { ...process.env, ROADMAP_VALIDATING: '1' } });
          passed = true;
          evidence = `command passed (exit ${expectedCode}): ${rule.command}`;
        } catch (e: any) {
          const actualCode = e.status ?? -1;
          const expectedCode = rule.expectExitCode ?? 0;
          passed = actualCode === expectedCode;
          const stderr = e.stderr?.toString().trim() || e.message || '';
          const codeInfo = `exit ${actualCode}, expected ${expectedCode}`;
          evidence = passed
            ? `command exit code matches: ${rule.command} — ${codeInfo}`
            : `command failed: ${rule.command} — ${codeInfo} — ${stderr.slice(0, 150)}`;
        }
      }
    } else if (rule.type === 'build-produces') {
      // Run build command, then check all outputs exist
      // Primary: opts.validating (call-stack). Fallback: ROADMAP_VALIDATING env (child process recursion guard).
      const buildValidating = opts?.validating ?? !!process.env.ROADMAP_VALIDATING;
      if (buildValidating) {
        passed = true;
        evidence = `skipped (already inside validation): ${rule.command}`;
      } else {
        try {
          const { execSync } = await import('node:child_process');
          execSync(rule.command, { stdio: 'pipe', env: { ...process.env, ROADMAP_VALIDATING: '1' } });
          const missing = rule.outputs.filter((o: string) => !exists(o));
          passed = missing.length === 0;
          evidence = passed
            ? `build passed, all outputs present: ${rule.outputs.join(', ')}`
            : `build passed but missing outputs: ${missing.join(', ')}`;
        } catch (e: any) {
          passed = false;
          const stderr = e.stderr?.toString().trim() || e.message || '';
          evidence = `build failed: ${rule.command} — ${stderr.slice(0, 200)}`;
        }
      }
    } else if (rule.type === 'launch-check') {
      // Start a process, verify it produces a success signal or exits 0 within timeout
      // Primary: opts.validating (call-stack). Fallback: ROADMAP_VALIDATING env (child process recursion guard).
      const launchValidating = opts?.validating ?? !!process.env.ROADMAP_VALIDATING;
      if (launchValidating) {
        passed = true;
        evidence = `skipped (already inside validation): ${rule.command}`;
      } else {
        const timeout = rule.timeout ?? 10000;
        const successSignal = rule.successSignal;
        try {
          const { spawnSync } = await import('node:child_process');
          const result = spawnSync(rule.command, {
            shell: true,
            timeout,
            stdio: 'pipe',
            env: { ...process.env, ROADMAP_VALIDATING: '1' },
          });
          const stdout = result.stdout?.toString() || '';
          if (successSignal) {
            passed = stdout.includes(successSignal);
            evidence = passed
              ? `process output contained signal: "${successSignal}"`
              : `process output missing signal: "${successSignal}"`;
          } else {
            passed = result.status === 0;
            evidence = passed
              ? `process exited 0 within ${timeout}ms`
              : `process failed or timed out: exit ${result.status}`;
          }
        } catch (e: any) {
          passed = false;
          evidence = `launch failed: ${rule.command} — ${String(e.message).slice(0, 200)}`;
        }
      }
    } else if (rule.type === 'runtime-explore') {
      // CDP-based behavioral observation: launch app, run explore script, map observations
      // Primary: opts.validating (call-stack). Fallback: ROADMAP_VALIDATING env (child process recursion guard).
      const exploreValidating = opts?.validating ?? !!process.env.ROADMAP_VALIDATING;
      if (exploreValidating) {
        passed = true;
        evidence = `skipped (already inside validation): ${rule.script}`;
      } else if (!opts?.exploreResults) {
        // No explore results provided — non-blocking, signal what needs exploration
        passed = true;
        evidence = `unevaluated: run with --explore to execute ${rule.script}`;
        checks.push({ rule, passed, evidence });
        continue;
      } else {
        const result = opts.exploreResults.find(r => r.script === rule.script);
        if (!result) {
          passed = false;
          evidence = `explore script not found in results: ${rule.script}`;
        } else if (!result.success) {
          passed = false;
          evidence = `explore failed: ${result.error ?? 'unknown error'}`;
        } else if (result.result) {
          // Map observations to individual checks
          const { mapObservationsToChecks } = await import('./lib/runtime-explore.ts');
          const obsChecks = mapObservationsToChecks(result.result.observations, rule);
          for (const oc of obsChecks) {
            checks.push(oc);
            if (!oc.passed) allPassed = false;
          }
          continue; // already pushed checks
        } else {
          passed = false;
          evidence = `explore result missing for: ${rule.script}`;
        }
      }
    } else if (rule.type === 'spec-conformance') {
      // Verify spec file exists and referenced story numbers appear in it.
      // Resolves spec path: absolute paths used as-is, relative paths resolved from cwd (= repoRoot in CLI context).
      try {
        const { readFileSync: rfs, existsSync: efs } = await import('node:fs');
        const { resolve: resolvePath } = await import('node:path');
        const specPath = resolvePath(process.cwd(), rule.spec);
        if (!efs(specPath)) {
          passed = false;
          evidence = `spec file not found: ${rule.spec}`;
        } else {
          const specContent = rfs(specPath, 'utf-8');
          const storyRefs = (rule.stories ?? []) as number[];
          const missingStories = storyRefs.filter(
            (s: number) =>
              !specContent.includes(`Story ${s}`) &&
              !specContent.includes(`US${s}`) &&
              !specContent.includes(`story-${s}`),
          );
          passed = missingStories.length === 0;
          evidence = passed
            ? `spec conformance: stories [${storyRefs.join(', ')}] found in ${rule.spec}`
            : `spec missing story refs: [${missingStories.join(', ')}] not found in ${rule.spec}`;
        }
      } catch (e: any) {
        passed = false;
        evidence = `spec-conformance error: ${String(e.message).slice(0, 200)}`;
      }
    } else if (rule.type === 'intent') {
      // Intent constraints require LLM judgment. The calling LLM reads the
      // context files and provides its evaluation via --evaluate '[{...}]'.
      // Without judgments: non-blocking (signals what needs evaluation in output).
      // With judgments: validates confidence >= rule.confidence.
      const judgment = opts?.intentJudgments?.find(j => j.statement === rule.statement);
      if (judgment) {
        passed = judgment.confidence >= rule.confidence;
        evidence = `confidence=${judgment.confidence.toFixed(2)} (threshold=${rule.confidence}) — ${judgment.reasoning.slice(0, 120)}`;
        checks.push({ rule, passed, evidence, judgment, intentStatus: 'evaluated' });
        if (!passed) allPassed = false;
      } else {
        // Unevaluated — non-blocking; output signals what the LLM must judge
        passed = true;
        evidence = `unevaluated`;
        checks.push({ rule, passed, evidence, intentStatus: 'unevaluated' });
      }
      continue;
    }

    checks.push({ rule, passed, evidence });
    if (!passed) allPassed = false;
  }

  // Collect failing intents with expandOnFail for expansion
  const failingIntents: IntentFailure[] = [];
  for (const c of checks) {
    if (c.rule.type !== 'intent' || c.passed || c.intentStatus !== 'evaluated') continue;
    const rule = c.rule as { type: 'intent'; statement: string; confidence: number; context?: string[]; expandOnFail?: boolean };
    if (!rule.expandOnFail) continue;
    failingIntents.push({
      statement: rule.statement,
      achieved: c.judgment!.confidence,
      threshold: rule.confidence,
      reasoning: c.judgment!.reasoning,
      evidence: c.judgment!.evidence ?? [],
      context: rule.context,
    });
  }

  if (failingIntents.length > 0) {
    return {
      nodeId,
      passed: false,
      checks,
      failedReason: `${failingIntents.length} intent(s) failed with expandOnFail — expansion required`,
      expansionStatus: 'expanding',
      failingIntents,
    };
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

