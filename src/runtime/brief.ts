// @module runtime/brief
// @description Pure brief generation — brief(g, position, context) → Brief.
//   All IO reads come through Context (pre-loaded). No filesystem imports.
//   Sync — no dynamic imports, fully synchronous.
// @exports brief, Brief, FinalHandoff, InterimHandoff, TerminalBrief, HandoffSummary, ComputedReport, DetectedGaps
// @types Brief, TerminalBrief, HandoffSummary, ComputedReport, DetectedGaps
// @entry roadmap

import type { Graph } from '../lib/protocol/types.ts';
import { consumeArtifact } from '../lib/protocol/types.ts';
import { node } from '../core/access.ts';
import type { Orientation } from '../core/orient.ts';
import type { Context, HandoffEntry } from './context.ts';
import type { FinalHandoff, InterimHandoff } from '../lib/brief.ts';
import { briefSlice, type BriefSlice, type AncestorContext, type SpecContext } from '../lib/brief-slice.ts';
import type { FileSummary } from '../lib/brief-slice.ts';
import type { ComputedReport, NodeCommitStatus, TestEvidence, AuditTrail } from '../lib/terminal-audit/computed.ts';
import { detectGaps, type DetectedGaps } from '../lib/terminal-audit/detected.ts';
import type { ChainLink, ExecutionReport } from '../lib/chain.ts';
import type { TrailMetrics } from '../lib/trail-metrics.ts';
import type { ConvergenceAssessment } from '../lib/convergence/assessment.ts';

export type { FinalHandoff, InterimHandoff } from '../lib/brief.ts';
export type { ComputedReport } from '../lib/terminal-audit/computed.ts';
export type { DetectedGaps } from '../lib/terminal-audit/detected.ts';

// --- Brief type ---

export interface Brief {
  /** Why this roadmap exists — one-line DAG purpose */
  dagIntent: string;
  /** Current position in roadmap */
  position: string;
  /** Execution mode: 'execute' = produce artifacts, 'plan' = decompose into sub-tasks */
  mode: 'execute' | 'plan';
  /** Files to create */
  produces: string[];
  /** Files available from predecessors */
  consumes: string[];
  /** What to build — full spec description (no truncation) */
  description: string;
  /** How to build it: pattern/approach */
  pattern: string;
  /** Previous node's final handoff (if exists) */
  handoff?: FinalHandoff;
  /** Work journal: timeline from start->completion */
  handoffJournal: (InterimHandoff | FinalHandoff)[];
  /** Remaining nodes in roadmap */
  remaining: number;
  /** Spec context: ambient files and full description */
  specContext?: SpecContext;
  /** Ancestor code context: convention samples from backward cone */
  codeContext?: AncestorContext;
  /** Topology: depth, descendant count, batch siblings */
  topology?: BriefSlice['topology'];
  /** Produces preview: current state of files this node will create/modify */
  producesPreview?: FileSummary[];
  /** Terminal context: enriched when position === dag.term */
  terminalContext?: TerminalBrief;
}

// --- TerminalBrief type ---

export interface HandoffSummary {
  nodeId: string;
  summary: string;
  keyDecisions: string[];
  gotchas: string[];
  timestamp: string;
}

export interface TerminalBrief {
  rootIntent: string;
  iteration: number;
  chainHistory: ChainLink[];
  completionEvidence: ComputedReport;
  handoffSummaries: HandoffSummary[];
  detectedGaps: DetectedGaps;
  executionReport?: ExecutionReport;
  /** Trail-derived scoring: velocity, batch duration, session metrics */
  scoring?: TrailMetrics;
  /** Convergence assessment: trend, persistent gaps, recommendation */
  convergence?: ConvergenceAssessment;
}

// --- Pure brief generation ---

/**
 * Generate a sealed Brief for a node position.
 * Pure function: all IO-derived state comes through Context.
 * Sync — no dynamic imports, no filesystem access.
 */
export function brief(
  g: Graph<string>,
  position: string,
  context: Context,
): Brief {
  const spec = node(g, position);
  if (!spec) throw new Error(`Invalid position: ${position}`);

  const remaining = countRemaining(g, position);

  // Resolve predecessor handoff from Context
  const deps = Object.values(g.nodes).filter((n) =>
    spec.consumes.some((c) => n.produces.includes(consumeArtifact(c))),
  );

  let prevHandoff: FinalHandoff | undefined;
  let journal: (InterimHandoff | FinalHandoff)[] = [];

  if (deps.length > 0) {
    const pred = deps[0];
    const entry = context.handoffs.get(pred.id);
    if (entry) {
      prevHandoff = entry.final ?? undefined;
      // Build journal: interims then final
      journal = [
        ...entry.interims,
        ...(entry.final ? [entry.final] : []),
      ];
    }
  }

  // Backward cone slice (uses repoRoot for cache reads — best-effort enrichment)
  let slice: BriefSlice | undefined;
  try {
    slice = briefSlice(position, g, context.repoRoot);
  } catch {
    // Slice is best-effort enrichment
  }

  // Terminal enrichment: when at term node, build full terminal context
  let terminalContext: TerminalBrief | undefined;
  if (position === g.term) {
    terminalContext = buildTerminalBrief(g, context);
  }

  return {
    dagIntent: g.desc,
    position,
    mode: spec.mode ?? 'execute',
    produces: spec.produces.slice(0, 5),
    consumes: spec.consumes.map(c => consumeArtifact(c)).slice(0, 5),
    description: slice?.specContext.description ?? spec.desc,
    pattern: inferPattern(spec.id, spec.mode),
    handoff: prevHandoff,
    handoffJournal: journal,
    remaining,
    ...(slice?.specContext ? { specContext: slice.specContext } : {}),
    ...(slice?.ancestorContext.immediate.length || slice?.ancestorContext.heritage.length
      ? { codeContext: slice.ancestorContext }
      : {}),
    ...(slice?.topology ? { topology: slice.topology } : {}),
    ...(slice?.producesPreview?.length ? { producesPreview: slice.producesPreview } : {}),
    ...(terminalContext ? { terminalContext } : {}),
  };
}

