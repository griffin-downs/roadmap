// @module strategy
// @exports proposeCandidates, selectStrategy, autoSelect, clearStrategy
// @types SelectionResult
// @entry roadmap

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { STRATEGIES, getStrategy } from './registry.js';
import type { StrategyConfig, StrategyReceipt, ActiveStrategy } from './schema.js';
import { writeActiveStrategy } from './active.js';

export interface SelectionResult {
  receipt: StrategyReceipt;
  active: ActiveStrategy;
  receiptPath: string;
}

export function proposeCandidates(): readonly StrategyConfig[] {
  return STRATEGIES;
}

export function selectStrategy(
  root: string,
  strategyId: string,
  opts: { runId: string; headSha: string; treeSha: string; selectionMethod: 'auto' | 'ask' | 'manual'; evidence?: Record<string, unknown> },
): SelectionResult {
  const config = getStrategy(strategyId);
  if (!config) throw new Error(`Unknown strategy: ${strategyId}`);

  const candidateSetHash = createHash('sha256')
    .update(JSON.stringify(STRATEGIES.map(s => s.id)))
    .digest('hex')
    .slice(0, 12);

  const now = new Date().toISOString();
  const receipt: StrategyReceipt = {
    schema_version: 1,
    strategyId,
    runId: opts.runId,
    headSha: opts.headSha,
    treeSha: opts.treeSha,
    selectionMethod: opts.selectionMethod,
    candidateSetHash,
    config,
    evidence: opts.evidence ?? {},
    selectedAt: now,
  };

  const ts = now.replace(/[:.]/g, '-');
  const receiptPath = `.roadmap/receipts/strategy-select-${ts}.json`;
  const fullReceiptPath = join(root, receiptPath);
  mkdirSync(dirname(fullReceiptPath), { recursive: true });
  writeFileSync(fullReceiptPath, JSON.stringify(receipt, null, 2) + '\n');

  const active: ActiveStrategy = {
    schema_version: 1,
    strategyId,
    runId: opts.runId,
    latchedAt: now,
    boundAt: now,
    receiptPath,
  };
  writeActiveStrategy(root, active);

  return { receipt, active, receiptPath };
}

export function autoSelect(
  root: string,
  opts: { runId: string; headSha: string; treeSha: string; maxParallelism: number; evidence?: Record<string, unknown> },
): SelectionResult {
  const strategyId = opts.maxParallelism > 2
    ? 'hallucinate-rounds-then-validate'
    : 'validate-as-you-go';
  return selectStrategy(root, strategyId, {
    ...opts,
    selectionMethod: 'auto',
    evidence: { ...opts.evidence, maxParallelism: opts.maxParallelism, autoRule: 'maxParallelism>2 → hallucinate else validate-as-you-go' },
  });
}

export function clearStrategy(root: string): void {
  const activePath = join(root, '.roadmap/strategy/active.json');
  try {
    const data = JSON.parse(readFileSync(activePath, 'utf-8'));
    delete data.strategy;
    writeFileSync(activePath, JSON.stringify(data, null, 2) + '\n');
  } catch {
    // No active file — nothing to clear
  }
}
