// @module metaflow-optimizer
// @exports checkTargets, readTargets, writeTargets
// @types OptimizationTarget, TargetGap, Metrics

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export interface OptimizationTarget {
  name: string;
  value: number;
  unit: string;
  operator: 'lt' | 'gt';
}

export interface TargetGap {
  name: string;
  target: number;
  current: number;
  gap: number;
  unit: string;
}

export interface MetricsSnapshot {
  timestamp: string;
  iterN: number;
  tokensPerCommand: number;
  latencyP95: number;
  latencyP50: number;
  latencyP50ReducedFrom?: number;
  cacheHitRate: number;
  commandsAnalyzed: number;
  failureModesDetected: number;
  coherenceScore: number;
  recoverySuccessRate: number;
  performanceRegressions: number;
}

const TARGETS: OptimizationTarget[] = [
  { name: 'tokens_per_command', value: 1200, unit: 'tokens', operator: 'lt' },
  { name: 'latency_p95', value: 800, unit: 'ms', operator: 'lt' },
  { name: 'cache_hit_rate', value: 0.75, unit: 'fraction', operator: 'gt' },
  { name: 'commands_analyzed', value: 1200, unit: 'count', operator: 'gt' },
  { name: 'failure_modes_detected', value: 50, unit: 'count', operator: 'gt' },
  { name: 'coherence_score', value: 0.95, unit: 'fraction', operator: 'gt' },
  { name: 'recovery_success_rate', value: 0.95, unit: 'fraction', operator: 'gt' },
  { name: 'latency_p50_reduction', value: 0.4, unit: 'fraction', operator: 'gt' },
  { name: 'performance_regressions', value: 0, unit: 'count', operator: 'lt' },
];

export function checkTargets(metrics: MetricsSnapshot): { met: boolean; gaps: TargetGap[] } {
  const gaps: TargetGap[] = [];

  // tokens/command
  if (metrics.tokensPerCommand >= TARGETS[0].value) {
    gaps.push({
      name: 'tokens_per_command',
      target: TARGETS[0].value,
      current: metrics.tokensPerCommand,
      gap: metrics.tokensPerCommand - TARGETS[0].value,
      unit: 'tokens',
    });
  }

  // latency p95
  if (metrics.latencyP95 >= TARGETS[1].value) {
    gaps.push({
      name: 'latency_p95',
      target: TARGETS[1].value,
      current: metrics.latencyP95,
      gap: metrics.latencyP95 - TARGETS[1].value,
      unit: 'ms',
    });
  }

  // cache hit rate
  if (metrics.cacheHitRate < TARGETS[2].value) {
    gaps.push({
      name: 'cache_hit_rate',
      target: TARGETS[2].value,
      current: metrics.cacheHitRate,
      gap: TARGETS[2].value - metrics.cacheHitRate,
      unit: 'fraction',
    });
  }

  // commands analyzed
  if (metrics.commandsAnalyzed < TARGETS[3].value) {
    gaps.push({
      name: 'commands_analyzed',
      target: TARGETS[3].value,
      current: metrics.commandsAnalyzed,
      gap: TARGETS[3].value - metrics.commandsAnalyzed,
      unit: 'count',
    });
  }

  // failure modes
  if (metrics.failureModesDetected < TARGETS[4].value) {
    gaps.push({
      name: 'failure_modes_detected',
      target: TARGETS[4].value,
      current: metrics.failureModesDetected,
      gap: TARGETS[4].value - metrics.failureModesDetected,
      unit: 'count',
    });
  }

  // coherence score
  if (metrics.coherenceScore < TARGETS[5].value) {
    gaps.push({
      name: 'coherence_score',
      target: TARGETS[5].value,
      current: metrics.coherenceScore,
      gap: TARGETS[5].value - metrics.coherenceScore,
      unit: 'fraction',
    });
  }

  // recovery success rate
  if (metrics.recoverySuccessRate < TARGETS[6].value) {
    gaps.push({
      name: 'recovery_success_rate',
      target: TARGETS[6].value,
      current: metrics.recoverySuccessRate,
      gap: TARGETS[6].value - metrics.recoverySuccessRate,
      unit: 'fraction',
    });
  }

  // latency p50 reduction
  if (metrics.latencyP50ReducedFrom) {
    const reductionFraction = (metrics.latencyP50ReducedFrom - metrics.latencyP50) / metrics.latencyP50ReducedFrom;
    if (reductionFraction < TARGETS[7].value) {
      gaps.push({
        name: 'latency_p50_reduction',
        target: TARGETS[7].value,
        current: reductionFraction,
        gap: TARGETS[7].value - reductionFraction,
        unit: 'fraction',
      });
    }
  }

  // performance regressions
  if (metrics.performanceRegressions > TARGETS[8].value) {
    gaps.push({
      name: 'performance_regressions',
      target: TARGETS[8].value,
      current: metrics.performanceRegressions,
      gap: metrics.performanceRegressions - TARGETS[8].value,
      unit: 'count',
    });
  }

  return { met: gaps.length === 0, gaps };
}

export function readTargets(path: string): OptimizationTarget[] {
  try {
    const content = readFileSync(path, 'utf8');
    const data = JSON.parse(content);
    return data.targets || TARGETS;
  } catch {
    return TARGETS;
  }
}

export function writeTargets(path: string, targets: OptimizationTarget[] = TARGETS): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(
    path,
    JSON.stringify(
      {
        timestamp: new Date().toISOString(),
        targets,
        description: 'Optimization targets for 6-hour mining loop',
      },
      null,
      2
    )
  );
}
