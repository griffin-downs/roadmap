// @module kernel-config
// @exports KernelConfig, loadKernel, defaultKernelConfig, DEFAULT_KERNEL
// @types KernelConfig, ComparatorPolicy, EnvPolicy, IntentPolicy, StrategyAutoSelectRule
// @entry roadmap

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

export interface ComparatorPolicy {
  type: 'lexicographic';  // only supported type for now
}

export interface EnvPolicy {
  /** Env vars explicitly allowed in validator subprocesses (beyond builtin allowlist) */
  allowedVars: string[];
}

export interface IntentPolicy {
  minConfidence: number;       // 0.0–1.0, gate advancement
  escalateOnStall: boolean;    // escalate when convergence stalls
  maxRecursionDepth: number;   // hard recursion limit
}

export interface StrategyAutoSelectRule {
  parallelismThreshold: number;
  defaultStrategy: string;
}

export interface KernelConfig {
  schemaVersion: number;
  comparatorPolicy: ComparatorPolicy;
  envPolicy: EnvPolicy;
  intentPolicy: IntentPolicy;
  batchConflictPolicy: {
    /** 'reject' = hard gate (default), 'warn' = log only */
    onConflict: 'reject' | 'warn';
  };
  strategyAutoSelectRule: StrategyAutoSelectRule;
  intentConfidenceDefault: number;
  requireRunId: boolean;
  allowDispatchAutoStrategy: boolean;
  allowUnevaluatedInitIntent: boolean;
  allowUnevaluatedTermIntent: boolean;
  breakglassEnabled: boolean;
}

export const DEFAULT_KERNEL: KernelConfig = {
  schemaVersion: 1,
  comparatorPolicy: { type: 'lexicographic' },
  envPolicy: { allowedVars: [] },
  intentPolicy: { minConfidence: 0.7, escalateOnStall: true, maxRecursionDepth: 3 },
  batchConflictPolicy: { onConflict: 'reject' },
  strategyAutoSelectRule: { parallelismThreshold: 2, defaultStrategy: 'hallucinate-rounds-then-validate' },
  intentConfidenceDefault: 0.95,
  requireRunId: false,
  allowDispatchAutoStrategy: true,
  allowUnevaluatedInitIntent: true,
  allowUnevaluatedTermIntent: true,
  breakglassEnabled: true,
};

export function defaultKernelConfig(): KernelConfig {
  return { ...DEFAULT_KERNEL };
}

export function loadKernel(repoRoot: string): KernelConfig {
  const path = join(repoRoot, '.roadmap', 'kernel.json');
  if (!existsSync(path)) return { ...DEFAULT_KERNEL };
  const raw = JSON.parse(readFileSync(path, 'utf-8')) as Record<string, unknown>;
  return {
    ...DEFAULT_KERNEL,
    ...raw,
    // Deep-merge nested objects so partial overrides don't clobber defaults
    comparatorPolicy: { ...DEFAULT_KERNEL.comparatorPolicy, ...(raw.comparatorPolicy as object ?? {}) },
    envPolicy: { ...DEFAULT_KERNEL.envPolicy, ...(raw.envPolicy as object ?? {}) },
    intentPolicy: { ...DEFAULT_KERNEL.intentPolicy, ...(raw.intentPolicy as object ?? {}) },
    batchConflictPolicy: { ...DEFAULT_KERNEL.batchConflictPolicy, ...(raw.batchConflictPolicy as object ?? {}) },
    strategyAutoSelectRule: { ...DEFAULT_KERNEL.strategyAutoSelectRule, ...(raw.strategyAutoSelectRule as object ?? {}) },
  };
}
