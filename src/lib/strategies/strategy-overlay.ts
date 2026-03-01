// @module strategy-overlay
// @exports StrategyOverlay, applyOverlay, loadOverlay, writeOverlay
// @types StrategyOverlay
// @entry roadmap

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/** Hypothesis variant that can be layered on a base plan. */
export interface StrategyOverlay {
  overlayId: string;
  baselineId: string;
  description: string;
  params: Record<string, unknown>; // model params, prompt templates, validator thresholds
  timestamp: string;
}

/** Merge overlay params onto base config object. Later keys win. */
export function applyOverlay<T extends Record<string, unknown>>(
  base: T,
  overlay: StrategyOverlay,
): T & Record<string, unknown> {
  return { ...base, ...overlay.params };
}

export function writeOverlay(overlay: StrategyOverlay, repoRoot: string): void {
  const path = join(repoRoot, '.roadmap', 'strategy-overlay.json');
  writeFileSync(path, JSON.stringify(overlay, null, 2) + '\n', 'utf-8');
}

export function loadOverlay(repoRoot: string): StrategyOverlay | null {
  const path = join(repoRoot, '.roadmap', 'strategy-overlay.json');
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, 'utf-8')) as StrategyOverlay;
}
