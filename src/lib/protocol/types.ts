// @module protocol/types
// @exports ValidationRule, IntentJudgment, ValidationCheck, ValidationResult, IntentFailure, ConvergenceLimits, EscalationResult, IntentDiagnosis, ConsumeSpec, consumeArtifact, consumeResolvedBy, NodeSpec, EmitGalleryNodeSpec, graph, TermGate, SpecMeta, Graph, OptimizeResult, LevelEntry, BottleneckEntry, Connection, Gap
// @types All protocol types
// @entry roadmap/protocol

import { CompletionStore } from '../../runtime/completion.ts';
export { CompletionStore } from '../../runtime/completion.ts';

// --- Types ---

export type ValidationRule =
  | { type: 'artifact-exists'; target?: string; path?: string; _propagatedFrom?: string }
  | { type: 'artifact-schema'; target: string; schema: string }
  | { type: 'function'; target: string; fn: string }
  | { type: 'manual-approval'; target: string; reviewer?: string }
  | { type: 'expanded'; minNodes?: number }
  | { type: 'shell'; command: string | string[]; expectExitCode?: number }
  | { type: 'shell'; argv: string[]; expectExitCode?: number }
  | { type: 'build-produces'; command: string; outputs: string[] }
  | { type: 'launch-check'; command: string; timeout?: number; successSignal?: string }
  | { type: 'spec-conformance'; spec: string; stories: number[]; criteria?: number[] }
  | { type: 'intent'; statement: string; confidence: number; evaluator: 'self' | 'council'; context?: string[]; expandOnFail?: boolean; maxExpansionDepth?: number; prompt?: string[] };

// LLM-provided judgment for one intent statement.
// Passed via --evaluate '[{...}]' on the complete command.
export interface IntentJudgment {
  statement: string;   // must match rule.statement exactly
  confidence: number;  // 0.0–1.0
  reasoning: string;   // one paragraph
  evidence?: string[]; // file:line references (optional)
  promptAnswers?: string[]; // responses to rule.prompt[] — required when rule has prompts
}


export interface ValidationCheck {
  rule: ValidationRule;
  passed: boolean;
  evidence?: string;
  judgment?: IntentJudgment;                  // populated when judgment was provided
  intentStatus?: 'evaluated' | 'unevaluated'; // present only for intent rules
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
  informedBy?: 'llm' | 'unevaluated'; // judgment source
}

// Consume entry: plain string (artifact path) or acknowledged pending contract.
// resolvedBy: this artifact is intentionally unresolved until the named node completes.
// verify() suppresses the warning while the resolver node is still incomplete.
export type ConsumeSpec = string | { artifact: string; resolvedBy: string };

export function consumeArtifact(c: ConsumeSpec): string {
  if (typeof c === 'string') return c;
  return c.artifact;
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

// Optimizer types — hallucinate-validate dependency minimization
export interface OptimizeResult {
  removable: Array<{ from: string; to: string }>;
  levelsBefore: number;
  levelsAfter: number;
  maxParallelismBefore: number;
  maxParallelismAfter: number;
  utilizationBefore: number;
  utilizationAfter: number;
  enforcement: { nodesCovered: number; nodesUncovered: number };
}

export interface LevelEntry {
  level: number;
  nodes: string[];
  width: number;
  onCriticalPath: boolean;
}

export interface BottleneckEntry {
  id: string;
  level: number;
  fanIn: number;
  fanOut: number;
}

export type Connection = { forward: string; backward: string; artifact: string };
export type Gap = { between: [string, string]; missing: string[] };
