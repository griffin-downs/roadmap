// @module gallery
// @exports computeRisk, paretoFilter, generateCandidates
// @types TemplateParams, GalleryCandidate
// @entry roadmap

export interface TemplateParams {
  emitStrategy: 'single-pass' | 'two-stage' | 'per-cluster'
  gateOrdering: 'parallel' | 'serial' | 'cheapest-first'
  preExpansion: 'none' | 'from-history' | 'from-spec-complexity'
  modelAllocation: 'opus-all' | 'opus-emit+haiku-fix' | 'haiku-emit+opus-judge'
  convergence: 'fixed-passes' | 'until-clean' | 'budget-capped'
}

export interface GalleryCandidate {
  id: string
  label: string
  summary: string
  parameters: TemplateParams
  dag: Record<string, unknown>
  estimates: {
    nodes: number
    maxExpansion: number
    wallClockMinutes: number
    costUSD: number
    risk: number  // 1 - (historicalSuccessRate * gateConvergenceRate)
  }
  gateProfile: { deterministic: number; intent: number; runtime: number }
  historySignal?: {
    priorFailureClasses: string[]
    preExpanded: string[]
    templateSuccessRate: number
  }
}

// risk = 1 - (historicalSuccessRate * gateConvergenceRate)
// Both default to 0.0 when no history → risk = 1.0 cold start
export function computeRisk(historicalSuccessRate: number, gateConvergenceRate: number): number {
  return 1 - (historicalSuccessRate * gateConvergenceRate);
}

// Strict Pareto domination: B dominates A if B is <= on all 3 dimensions (cost, time, risk)
// and strictly < on at least one. Never return empty set.
export function paretoFilter(candidates: GalleryCandidate[]): GalleryCandidate[] {
  if (candidates.length === 0) return candidates;

  const dominated = new Set<string>();

  for (const a of candidates) {
    for (const b of candidates) {
      if (a.id === b.id) continue;
      if (dominated.has(b.id)) continue; // b already dominated, skip

      const bCost = b.estimates.costUSD;
      const aCost = a.estimates.costUSD;
      const bTime = b.estimates.wallClockMinutes;
      const aTime = a.estimates.wallClockMinutes;
      const bRisk = b.estimates.risk;
      const aRisk = a.estimates.risk;

      // b dominates a: b <= a on all three, strictly < on at least one
      const bLeAll = bCost <= aCost && bTime <= aTime && bRisk <= aRisk;
      const bLtOne = bCost < aCost || bTime < aTime || bRisk < aRisk;

      if (bLeAll && bLtOne) {
        dominated.add(a.id);
        break;
      }
    }
  }

  const survivors = candidates.filter(c => !dominated.has(c.id));
  // Never return empty set — fallback to full set if all dominated each other (shouldn't happen)
  return survivors.length > 0 ? survivors : candidates;
}

// Cost per 1k tokens
const COST_PER_1K_OPUS = 0.015;
const COST_PER_1K_HAIKU = 0.00025;
const TOKENS_PER_NODE = 0.5; // 0.5k tokens/node

// Wall-clock minutes per node
const MINUTES_PER_NODE_OPUS = 1.5;
const MINUTES_PER_NODE_HAIKU = 0.5;

// Base node counts by emitStrategy
const BASE_NODES: Record<TemplateParams['emitStrategy'], number> = {
  'single-pass': 8,
  'two-stage': 14,
  'per-cluster': 20,
};

// Gate profile weights by gateOrdering
const GATE_PROFILES: Record<TemplateParams['gateOrdering'], GalleryCandidate['gateProfile']> = {
  'parallel':       { deterministic: 6, intent: 3, runtime: 1 },
  'serial':         { deterministic: 5, intent: 3, runtime: 2 },
  'cheapest-first': { deterministic: 7, intent: 2, runtime: 1 },
};

// Expansion multiplier by preExpansion
const EXPANSION_MULT: Record<TemplateParams['preExpansion'], number> = {
  'none':                1.0,
  'from-history':        1.4,
  'from-spec-complexity': 1.8,
};

// Convergence pass multiplier
const CONVERGENCE_MULT: Record<TemplateParams['convergence'], number> = {
  'fixed-passes':  1.2,
  'until-clean':   1.5,
  'budget-capped': 1.0,
};

function estimateCost(params: TemplateParams, nodes: number): number {
  const ma = params.modelAllocation;
  const tokensK = nodes * TOKENS_PER_NODE;
  if (ma === 'opus-all') return tokensK * COST_PER_1K_OPUS;
  if (ma === 'opus-emit+haiku-fix') return tokensK * (COST_PER_1K_OPUS * 0.6 + COST_PER_1K_HAIKU * 0.4);
  // haiku-emit+opus-judge
  return tokensK * (COST_PER_1K_HAIKU * 0.7 + COST_PER_1K_OPUS * 0.3);
}

