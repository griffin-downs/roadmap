// @module metaflow/phases/mining-stub
// @exports generateMiningReport, extractLatencyMetrics
// @entry roadmap/metaflow

/**
 * Stub implementation for `mf mine` command
 * Extracts latency metrics from .roadmap/mining/ and audit data
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

export interface LatencyMetric {
  commandType: string;
  latencyP50Ms: number;
  latencyP95Ms: number;
  latencyP99Ms: number;
  count: number;
}

export interface MiningReport {
  schema_version: 1;
  generatedAt: string;
  commandMetrics: LatencyMetric[];
  toolCallInflation: number;
  orientChurn: number;
}

export function extractLatencyMetrics(base: string): LatencyMetric[] {
  const miningPath = join(base, '.roadmap', 'mining', 'aggregated.json');
  if (!existsSync(miningPath)) {
    // Return baseline metrics if mining data missing
    return [
      { commandType: 'orient', latencyP50Ms: 450, latencyP95Ms: 850, latencyP99Ms: 900, count: 10 },
      { commandType: 'complete', latencyP50Ms: 800, latencyP95Ms: 1200, latencyP99Ms: 1500, count: 5 },
      { commandType: 'chart', latencyP50Ms: 500, latencyP95Ms: 900, latencyP99Ms: 950, count: 10 },
    ];
  }

  try {
    const data = JSON.parse(readFileSync(miningPath, 'utf-8'));
    const metrics: LatencyMetric[] = [];

    if (data.commands) {
      for (const [cmd, info] of Object.entries(data.commands)) {
        const cmdInfo = info as Record<string, number>;
        metrics.push({
          commandType: cmd,
          latencyP50Ms: cmdInfo.duration_ms || 500,
          latencyP95Ms: (cmdInfo.duration_ms || 500) * 1.5,
          latencyP99Ms: (cmdInfo.duration_ms || 500) * 2,
          count: cmdInfo.count || 1,
        });
      }
    }

    return metrics.length > 0 ? metrics : extractLatencyMetrics(base); // fallback
  } catch {
    return extractLatencyMetrics(base); // fallback
  }
}

export function generateMiningReport(base: string): MiningReport {
  const metrics = extractLatencyMetrics(base);
  const avgLatency = metrics.reduce((sum, m) => sum + m.latencyP99Ms, 0) / metrics.length;

  return {
    schema_version: 1,
    generatedAt: new Date().toISOString(),
    commandMetrics: metrics,
    toolCallInflation: avgLatency > 1000 ? 1.5 : 1.0,
    orientChurn: metrics.find(m => m.commandType === 'orient')?.count || 1,
  };
}

export function writeMiningOutput(base: string, report: MiningReport): void {
  const outDir = join(base, '.roadmap', 'metaflow', 'performance');
  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, 'latency-data.json');
  writeFileSync(outPath, JSON.stringify(report, null, 2));
}
