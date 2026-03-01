// @module metaflow-optimizer
// @exports runOptimizerLoop

import { existsSync, writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import type { FlowExecutionReport } from '../phases/execute-flow.ts';

export interface OptimizerLoopOptions {
  maxIters?: number;
  note?: string;
}

/**
 * Run the optimizer loop for up to maxIters iterations.
 * Each iteration executes a flow with 5 steps: mine, audit, propose, implement, measure.
 * Loop terminates early if targets-achieved.json sentinel is written.
 */
export async function runOptimizerLoop(
  baseDir: string,
  opts: OptimizerLoopOptions = {}
): Promise<{ completed: boolean; iterationsRun: number; report: any }> {
  const maxIters = opts.maxIters || 8;
  const note = opts.note || 'optimizer-loop';

  const sentinel = join(baseDir, '.roadmap/metaflow-optimizer/targets-achieved.json');
  const reports: FlowExecutionReport[] = [];

  console.log(`🔄 Starting optimizer loop (max ${maxIters} iterations)`);

  for (let n = 1; n <= maxIters; n++) {
    // Check for early exit
    if (existsSync(sentinel)) {
      console.log(`✓ Targets achieved at iteration ${n - 1}, exiting loop`);
      break;
    }

    console.log(`\n📊 Iteration ${n}/${maxIters}...`);

    try {
      // Execute the flow for this iteration
      const { executeFlow } = await import('../phases/execute-flow.ts');
      const flowId = `optimizer-iter-${n}`;

      const report = await executeFlow(baseDir, flowId);
      if (!report.passed) {
        const failed = report.steps.find((s) => !s.passed);
        throw new Error(
          `Flow ${flowId} failed at step ${failed?.stepId}: ${failed?.error}`
        );
      }

      console.log(
        `  ✓ Flow completed in ${Math.round(report.totalDuration / 1000)}s`
      );
      reports.push(report);

      // Mark DAG nodes as completed (artifacts now exist)
      const steps = ['mine', 'audit', 'propose', 'implement', 'measure'];
      for (const step of steps) {
        const nodeId = `iter-${n}-${step}`;
        try {
          const cmd = `./bin/roadmap complete ${nodeId} --note "${note}: iteration ${n}"`;
          execSync(cmd, {
            cwd: baseDir,
            stdio: 'pipe',
          });
        } catch (e) {
          console.log(`  (note: node ${nodeId} completion skipped or already done)`);
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`✗ Iteration ${n} failed: ${msg}`);
      throw e;
    }
  }

  // Write optimizer report synthesizing metrics
  const report = writeOptimizerReport(baseDir, reports);

  const completed = existsSync(sentinel);
  return {
    completed,
    iterationsRun: reports.length,
    report,
  };
}

/**
 * Synthesize iteration metrics into a final report.
 */
function writeOptimizerReport(
  baseDir: string,
  reports: FlowExecutionReport[]
): any {
  const metricsDir = join(baseDir, '.roadmap/metaflow-optimizer');
  const timeSeries: any[] = [];

  // Collect metrics from each iteration
  for (let n = 1; n <= 8; n++) {
    const metricsPath = join(metricsDir, `iter-${n}`, 'metrics.json');
    if (existsSync(metricsPath)) {
      try {
        const metrics = JSON.parse(readFileSync(metricsPath, 'utf8'));
        timeSeries.push(metrics);
      } catch {
        /* skip if not readable */
      }
    }
  }

  // Compute aggregates
  const report = {
    timestamp: new Date().toISOString(),
    iterationsCompleted: timeSeries.length,
    flowExecutionReports: reports.length,
    timeSeries,
    summary: {
      avgCacheHitRate:
        timeSeries.length > 0
          ? timeSeries.reduce((sum, m) => sum + (m.cacheHitRate || 0), 0) /
            timeSeries.length
          : 0,
      totalCommandsAnalyzed: timeSeries.reduce(
        (sum, m) => sum + (m.commandsAnalyzed || 0),
        0
      ),
      totalFailureModesDetected: timeSeries.reduce(
        (sum, m) => sum + (m.failureModesDetected || 0),
        0
      ),
      avgCoherenceScore:
        timeSeries.length > 0
          ? timeSeries.reduce((sum, m) => sum + (m.coherenceScore || 0), 0) /
            timeSeries.length
          : 0,
      avgRecoverySuccessRate:
        timeSeries.length > 0
          ? timeSeries.reduce((sum, m) => sum + (m.recoverySuccessRate || 0), 0) /
            timeSeries.length
          : 0,
      targetsAchieved: existsSync(
        join(baseDir, '.roadmap/metaflow-optimizer/targets-achieved.json')
      ),
    },
  };

  // Write report
  mkdirSync(metricsDir, { recursive: true });
  const reportPath = join(metricsDir, 'optimizer-report.json');
  writeFileSync(reportPath, JSON.stringify(report, null, 2));

  console.log(`\n📋 Report written to ${reportPath}`);
  return report;
}