function estimateWallClock(params: TemplateParams, nodes: number): number {
  const ma = params.modelAllocation;
  const go = params.gateOrdering;
  const parallelFactor = go === 'parallel' ? 0.5 : go === 'cheapest-first' ? 0.7 : 1.0;
  if (ma === 'opus-all') return nodes * MINUTES_PER_NODE_OPUS * parallelFactor;
  if (ma === 'opus-emit+haiku-fix') return nodes * (MINUTES_PER_NODE_OPUS * 0.6 + MINUTES_PER_NODE_HAIKU * 0.4) * parallelFactor;
  return nodes * (MINUTES_PER_NODE_HAIKU * 0.7 + MINUTES_PER_NODE_OPUS * 0.3) * parallelFactor;
}

// Heuristic success rates by allocation (no real history)
const ALLOC_SUCCESS: Record<TemplateParams['modelAllocation'], number> = {
  'opus-all':            0.85,
  'opus-emit+haiku-fix': 0.78,
  'haiku-emit+opus-judge': 0.72,
};

// Convergence rate by convergence strategy
const CONVERGENCE_GATE: Record<TemplateParams['convergence'], number> = {
  'fixed-passes':  0.80,
  'until-clean':   0.92,
  'budget-capped': 0.70,
};

function buildCandidate(params: TemplateParams, specSource: string, historySuccessRate?: number): GalleryCandidate {
  const baseNodes = BASE_NODES[params.emitStrategy];
  const expMult = EXPANSION_MULT[params.preExpansion];
  const convMult = CONVERGENCE_MULT[params.convergence];
  const nodes = Math.round(baseNodes * expMult);
  const maxExpansion = Math.round(nodes * convMult);
  const costUSD = estimateCost(params, maxExpansion);
  const wallClockMinutes = estimateWallClock(params, maxExpansion);

  const historicalSuccessRate = historySuccessRate ?? ALLOC_SUCCESS[params.modelAllocation];
  const gateConvergenceRate = CONVERGENCE_GATE[params.convergence];
  const risk = computeRisk(historicalSuccessRate, gateConvergenceRate);

  const gateProfile = GATE_PROFILES[params.gateOrdering];

  // Derive a human-readable label
  const label = `${params.emitStrategy}/${params.modelAllocation}/${params.convergence}`;
  const summary = `${params.preExpansion} pre-expansion, ${params.gateOrdering} gates, ${nodes} nodes est.`;

  const idParts = [
    params.emitStrategy.slice(0, 2),
    params.gateOrdering.slice(0, 2),
    params.preExpansion.slice(0, 2),
    params.modelAllocation.slice(0, 2),
    params.convergence.slice(0, 2),
  ].join('-');
  const id = `cand-${idParts}-${specSource.slice(0, 8).replace(/\W/g, '_')}`;

  return {
    id,
    label,
    summary,
    parameters: params,
    dag: {},
    estimates: { nodes, maxExpansion, wallClockMinutes, costUSD, risk },
    gateProfile,
  };
}

// Generate template combinations, score, Pareto-filter, return survivors.
// No API calls. historyDir optional.
export function generateCandidates(specSource: string, _historyDir?: string): GalleryCandidate[] {
  const emitStrategies: TemplateParams['emitStrategy'][] = ['single-pass', 'two-stage', 'per-cluster'];
  const gateOrderings: TemplateParams['gateOrdering'][] = ['parallel', 'serial', 'cheapest-first'];
  const preExpansions: TemplateParams['preExpansion'][] = ['none', 'from-history', 'from-spec-complexity'];
  const modelAllocations: TemplateParams['modelAllocation'][] = ['opus-all', 'opus-emit+haiku-fix', 'haiku-emit+opus-judge'];
  const convergences: TemplateParams['convergence'][] = ['fixed-passes', 'until-clean', 'budget-capped'];

  const candidates: GalleryCandidate[] = [];
  const seenIds = new Set<string>();

  for (const emitStrategy of emitStrategies) {
    for (const gateOrdering of gateOrderings) {
      for (const preExpansion of preExpansions) {
        for (const modelAllocation of modelAllocations) {
          for (const convergence of convergences) {
            const params: TemplateParams = { emitStrategy, gateOrdering, preExpansion, modelAllocation, convergence };
            const c = buildCandidate(params, specSource);
            // Deduplicate by id (id encodes all 5 dimensions; collision implies same config)
            if (!seenIds.has(c.id)) {
              seenIds.add(c.id);
              candidates.push(c);
            }
          }
        }
      }
    }
  }

  return paretoFilter(candidates);
}
