// @module render
// @exports renderCandidates, renderActive, renderReceipt
// @types -
// @entry roadmap

import type { StrategyConfig, StrategyReceipt, ActiveStrategy } from '../strategy/schema.js';

export function renderCandidates(candidates: readonly StrategyConfig[]): string {
  const header = 'ID                                | Name                                | Rounds | Gate      | Risk';
  const sep    = '----------------------------------|-------------------------------------|--------|-----------|------';
  const rows = candidates.map(c =>
    `${c.id.padEnd(34)}| ${c.name.padEnd(36)}| ${String(c.rounds).padEnd(7)}| ${c.gateMode.padEnd(10)}| ${c.estimatedRisk}`
  );
  return [header, sep, ...rows].join('\n');
}

export function renderActive(active: ActiveStrategy): string {
  return [
    `Strategy:    ${active.strategyId}`,
    `Run:         ${active.runId}`,
    `Latched at:  ${active.latchedAt}`,
    `Bound at:    ${active.boundAt}`,
    `Receipt:     ${active.receiptPath}`,
  ].join('\n');
}

export function renderReceipt(receipt: StrategyReceipt): string {
  return [
    `Strategy:    ${receipt.strategyId} (${receipt.config.name})`,
    `Run:         ${receipt.runId}`,
    `Method:      ${receipt.selectionMethod}`,
    `Selected at: ${receipt.selectedAt}`,
    `Head SHA:    ${receipt.headSha}`,
    `Tree SHA:    ${receipt.treeSha}`,
    `Candidates:  ${receipt.candidateSetHash}`,
    `Gate mode:   ${receipt.config.gateMode}`,
    `Rounds:      ${receipt.config.rounds}`,
    `Risk:        ${receipt.config.estimatedRisk}`,
  ].join('\n');
}
