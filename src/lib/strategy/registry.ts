// @module strategy
// @exports STRATEGIES, getStrategy, listStrategies
// @types -
// @entry roadmap

import type { StrategyConfig } from './schema.ts';

export const STRATEGIES: readonly StrategyConfig[] = [
  {
    id: 'hallucinate-rounds-then-validate',
    name: 'HALLUCINATE_ROUNDS_THEN_VALIDATE',
    desc: 'Run N rounds of agent work, validate only at terminal gate. Higher throughput, higher risk of late-stage rework.',
    rounds: 2,
    gateMode: 'terminal',
    allowedBypasses: [],
    estimatedRisk: 'medium',
  },
  {
    id: 'validate-as-you-go',
    name: 'VALIDATE_AS_YOU_GO',
    desc: 'Validate after every batch. Lowest risk, highest overhead.',
    rounds: 1,
    gateMode: 'per-batch',
    allowedBypasses: [],
    estimatedRisk: 'low',
  },
  {
    id: 'hybrid',
    name: 'HYBRID',
    desc: 'Validate at phase boundaries. Balanced risk and throughput.',
    rounds: 2,
    gateMode: 'per-phase',
    allowedBypasses: [],
    estimatedRisk: 'medium',
  },
] as const;

export function getStrategy(id: string): StrategyConfig | undefined {
  return STRATEGIES.find(s => s.id === id);
}

export function listStrategies(): readonly StrategyConfig[] {
  return STRATEGIES;
}
