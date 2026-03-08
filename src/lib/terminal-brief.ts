// @module terminal-brief
// @description Aggregates context layers into a TerminalBrief for terminal advance
// @exports TerminalBrief, HandoffSummary, buildTerminalBrief
// @entry roadmap/terminal-brief

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Graph } from '../protocol.ts';
import type { ChainLink, ExecutionReport } from './chain.ts';
import { loadChain, currentIteration, getRootIntent } from './chain.ts';
import { computeReport } from './terminal-audit/computed.ts';
import type { ComputedReport } from './terminal-audit/computed.ts';
import { detectGaps } from './terminal-audit/detected.ts';
import type { DetectedGaps } from './terminal-audit/detected.ts';

export interface TerminalBrief {
  rootIntent: string;
  iteration: number;
  chainHistory: ChainLink[];
  completionEvidence: ComputedReport;
  handoffSummaries: HandoffSummary[];
  detectedGaps: DetectedGaps;
  executionReport?: ExecutionReport;
}

export interface HandoffSummary {
  nodeId: string;
  summary: string;
  keyDecisions: string[];
  gotchas: string[];
  timestamp: string;
}

/**
 * Build a TerminalBrief aggregating context layers.
 * Called during terminal node advance or orient-time enrichment
 * to give agents full context for writing successor specs.
 */
export function buildTerminalBrief(
  dag: Graph<string>,
  repoRoot: string,
  executionReport?: ExecutionReport,
): TerminalBrief {
  // Layer 1: completion evidence (per-node commit status, test results, audit trail)
  const completionEvidence = computeReport(dag, repoRoot);

  // Layer 2: handoff journals
  const handoffSummaries = loadHandoffSummaries(repoRoot);

  // Layer 3: chain history
  const chainHistory = loadChain(repoRoot);
  const iteration = currentIteration(repoRoot);
  let rootIntent: string;
  try {
    rootIntent = getRootIntent(repoRoot);
  } catch {
    // First iteration — use current DAG desc
    rootIntent = dag.desc;
  }

  // Layer 4: gap detection (uncovered consumes, untested produces)
  const detectedGaps = detectGaps(dag);

  return {
    rootIntent,
    iteration,
    chainHistory,
    completionEvidence,
    handoffSummaries,
    detectedGaps,
    executionReport,
  };
}

// --- Helpers ---

function loadHandoffSummaries(repoRoot: string): HandoffSummary[] {
  const handoffDir = join(repoRoot, '.roadmap', '.handoff');
  if (!existsSync(handoffDir)) return [];

  const summaries: HandoffSummary[] = [];
  const files = readdirSync(handoffDir).filter(f => f.endsWith('.json') && !f.includes('-interim-'));

  for (const file of files) {
    try {
      const content = JSON.parse(readFileSync(join(handoffDir, file), 'utf-8'));
      if (content.summary) {
        summaries.push({
          nodeId: file.replace('.json', ''),
          summary: content.summary,
          keyDecisions: content.keyDecisions ?? [],
          gotchas: content.gotchas ?? [],
          timestamp: content.timestamp ?? '',
        });
      }
    } catch {
      // Skip malformed handoff files
    }
  }

  return summaries.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}
