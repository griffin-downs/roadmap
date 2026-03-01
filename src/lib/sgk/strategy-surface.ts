// @module sgk/strategy-surface
// @exports StrategySurface, StrategyEntry, listAvailableStrategies, getSelectedStrategy, buildStrategySurface
// @types StrategySurface, StrategyEntry
// @entry roadmap

import { listStrategies } from '../strategy/registry.ts';
import { readStrategyReceipt } from './receipts/strategy.ts';

export interface StrategyEntry {
  id: string;
  desc?: string;
  selected: boolean;
  receiptExists: boolean;
}

export interface StrategySurface {
  availableStrategies: StrategyEntry[];
  selectedStrategyId?: string;
  selectionMode?: 'auto' | 'manual';
}

/**
 * List all available strategies from the strategy registry.
 * Marks which one is currently selected (has a StrategySelectionReceipt).
 */
export function listAvailableStrategies(repoRoot: string, runId?: string): StrategyEntry[] {
  const strategies = listStrategies();
  const receipt = runId ? readStrategyReceipt(repoRoot, runId) : null;

  return strategies.map(s => ({
    id: s.id,
    desc: s.desc,
    selected: receipt?.strategyId === s.id,
    receiptExists: receipt?.strategyId === s.id,
  }));
}

/**
 * Get the currently selected strategy for a run.
 * Returns null if no receipt found.
 */
export function getSelectedStrategy(repoRoot: string, runId: string): string | null {
  const receipt = readStrategyReceipt(repoRoot, runId);
  return receipt?.strategyId ?? null;
}

/**
 * Build the full StrategySurface for inclusion in orient/parallel output.
 */
export function buildStrategySurface(repoRoot: string, runId?: string): StrategySurface {
  const entries = listAvailableStrategies(repoRoot, runId);
  const receipt = runId ? readStrategyReceipt(repoRoot, runId) : null;

  return {
    availableStrategies: entries,
    ...(receipt ? { selectedStrategyId: receipt.strategyId } : {}),
    ...(receipt ? { selectionMode: receipt.selectionMode } : {}),
  };
}
