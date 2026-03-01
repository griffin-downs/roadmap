// @module sgk/strategy-auto
// @exports autoSelectStrategy, AutoSelectResult
// @types AutoSelectResult
// @entry roadmap

import { createHash } from 'node:crypto';
import { loadKernel } from '../config/kernel-config.ts';
import { getStrategy, listStrategies } from '../strategy/registry.ts';
import { writeStrategyReceipt } from './receipts/strategy.ts';

export interface AutoSelectResult {
  ok: boolean;
  strategyId?: string;
  evidence?: string;
  receiptPath?: string;
  error?: string;
}

/**
 * Deterministically auto-select a strategy based on kernel policy.
 * Writes a StrategySelectionReceipt with selectionMode='auto'.
 * Uses kernel.strategyAutoSelectRule.parallelismThreshold and defaultStrategy.
 */
export function autoSelectStrategy(repoRoot: string, runId: string, parallelism: number): AutoSelectResult {
  const kernel = loadKernel(repoRoot);
  if (!kernel.allowDispatchAutoStrategy) {
    return { ok: false, error: 'kernel.allowDispatchAutoStrategy is false — auto-select disabled' };
  }

  const rule = kernel.strategyAutoSelectRule;
  const strategyId = parallelism > rule.parallelismThreshold
    ? rule.defaultStrategy
    : 'validate-as-you-go';

  const config = getStrategy(strategyId);
  if (!config) {
    return { ok: false, error: `Strategy "${strategyId}" not found in registry` };
  }

  const evidence = `parallelism=${parallelism}, threshold=${rule.parallelismThreshold}, ` +
    `rule: parallelism>${rule.parallelismThreshold} → ${rule.defaultStrategy} else validate-as-you-go`;

  const configSha = createHash('sha256')
    .update(JSON.stringify(listStrategies().map(s => s.id)))
    .digest('hex')
    .slice(0, 12);

  const receiptPath = writeStrategyReceipt(repoRoot, {
    schema_version: 1,
    type: 'strategy-selection',
    runId,
    selectionMode: 'auto',
    strategyId,
    autoSelectEvidence: evidence,
    strategyConfigSha: configSha,
    constraints: [`parallelismThreshold:${rule.parallelismThreshold}`],
    selectedAt: new Date().toISOString(),
  });

  return { ok: true, strategyId, evidence, receiptPath };
}
