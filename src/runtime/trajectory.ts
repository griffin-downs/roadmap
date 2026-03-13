// @module runtime/trajectory
// @description Pure trajectory assessment — findings + chain → TrajectoryAssessment. No IO.
// @exports assessTrajectory, TrajectoryAssessment
// @entry roadmap

import type { ExecutionFindings } from './execution-miner.ts';
import type { ChainLink } from '../lib/chain.ts';

// --- Types ---

export interface IterationSummary {
  iteration: number;
  dagId: string;
  nodesExecuted: number;
  findingsCount: number;
  resolvedFromPrevious: string[];
  newFindings: string[];
}

export interface TrajectoryAssessment {
  trend: 'converging' | 'stable' | 'orbiting' | 'diverging';
  iterationSummaries: IterationSummary[];
  persistentFindings: string[];
  intentDistance: 'decreasing' | 'flat' | 'increasing';
  recommendation: string;
}

// --- Pure helpers ---

function countFindings(findings: ExecutionFindings): number {
  return (
    findings.unaddressedDiscoveries.length +
    findings.scopeDrift.length +
    findings.weakEvidence.length +
    findings.unresolvedBlockers.length +
    findings.velocitySignals.length
  );
}

function currentFindingItems(findings: ExecutionFindings): string[] {
  const items: string[] = [];
  for (const d of findings.unaddressedDiscoveries) items.push(d.item);
  for (const s of findings.scopeDrift) items.push(s.file);
  for (const w of findings.weakEvidence) items.push(`weak-evidence:${w.nodeId}`);
  for (const b of findings.unresolvedBlockers) items.push(b.blocker);
  for (const v of findings.velocitySignals) items.push(v.signal);
  return items;
}

function previousIterationItems(link: ChainLink): string[] {
  const report = link.executionReport;
  if (!report) return [];
  return [...report.observations, ...report.blockers];
}

function overlap(a: string[], b: string[]): string[] {
  const setB = new Set(b.map((s) => s.toLowerCase()));
  return a.filter((item) => {
    const lower = item.toLowerCase();
    for (const bItem of setB) {
      if (lower.includes(bItem) || bItem.includes(lower)) return true;
    }
    return false;
  });
}

function intentKeywords(intent: string): string[] {
  return intent
    .toLowerCase()
    .split(/\W+/)
    .filter((w) => w.length > 3);
}

function countIntentRelated(items: string[], keywords: string[]): number {
  if (keywords.length === 0) return 0;
  return items.filter((item) => {
    const lower = item.toLowerCase();
    return keywords.some((kw) => lower.includes(kw));
  }).length;
}

// --- Trend detection ---

type TrendInput = {
  sortedLinks: ChainLink[];
  currentFindingsCount: number;
  persistentFindings: string[];
};

function detectTrend(input: TrendInput): TrajectoryAssessment['trend'] {
  const { sortedLinks, currentFindingsCount, persistentFindings } = input;
  const totalIterations = sortedLinks.length + 1; // includes current

  if (currentFindingsCount === 0 && totalIterations <= 2) return 'stable';

  if (persistentFindings.length > 0 && totalIterations >= 3) return 'orbiting';

  // Check if findings are decreasing over iterations
  const counts: number[] = sortedLinks
    .map((link) => {
      const report = link.executionReport;
      if (!report) return 0;
      return report.observations.length + report.blockers.length;
    });
  counts.push(currentFindingsCount);

  if (counts.length >= 2) {
    // Count consecutive windows where new > resolved
    let divergingWindows = 0;
    for (let i = 1; i < counts.length; i++) {
      if (counts[i] > counts[i - 1]) divergingWindows++;
      else divergingWindows = 0;
      if (divergingWindows >= 2) return 'diverging';
    }

    const lastCount = counts[counts.length - 1];
    const prevCount = counts[counts.length - 2];
    if (lastCount < prevCount) return 'converging';
  }

  return 'stable';
}

// --- Main export ---

/**
 * Assess trajectory from current findings, chain history, root intent, and current DAG id.
 * Pure function: no IO.
 */
export function assessTrajectory(
  findings: ExecutionFindings,
  chainLinks: ChainLink[],
  rootIntent: string,
  currentDagId: string,
): TrajectoryAssessment {
  const sortedLinks = [...chainLinks].sort((a, b) => a.iteration - b.iteration);
  const currentItems = currentFindingItems(findings);
  const currentFindingsCount = countFindings(findings);

  // Build iterationSummaries from chain history
  const iterationSummaries: IterationSummary[] = [];

  let prevItems: string[] = [];
  for (const link of sortedLinks) {
    const report = link.executionReport;
    const linkItems = previousIterationItems(link);
    const resolvedFromPrevious = prevItems.filter((p) => !linkItems.includes(p));
    const newFindings = linkItems.filter((l) => !prevItems.includes(l));

    iterationSummaries.push({
      iteration: link.iteration,
      dagId: link.dagId,
      nodesExecuted: report?.nodesExecuted ?? 0,
      findingsCount: linkItems.length,
      resolvedFromPrevious,
      newFindings,
    });

    prevItems = linkItems;
  }

  // Current iteration summary
  const currentIteration = sortedLinks.length > 0
    ? sortedLinks[sortedLinks.length - 1].iteration + 1
    : 0;

  const resolvedFromPrevious = prevItems.filter((p) => !currentItems.includes(p));
  const newFindings = currentItems.filter((c) => !prevItems.includes(c));

  iterationSummaries.push({
    iteration: currentIteration,
    dagId: currentDagId,
    nodesExecuted: 0, // current DAG not yet complete
    findingsCount: currentFindingsCount,
    resolvedFromPrevious,
    newFindings,
  });

  // Persistent findings: appear in current AND previous iteration
  const persistentFindings = sortedLinks.length > 0
    ? overlap(currentItems, prevItems)
    : [];

  const trend = detectTrend({ sortedLinks, currentFindingsCount, persistentFindings });

  // Intent distance
  const keywords = intentKeywords(rootIntent);
  const currentIntentRelated = countIntentRelated(currentItems, keywords);
  const prevIntentRelated = countIntentRelated(prevItems, keywords);

  let intentDistance: TrajectoryAssessment['intentDistance'];
  if (currentIntentRelated < prevIntentRelated) {
    intentDistance = 'decreasing';
  } else if (currentIntentRelated > prevIntentRelated) {
    intentDistance = 'increasing';
  } else {
    intentDistance = 'flat';
  }

  const recommendation = buildRecommendation(trend, persistentFindings, currentFindingsCount);

  return {
    trend,
    iterationSummaries,
    persistentFindings,
    intentDistance,
    recommendation,
  };
}

function buildRecommendation(
  trend: TrajectoryAssessment['trend'],
  persistentFindings: string[],
  findingsCount: number,
): string {
  switch (trend) {
    case 'stable':
      return findingsCount === 0
        ? 'Execution is clean. No findings to address.'
        : 'Findings present but stable. Address before next iteration.';
    case 'converging':
      return 'Progress is converging. Continue current approach — findings are resolving.';
    case 'orbiting':
      return `${persistentFindings.length} finding(s) persist across iterations. Explicitly scope them into the next DAG or accept them as known constraints.`;
    case 'diverging':
      return 'New findings are outpacing resolutions. Stop and redesign the approach before continuing.';
  }
}
