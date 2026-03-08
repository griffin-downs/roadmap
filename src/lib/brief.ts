// @module brief
// @exports getBrief, loadHandoffJournal
// @types Brief, FinalHandoff, InterimHandoff
// @entry roadmap/agent

import type { Graph } from '../protocol.ts';
import { consumeArtifact } from '../protocol.ts';
import { node } from '../core/access.ts';
import { briefSlice, type BriefSlice, type AncestorContext, type SpecContext } from './brief-slice.ts';
import type { FileSummary } from './brief-cache.ts';
import { buildTerminalBrief, type TerminalBrief } from './terminal-brief.ts';

export interface InterimHandoff {
  /** ISO 8601 timestamp when checkpoint was created */
  timestamp: string;
  /** Progress 0.0–1.0 */
  progress: number;
  /** New findings since last interim */
  discovered: string[];
  /** Current stuck points */
  blockers: string[];
  /** File currently being edited */
  currentFile: string;
  /** Estimated remaining minutes */
  estimatedTimeRemaining?: number;
}

export interface FinalHandoff extends InterimHandoff {
  /** 1–2 sentence summary of what was built (≤100 chars) */
  summary: string;
  /** Why this design: 3–5 key decisions */
  keyDecisions: string[];
  /** What tripped us up and how we solved it */
  gotchas: string[];
  /** Entry requirements for next node */
  nextNodeEntry: {
    /** Files actually produced */
    consumes: string[];
    /** Is next node unblocked? */
    ready: boolean;
    /** Issues next agent will encounter */
    blockers?: string[];
  };
}

export interface Brief {
  /** Why this roadmap exists — one-line DAG purpose */
  dagIntent: string;
  /** Current position in roadmap */
  position: string;
  /** Execution mode: 'execute' = produce artifacts, 'plan' = decompose into sub-tasks */
  mode: 'execute' | 'plan';
  /** Files to create (≤5) */
  produces: string[];
  /** Files available from predecessors (≤5) */
  consumes: string[];
  /** What to build — full spec description (no truncation) */
  description: string;
  /** How to build it: pattern/approach */
  pattern: string;
  /** Previous node's final handoff (if exists) */
  handoff?: FinalHandoff;
  /** Work journal: timeline from start→completion */
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

/**
 * Get sealed brief for current position
 * Agents see ONLY what they need: position + what to build + how + prior learnings
 * No DAG introspection, no wandering.
 */
export async function getBrief(
  dag: Graph<string>,
  position: string,
  repoRoot: string,
): Promise<Brief> {
  const spec = node(dag, position);
  if (!spec) throw new Error(`Invalid position: ${position}`);

  // Count remaining nodes (reachable from current position to term)
  const remaining = countRemaining(dag, position);

  // Load previous node's handoff if exists
  const { readFile } = await import('node:fs/promises');
  const { join } = await import('node:path');

  let prevHandoff: FinalHandoff | undefined;
  let journal: (InterimHandoff | FinalHandoff)[] = [];

  // Find predecessor in DAG (node that outputs what current node consumes)
  const deps = Object.values(dag.nodes).filter((n) =>
    spec.consumes.some((c) => {
      return n.produces.includes(consumeArtifact(c));
    }),
  );

  if (deps.length > 0) {
    const pred = deps[0]; // First producer of consumed artifacts
    try {
      const handoffPath = join(repoRoot, '.roadmap', '.handoff', `${pred.id}.json`);
      const content = await readFile(handoffPath, 'utf-8');
      prevHandoff = JSON.parse(content) as FinalHandoff;

      // Load journal (all interims + final)
      journal = await loadHandoffJournal(repoRoot, pred.id);
    } catch {
      // No handoff yet (first node, predecessor not completed, or pre-gate plan node)
    }
  }

  // For plan nodes, include dep status so agents know what's pending
  const pendingDeps = spec.mode === 'plan'
    ? spec.deps.filter((d: string) => {
        const depNode = node(dag, d);
        return depNode != null;
      })
    : [];

  // Compute backward cone slice for enriched context
  let slice: BriefSlice | undefined;
  try {
    slice = briefSlice(position, dag, repoRoot);
  } catch {
    // Slice is best-effort enrichment
  }

  // Terminal enrichment: when at term node, build full terminal context
  let terminalContext: TerminalBrief | undefined;
  if (position === dag.term) {
    terminalContext = buildTerminalBrief(dag, repoRoot);
  }

  return {
    dagIntent: dag.desc,
    position,
    mode: spec.mode ?? 'execute',
    produces: spec.produces.slice(0, 5),
    consumes: spec.consumes.map(c => consumeArtifact(c)).slice(0, 5),
    description: slice?.specContext.description ?? spec.desc,
    pattern: inferPattern(spec.id, spec.mode),
    handoff: prevHandoff,
    handoffJournal: journal,
    remaining,
    ...(pendingDeps.length > 0 ? { pendingDeps } : {}),
    ...(slice?.specContext ? { specContext: slice.specContext } : {}),
    ...(slice?.ancestorContext.immediate.length || slice?.ancestorContext.heritage.length
      ? { codeContext: slice.ancestorContext }
      : {}),
    ...(slice?.topology ? { topology: slice.topology } : {}),
    ...(slice?.producesPreview?.length ? { producesPreview: slice.producesPreview } : {}),
    ...(terminalContext ? { terminalContext } : {}),
  } as Brief;
}

function countRemaining(dag: Graph<string>, position: string): number {
  // Simple count: nodes reachable from position to term
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

export async function loadHandoffJournal(
  repoRoot: string,
  nodeId: string,
): Promise<(InterimHandoff | FinalHandoff)[]> {
  const { readdir, readFile } = await import('node:fs/promises');
  const { join } = await import('node:path');

  const journalDir = join(repoRoot, '.roadmap', '.handoff');
  const files = await readdir(journalDir).catch(() => []);

  const interims = files
    .filter((f) => f.startsWith(`${nodeId}-interim-`))
    .sort(); // Chronological order

  const journal: (InterimHandoff | FinalHandoff)[] = [];

  for (const file of interims) {
    const content = await readFile(join(journalDir, file), 'utf-8');
    journal.push(JSON.parse(content) as InterimHandoff);
  }

  // Add final handoff if exists
  try {
    const finalContent = await readFile(
      join(journalDir, `${nodeId}.json`),
      'utf-8',
    );
    journal.push(JSON.parse(finalContent) as FinalHandoff);
  } catch {
    // No final handoff yet
  }

  return journal;
}
