// @module brief
// @exports getBrief, loadHandoffJournal
// @types Brief, FinalHandoff, InterimHandoff
// @entry roadmap/agent

import type { Graph } from './protocol.ts';

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
  /** Current position in roadmap */
  position: string;
  /** Files to create (≤5) */
  produces: string[];
  /** Files available from predecessors (≤5) */
  consumes: string[];
  /** What to build: 1–2 sentences (≤150 chars) */
  description: string;
  /** How to build it: pattern/approach (≤150 chars) */
  pattern: string;
  /** Previous node's final handoff (if exists) */
  handoff?: FinalHandoff;
  /** Work journal: timeline from start→completion */
  handoffJournal: (InterimHandoff | FinalHandoff)[];
  /** Remaining nodes in roadmap */
  remaining: number;
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
  const node = dag.nodes[position as keyof typeof dag.nodes];
  if (!node) throw new Error(`Invalid position: ${position}`);

  // Count remaining nodes (reachable from current position to term)
  const remaining = countRemaining(dag, position);

  // Load previous node's handoff if exists
  const { readFile } = await import('node:fs/promises');
  const { join } = await import('node:path');

  let prevHandoff: FinalHandoff | undefined;
  let journal: (InterimHandoff | FinalHandoff)[] = [];

  // Find predecessor in DAG (node that outputs what current node consumes)
  const deps = Object.values(dag.nodes).filter((n) =>
    node.consumes.some((c) =>
      n.produces.includes(c),
    ),
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
      // No handoff yet (first node, or predecessor not completed)
    }
  }

  return {
    position,
    produces: node.produces.slice(0, 5),
    consumes: node.consumes.slice(0, 5),
    description: node.desc.slice(0, 150),
    pattern: inferPattern(node.id),
    handoff: prevHandoff,
    handoffJournal: journal,
    remaining,
  };
}

function countRemaining(dag: Graph<string>, position: string): number {
  // Simple count: nodes reachable from position to term
  const visited = new Set<string>();
  const queue = [position];
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (visited.has(current)) continue;
    visited.add(current);

    const node = dag.nodes[current as keyof typeof dag.nodes];
    if (!node) continue;

    for (const dep of node.deps) {
      if (!visited.has(dep)) queue.push(dep);
    }
  }

  return visited.size - 1; // Don't count current node
}

function inferPattern(nodeId: string): string {
  // Heuristic: guess pattern from node ID
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