// --- Terminal brief (pure, takes Context) ---

/**
 * Build a TerminalBrief aggregating context layers.
 * Pure: reads chain/handoffs from Context, not filesystem.
 */
export function buildTerminalBrief(
  dag: Graph<string>,
  context: Context,
  executionReport?: ExecutionReport,
): TerminalBrief {
  // Layer 1: completion evidence from Context.completion
  const completionEvidence = computeReport(dag, context);

  // Layer 2: handoff summaries from Context.handoffs
  const handoffSummaries = extractHandoffSummaries(context);

  // Layer 3: chain history from Context.chain
  const { links: chainHistory, iteration } = context.chain;
  const rootIntent = chainHistory.length === 0
    ? dag.desc
    : dag.desc; // Context doesn't carry archived head descs — use current DAG desc

  // Layer 4: gap detection (structural + scoring-derived via Context)
  const detectedGaps = detectGaps(dag, {
    completion: context.completion,
    scoring: context.scoring,
  });

  return {
    rootIntent,
    iteration,
    chainHistory: [...chainHistory],
    completionEvidence,
    handoffSummaries,
    detectedGaps,
    executionReport,
    scoring: context.scoring,
  };
}

// --- Computed report (pure, takes Context) ---

/**
 * Compute per-node completion evidence from Context.
 * Replaces the IO-based computeReport from terminal-audit/computed.ts.
 */
export function computeReport(dag: Graph<string>, context: Context): ComputedReport {
  const commitStatus: NodeCommitStatus[] = [];
  const testEvidence: TestEvidence[] = [];
  const auditTrail: AuditTrail[] = [];

  for (const n of Object.values(dag.nodes)) {
    const record = context.completion.record(n.id);

    // Commit status — missing artifacts checked via completion store
    // (pure version: cannot stat filesystem, report what completion knows)
    commitStatus.push({
      nodeId: n.id,
      produces: n.produces,
      gitSha: record?.gitSha,
      completedAt: record?.completedAt,
      missingArtifacts: [], // Pure: no filesystem stat; rely on receipt-based completion
    });

    // Test evidence — shell validator results from validationChecks
    const checks = record?.validationChecks ?? [];
    const shellResults = checks.filter(c => c.rule.startsWith('shell'));
    testEvidence.push({
      nodeId: n.id,
      shellResults: shellResults.map(c => ({
        rule: c.rule,
        passed: c.passed,
        evidence: c.evidence,
      })),
    });

    // Audit trail
    const total = checks.length;
    const passed = checks.filter(c => c.passed).length;
    auditTrail.push({
      nodeId: n.id,
      checksTotal: total,
      checksPassed: passed,
      checksFailed: total - passed,
    });
  }

  return { commitStatus, testEvidence, auditTrail };
}

// --- Helpers (pure) ---

function countRemaining(dag: Graph<string>, position: string): number {
  const visited = new Set<string>();
  const queue = [position];
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (visited.has(current)) continue;
    visited.add(current);

    const n = node(dag, current);
    if (!n) continue;

    for (const dep of n.deps) {
      if (!visited.has(dep)) queue.push(dep);
    }
  }

  return visited.size - 1; // Don't count current node
}

function inferPattern(nodeId: string, mode?: 'execute' | 'plan'): string {
  if (mode === 'plan') {
    return 'Decompose into sub-tasks. Decide if human input needed. Output is DAG expansion.';
  }

  const patterns: Record<string, string> = {
    'spec': 'Write design doc: structure, contracts, examples',
    'impl': 'Implement from spec. Keep it minimal, no extra features.',
    'test': 'Write adversarial tests. Prove the spec holds.',
    'integration': 'Wire up components. Verify end-to-end.',
  };

  for (const [key, pattern] of Object.entries(patterns)) {
    if (nodeId.includes(key)) return pattern;
  }

  return 'Build the artifacts listed in produces. Satisfy consumes requirements.';
}

/**
 * Extract HandoffSummary array from Context.handoffs (pure).
 * Replaces loadHandoffSummaries which read from filesystem.
 */
function extractHandoffSummaries(context: Context): HandoffSummary[] {
  const summaries: HandoffSummary[] = [];

  for (const [, entry] of context.handoffs) {
    if (!entry.final) continue;
    const f = entry.final;
    if (!f.summary) continue;

    summaries.push({
      nodeId: entry.nodeId,
      summary: f.summary,
      keyDecisions: f.keyDecisions ?? [],
      gotchas: f.gotchas ?? [],
      timestamp: f.timestamp ?? '',
    });
  }

  return summaries.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}
