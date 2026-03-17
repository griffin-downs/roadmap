// @module runtime/successor
// @description Pure successor proposal — assessment + findings → SuccessorProposal. No IO.
// @exports proposeSuccessor, SuccessorProposal
// @entry roadmap

import type { TrajectoryAssessment } from './trajectory.ts';
import type { ExecutionFindings } from './execution-miner.ts';
import type { Graph } from '../lib/protocol/types.ts';

// --- Types ---

export interface SuccessorProposal {
  action: 'continue' | 'converged' | 'orbit-break';
  rationale: string;
  suggestedSkill: { skill: string; reason: string };
  specDraft?: {
    dagId: string;
    dagDesc: string;
    nodes: {
      id: string;
      desc: string;
      produces: string[];
      consumes: string[];
      mode: 'execute' | 'plan';
    }[];
  };
  orbitDiagnosis?: string;
}

// --- Pure helpers ---

function countAllFindings(findings: ExecutionFindings): number {
  return (
    findings.unaddressedDiscoveries.length +
    findings.scopeDrift.length +
    findings.weakEvidence.length +
    findings.unresolvedBlockers.length +
    findings.velocitySignals.length
  );
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

type DraftNode = {
  id: string;
  desc: string;
  produces: string[];
  consumes: string[];
  mode: 'execute' | 'plan';
};

function discoveryNodes(findings: ExecutionFindings): DraftNode[] {
  // Group by source nodeId to avoid one-node-per-discovery explosion
  const bySource = new Map<string, string[]>();
  for (const d of findings.unaddressedDiscoveries) {
    const bucket = bySource.get(d.nodeId) ?? [];
    bucket.push(d.item);
    bySource.set(d.nodeId, bucket);
  }

  const nodes: DraftNode[] = [];
  for (const [sourceNodeId, items] of bySource) {
    const id = `address-${slugify(sourceNodeId)}`;
    const desc = items.length === 1
      ? `Address unresolved discovery from ${sourceNodeId}: ${items[0]}`
      : `Address ${items.length} unresolved discoveries from ${sourceNodeId}`;
    nodes.push({
      id,
      desc,
      produces: [`docs/${id}.md`],
      consumes: [],
      mode: 'execute',
    });
  }
  return nodes;
}

function weakEvidenceNodes(findings: ExecutionFindings): DraftNode[] {
  return findings.weakEvidence.map((w) => ({
    id: `harden-${slugify(w.nodeId)}`,
    desc: `Add behavioral tests for ${w.nodeId} — current validators are grep-only`,
    produces: [`tests/${slugify(w.nodeId)}.test.ts`],
    consumes: [],
    mode: 'execute' as const,
  }));
}

function blockerNodes(findings: ExecutionFindings): DraftNode[] {
  // Group by nodeId
  const byNode = new Map<string, string[]>();
  for (const b of findings.unresolvedBlockers) {
    const bucket = byNode.get(b.nodeId) ?? [];
    bucket.push(b.blocker);
    byNode.set(b.nodeId, bucket);
  }

  const nodes: DraftNode[] = [];
  for (const [nodeId, blockers] of byNode) {
    const id = `unblock-${slugify(nodeId)}`;
    const desc = blockers.length === 1
      ? `Resolve blocker in ${nodeId}: ${blockers[0]}`
      : `Resolve ${blockers.length} blockers in ${nodeId}`;
    nodes.push({
      id,
      desc,
      produces: [`docs/${id}.md`],
      consumes: [],
      mode: 'execute',
    });
  }
  return nodes;
}

function dedupeById(nodes: DraftNode[]): DraftNode[] {
  const seen = new Set<string>();
  const out: DraftNode[] = [];
  for (const n of nodes) {
    if (!seen.has(n.id)) {
      seen.add(n.id);
      out.push(n);
    }
  }
  return out;
}

// --- Main export ---

/**
 * Propose what should happen after the current DAG completes.
 * Pure function: no IO.
 */
export function proposeSuccessor(
  assessment: TrajectoryAssessment,
  findings: ExecutionFindings,
  rootIntent: string,
  dag: Graph<string>,
): SuccessorProposal {
  const totalFindings = countAllFindings(findings);
  const { trend } = assessment;

  // Converged: nothing left and not stuck in a loop
  if (totalFindings === 0 && trend !== 'orbiting' && trend !== 'diverging') {
    return {
      action: 'converged',
      rationale: 'No findings remain and trajectory is clean. The root intent appears satisfied.',
      suggestedSkill: { skill: '/roadmap-endcontext', reason: 'Work converged. Persist learnings and close session.' },
    };
  }

  // Orbit-break: persistent loop or diverging complexity
  if (trend === 'orbiting' || trend === 'diverging') {
    const persistentList = assessment.persistentFindings.length > 0
      ? ` Persistent findings: ${assessment.persistentFindings.slice(0, 5).join('; ')}${assessment.persistentFindings.length > 5 ? '…' : ''}.`
      : '';
    return {
      action: 'orbit-break',
      rationale: `Trend is '${trend}'. Continuing would repeat prior work without resolution.`,
      suggestedSkill: { skill: '/roadmap-review', reason: 'Orbit detected. Review with human before proceeding.' },
      orbitDiagnosis:
        `The DAG is ${trend}.${persistentList} ` +
        `${totalFindings} finding(s) remain unresolved. ` +
        assessment.recommendation,
    };
  }

  // Continue: build successor DAG from findings
  const nextIteration = assessment.iterationSummaries.length + 1;
  const dagId = `${dag.id}-i${nextIteration}`;

  const allNodes = dedupeById([
    ...discoveryNodes(findings),
    ...weakEvidenceNodes(findings),
    ...blockerNodes(findings),
  ]);

  return {
    action: 'continue',
    rationale:
      `${totalFindings} finding(s) remain (trend: ${trend}). ` +
      `Successor DAG '${dagId}' drafted with ${allNodes.length} node(s).`,
    suggestedSkill: { skill: '/roadmap-spec', reason: 'Findings remain. Use /roadmap-spec to design the successor — do not write spec.json directly.' },
    specDraft: {
      dagId,
      dagDesc: rootIntent,
      nodes: allNodes,
    },
  };
}
