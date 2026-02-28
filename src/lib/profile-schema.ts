// @module profile-schema
// @exports EfficiencyWarning, NodeProfile, ProfileReport, ProfileConfig, DEFAULT_PROFILE_CONFIG, PROFILE_REPORT_PATH, isProfileReport, isNodeProfile, computeParallelismUtilization
// @types EfficiencyWarning, NodeProfile, ProfileReport, ProfileConfig
// @entry roadmap

/** Flags a node whose execution metrics exceed configured thresholds. */
export interface EfficiencyWarning {
  nodeId: string;
  reason: string;
  commandCount: number;
  threshold: number;
}

/** Per-node execution profile captured across one or more sessions. */
export interface NodeProfile {
  nodeId: string;
  commandCount: number;
  validatorRuns: number;
  avgLatencyMs: number;
  bypassCount: number;
  retryCount: number;
}

/** Aggregate profiling report for a DAG execution. */
export interface ProfileReport {
  reportId: string;
  generatedAt: string;
  sessionIds: string[];
  nodeProfiles: Record<string, NodeProfile>;
  batchParallelismUtilization: number;
  efficiencyWarnings: EfficiencyWarning[];
  totalCommands: number;
  totalLatencyMs: number;
}

/** Thresholds that trigger efficiency warnings. */
export interface ProfileConfig {
  commandCountThreshold: number;
  latencyThresholdMs: number;
  parallelismThreshold: number;
}

export const DEFAULT_PROFILE_CONFIG: ProfileConfig = {
  commandCountThreshold: 20,
  latencyThresholdMs: 30000,
  parallelismThreshold: 0.5,
};

export const PROFILE_REPORT_PATH = 'profile-report.json' as const;

/** Runtime type guard for ProfileReport. */
export function isProfileReport(x: unknown): x is ProfileReport {
  if (typeof x !== 'object' || x === null) return false;
  const r = x as Record<string, unknown>;
  return (
    typeof r.reportId === 'string' &&
    typeof r.generatedAt === 'string' &&
    Array.isArray(r.sessionIds) &&
    typeof r.nodeProfiles === 'object' && r.nodeProfiles !== null &&
    typeof r.batchParallelismUtilization === 'number' &&
    Array.isArray(r.efficiencyWarnings) &&
    typeof r.totalCommands === 'number' &&
    typeof r.totalLatencyMs === 'number'
  );
}

/** Runtime type guard for NodeProfile. */
export function isNodeProfile(x: unknown): x is NodeProfile {
  if (typeof x !== 'object' || x === null) return false;
  const n = x as Record<string, unknown>;
  return (
    typeof n.nodeId === 'string' &&
    typeof n.commandCount === 'number' &&
    typeof n.validatorRuns === 'number' &&
    typeof n.avgLatencyMs === 'number' &&
    typeof n.bypassCount === 'number' &&
    typeof n.retryCount === 'number'
  );
}

/** Avg batch fill ratio: mean(batchSize) / max(batchSize). Returns 0 if empty. */
export function computeParallelismUtilization(batchSizes: number[]): number {
  if (batchSizes.length === 0) return 0;
  const max = Math.max(...batchSizes);
  if (max === 0) return 0;
  const mean = batchSizes.reduce((a, b) => a + b, 0) / batchSizes.length;
  return mean / max;
}
