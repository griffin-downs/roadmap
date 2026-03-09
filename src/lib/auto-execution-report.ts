// @module auto-execution-report
// @description Auto-compute ExecutionReport from available data at terminal advance time
// @exports computeExecutionReport
// @entry roadmap

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ExecutionReport } from './chain.ts';
import { CompletionStore } from '../runtime/completion.ts';
import { computeTrailMetrics, loadTrailEntries } from './trail-metrics.ts';
import { HandoffJournal } from './agent-dispatch/handoff-journal.ts';

/**
 * Auto-compute an ExecutionReport from data already available in .roadmap/:
 *   - nodesExecuted: count of completed node IDs from CompletionStore
 *   - totalDuration: totalWallClockMs from trail metrics
 *   - retriesPerNode: advance entries with detail.passed === false, counted per nodeId
 *   - observations: gotchas from all final handoff summaries
 *   - blockers: blockers from all final handoff summaries
 *   - deltaAssessment: empty string (filled by convergence-assessment node later)
 *
 * All reads are best-effort — missing data sources yield sensible defaults.
 */
export function computeExecutionReport(repoRoot: string): ExecutionReport {
  // 1. nodesExecuted — count completed node IDs
  let nodesExecuted = 0;
  try {
    const store = CompletionStore.loadOrEmpty(repoRoot);
    nodesExecuted = store.allIds().size;
  } catch { /* default 0 */ }

  // 2. totalDuration — from trail metrics
  let totalDuration = 0;
  try {
    const metrics = computeTrailMetrics(repoRoot);
    totalDuration = metrics.totalWallClockMs ?? 0;
  } catch { /* default 0 */ }

  // 3. retriesPerNode — advance entries where detail.passed === false
  const retriesPerNode: Record<string, number> = {};
  try {
    const entries = loadTrailEntries(repoRoot);
    for (const entry of entries) {
      if (entry.cmd !== 'advance') continue;
      const detail = entry.detail as Record<string, unknown> | undefined;
      if (!detail) continue;
      const nodeId = detail.completed as string | undefined;
      if (!nodeId) continue;
      if (detail.passed === false) {
        retriesPerNode[nodeId] = (retriesPerNode[nodeId] ?? 0) + 1;
      }
    }
  } catch { /* default empty */ }

  // 4. observations + 5. blockers — from final handoff summaries
  const observations: string[] = [];
  const blockers: string[] = [];
  try {
    const handoffDir = join(repoRoot, '.roadmap', '.handoff');
    if (existsSync(handoffDir)) {
      const files = readdirSync(handoffDir)
        .filter(f => f.endsWith('.json') && !f.includes('-interim-'));

      for (const file of files) {
        try {
          const content = JSON.parse(readFileSync(join(handoffDir, file), 'utf-8'));

          // gotchas → observations
          if (Array.isArray(content.gotchas)) {
            for (const g of content.gotchas) {
              if (typeof g === 'string' && g.length > 0) {
                observations.push(g);
              }
            }
          }

          // blockers from final handoff
          if (Array.isArray(content.blockers)) {
            for (const b of content.blockers) {
              if (typeof b === 'string' && b.length > 0) {
                blockers.push(b);
              }
            }
          }

          // nextNodeEntry.blockers
          if (content.nextNodeEntry && Array.isArray(content.nextNodeEntry.blockers)) {
            for (const b of content.nextNodeEntry.blockers) {
              if (typeof b === 'string' && b.length > 0) {
                blockers.push(b);
              }
            }
          }
        } catch { /* skip malformed file */ }
      }
    }
  } catch { /* default empty arrays */ }

  // 6. deltaAssessment — empty, filled by convergence-assessment node later
  const deltaAssessment = '';

  return {
    nodesExecuted,
    totalDuration,
    retriesPerNode,
    observations,
    blockers,
    deltaAssessment,
  };
}
