// @module strategy
// @exports checkStrategyGate
// @types StrategyGateResult
// @entry roadmap

import { isLatched } from './active.js';
import { readActiveStrategy } from './active.js';

export interface StrategyGateResult {
  blocked: boolean;
  code?: 'STRATEGY_REQUIRED';
  fix?: string[];
}

export function checkStrategyGate(base?: string): StrategyGateResult {
  const root = base ?? process.cwd();
  if (!isLatched(root)) return { blocked: false };
  const active = readActiveStrategy(root);
  if (active) return { blocked: false };
  return {
    blocked: true,
    code: 'STRATEGY_REQUIRED',
    fix: [
      'roadmap strategy auto --note "auto-select based on parallelism"',
      'roadmap strategy select <id> --note "reason"',
      'roadmap strategy propose --note "list candidates"',
    ],
  };
}
