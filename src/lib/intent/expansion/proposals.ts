// @module intent/expansion/proposals
// @exports ConvergenceLimits, CostHistory, FixNodeSpec, ExpansionResult, generateIntentExpansion, generateInitGateExpansion, fixNodeCost, detectStall, buildEscalation, ConvergenceIteration, ConvergenceHistory, recordConvergenceIteration, readConvergenceHistory
// @entry roadmap

import { appendFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { ValidationRule } from '../../../protocol.ts';
export type { EscalationResult } from '../../../protocol.ts';
import type { IntentFailure } from './detection.ts';
import { resolveProduces, isInitGateFailure } from './detection.ts';
import type { PlanClarityGap } from './gaps.ts';
import { extractPlanClarityGaps } from './gaps.ts';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ConvergenceLimits {
  maxExpansionDepth: number;   // hard recursion limit (default: 3)
  stallThreshold: number;      // min confidence improvement per level (default: 0.05)
  maxExpansionCost?: number;   // USD budget cap (optional)
}

export interface CostHistory {
  depth: number;
  fixNodeCount: number;
  perNodeEstimate: number;
  levelTotal: number;
  cumulativeTotal: number;
  timestamp?: string;
}

export interface FixNodeSpec {
  id: string;
  desc: string;
  expandedFrom: string;
  produces: string[];
  consumes: string[];
  validate: ValidationRule[];
  _intentDiagnosis: {
    statement: string;
    achievedConfidence: number;
    threshold: number;
    reasoning: string;
    evidence: string[];
    expansionDepth: number;
    informedBy?: 'llm' | 'unevaluated';
    estimatedCost?: number;
    costRatio?: number;
  };
}

export interface ExpansionResult {
  status: 'expanding' | 'escalated';
  fixNodes: FixNodeSpec[];
  depth: number;
  costHistory?: CostHistory[];
  cumulativeCost?: number;
  budgetRemaining?: number;
}

const DEFAULT_LIMITS: ConvergenceLimits = {
  maxExpansionDepth: 3,
  stallThreshold: 0.05,
};

// Cost estimation constants
const TOKENS_PER_NODE_K = 0.5; // 500 tokens per node
const COST_PER_1K_OPUS = 0.015;
const COST_PER_1K_HAIKU = 0.00025;

// ── Cost Estimation ──────────────────────────────────────────────────────────

function costPerToken(modelAllocation: string): number {
  if (modelAllocation === 'opus-all') {
    return COST_PER_1K_OPUS / 1000;
  }
  if (modelAllocation === 'opus-emit+haiku-fix') {
    return (COST_PER_1K_OPUS * 0.6 + COST_PER_1K_HAIKU * 0.4) / 1000;
  }
  return (COST_PER_1K_HAIKU * 0.7 + COST_PER_1K_OPUS * 0.3) / 1000;
}

export function fixNodeCost(
  node: FixNodeSpec,
  depth: number,
  modelAllocation: string = 'opus-all',
): number {
  const baseTokens = TOKENS_PER_NODE_K * 1000;
  const scopeMultiplier = 1.0 + (0.1 * (node.produces.length + node.consumes.length));
  const scopeTokens = baseTokens * scopeMultiplier;
  const depthMultiplier = 1.0 + (0.2 * depth);
  const totalTokens = scopeTokens * depthMultiplier;
  const costUsd = totalTokens * costPerToken(modelAllocation);
  return costUsd;
}

// ── Convergence checks ────────────────────────────────────────────────────────

export function detectStall(
  history: Array<{ depth: number; confidence: number }>,
  currentConfidence: number,
  limits?: Partial<ConvergenceLimits>,
): boolean {
  if (history.length === 0) return false;
  const resolved = { ...DEFAULT_LIMITS, ...limits };
  const lastConfidence = history[history.length - 1].confidence;
  const improvement = currentConfidence - lastConfidence;
  return improvement < resolved.stallThreshold;
}

export function buildEscalation(
  nodeId: string,
  statement: string,
  history: Array<{ depth: number; confidence: number }>,
  reason: 'depth-exceeded' | 'stalled' | 'budget-exceeded',
): import('../../../protocol.ts').EscalationResult {
  const diagnosis = reason === 'stalled'
    ? `Confidence stalled at ${history[history.length - 1]?.confidence.toFixed(2)} across ${history.length} expansion levels. Fix attempts are not converging.`
    : reason === 'depth-exceeded'
    ? `Maximum expansion depth (${history.length}) reached without meeting threshold. Systematic issue likely requires different approach.`
    : `Expansion budget exceeded. ${history.length} levels consumed without convergence.`;

  return {
    status: 'escalated',
    node: nodeId,
    statement,
    history,
    diagnosis,
    reason,
  };
}

// ── Expansion generators ──────────────────────────────────────────────────────

export function generateIntentExpansion(
  parentId: string,
  parentProduces: readonly string[],
  parentConsumes: readonly string[],
  parentValidate: readonly ValidationRule[],
  failures: IntentFailure[],
  depth: number,
  limits?: Partial<ConvergenceLimits>,
  modelAllocation: string = 'opus-all',
  cumulativeCost: number = 0,
): ExpansionResult {
  const resolved = { ...DEFAULT_LIMITS, ...limits };
  const deterministicRules = parentValidate.filter(r => r.type !== 'intent');

  const maxBudget = resolved.maxExpansionCost;
  const perNodeCosts: number[] = failures.map(f => {
    const tempNode: FixNodeSpec = {
      id: 'temp', desc: 'temp', expandedFrom: parentId,
      produces: resolveProduces(parentProduces, f),
      consumes: [...parentProduces],
      validate: [],
      _intentDiagnosis: {
        statement: f.statement, achievedConfidence: f.achieved, threshold: f.threshold,
        reasoning: f.reasoning, evidence: f.evidence, expansionDepth: depth + 1,
      },
    };
    return fixNodeCost(tempNode, depth, modelAllocation);
  });

  const levelTotal = perNodeCosts.reduce((sum, cost) => sum + cost, 0);
  const projectedTotal = cumulativeCost + levelTotal;

  // Budget gate
  if (maxBudget !== undefined && projectedTotal > maxBudget) {
    const history = failures.map(f => ({ depth, confidence: f.achieved }));
    const escalation = buildEscalation(parentId, failures[0].statement, history, 'budget-exceeded');
    return {
      status: 'escalated', fixNodes: [], depth: depth + 1,
      costHistory: [{ depth, fixNodeCount: failures.length, perNodeEstimate: levelTotal / failures.length, levelTotal, cumulativeTotal: projectedTotal, timestamp: new Date().toISOString() }],
      cumulativeCost: projectedTotal, budgetRemaining: Math.max(0, maxBudget - projectedTotal),
    };
  }

  const fixNodes: FixNodeSpec[] = failures.map((f, i) => {
    const maxDepth = f.rule.maxExpansionDepth ?? resolved.maxExpansionDepth;
    const canExpandFurther = depth + 1 < maxDepth;
    const nodeCost = perNodeCosts[i];
    const budgetRemaining = maxBudget !== undefined ? maxBudget - projectedTotal : undefined;
    const costRatio = budgetRemaining !== undefined && budgetRemaining > 0 ? nodeCost / budgetRemaining : undefined;

    return {
      id: `${parentId}-fix-${i}`,
      desc: `Fix: ${f.statement} (confidence ${f.achieved.toFixed(2)}/${f.threshold})`,
      expandedFrom: parentId,
      produces: resolveProduces(parentProduces, f),
      consumes: [...parentProduces],
      validate: [{ ...f.rule, expandOnFail: canExpandFurther, maxExpansionDepth: f.rule.maxExpansionDepth }, ...deterministicRules],
      _intentDiagnosis: {
        statement: f.statement, achievedConfidence: f.achieved, threshold: f.threshold,
        reasoning: f.reasoning, evidence: f.evidence, expansionDepth: depth + 1,
        informedBy: f.informedBy,
        estimatedCost: nodeCost, costRatio,
      },
    };
  });

  const costHistory: CostHistory[] = [{ depth, fixNodeCount: failures.length, perNodeEstimate: levelTotal / failures.length, levelTotal, cumulativeTotal: projectedTotal, timestamp: new Date().toISOString() }];

  return {
    status: 'expanding', fixNodes, depth: depth + 1, costHistory,
    cumulativeCost: projectedTotal,
    budgetRemaining: maxBudget !== undefined ? Math.max(0, maxBudget - projectedTotal) : undefined,
  };
}

export function generateInitGateExpansion(
  parentId: string,
  parentProduces: readonly string[],
  parentConsumes: readonly string[],
  parentValidate: readonly ValidationRule[],
  failure: IntentFailure,
  depth: number,
  limits?: Partial<ConvergenceLimits>,
  modelAllocation: string = 'opus-all',
  cumulativeCost: number = 0,
): ExpansionResult {
  if (!isInitGateFailure(failure)) {
    return generateIntentExpansion(
      parentId, parentProduces, parentConsumes, parentValidate,
      [failure], depth, limits, modelAllocation, cumulativeCost,
    );
  }

  const resolved = { ...DEFAULT_LIMITS, ...limits };
  const gaps = extractPlanClarityGaps(failure);
  const deterministicRules = parentValidate.filter(r => r.type !== 'intent');

  const maxBudget = resolved.maxExpansionCost;
  const perNodeCosts: number[] = gaps.map(gap => {
    const tempNode: FixNodeSpec = {
      id: 'temp', desc: 'temp', expandedFrom: parentId,
      produces: parentProduces.length > 0 ? [...parentProduces] : ['clarity-spec.md'],
      consumes: parentProduces.length > 0 ? [...parentProduces] : [],
      validate: [],
      _intentDiagnosis: {
        statement: failure.statement, achievedConfidence: failure.achieved, threshold: failure.threshold,
        reasoning: failure.reasoning, evidence: failure.evidence, expansionDepth: depth + 1,
      },
    };
    return fixNodeCost(tempNode, depth, modelAllocation);
  });

  const levelTotal = perNodeCosts.reduce((sum, cost) => sum + cost, 0);
  const projectedTotal = cumulativeCost + levelTotal;

  if (maxBudget !== undefined && projectedTotal > maxBudget) {
    const history = [{ depth, confidence: failure.achieved }];
    const escalation = buildEscalation(parentId, failure.statement, history, 'budget-exceeded');
    return {
      status: 'escalated', fixNodes: [], depth: depth + 1,
      costHistory: [{ depth, fixNodeCount: gaps.length, perNodeEstimate: levelTotal / gaps.length, levelTotal, cumulativeTotal: projectedTotal, timestamp: new Date().toISOString() }],
      cumulativeCost: projectedTotal, budgetRemaining: Math.max(0, maxBudget - projectedTotal),
    };
  }

  const descMap: Record<PlanClarityGap['type'], string> = {
    VagueProduces: 'Clarify: split vague produces into concrete file paths',
    UnresolvableConsumes: 'Clarify: resolve missing consumes or create producer',
    NoValidate: 'Clarify: add testable validation rules',
    OwnershipConflict: 'Clarify: reassign overlapping produces',
    BroadScope: 'Clarify: decompose broad scope into focused children',
  };

  const fixNodes: FixNodeSpec[] = gaps.map((gap, i) => {
    const maxDepth = failure.rule.maxExpansionDepth ?? resolved.maxExpansionDepth;
    const canExpandFurther = depth + 1 < maxDepth;
    const nodeCost = perNodeCosts[i];
    const budgetRemaining = maxBudget !== undefined ? maxBudget - projectedTotal : undefined;
    const costRatio = budgetRemaining !== undefined && budgetRemaining > 0 ? nodeCost / budgetRemaining : undefined;

    let produces: string[];
    switch (gap.type) {
      case 'VagueProduces': produces = ['schema.ts', 'crud.ts', 'migration.ts']; break;
      case 'UnresolvableConsumes': produces = ['producer-backlink.ts']; break;
      case 'NoValidate': produces = ['validate-rules.ts']; break;
      case 'OwnershipConflict': produces = ['ownership-reassignment.md']; break;
      case 'BroadScope': produces = ['decomposed-spec.md']; break;
    }

    return {
      id: `${parentId}-clarify-${i}`,
      desc: `${descMap[gap.type]} (${gap.type})`,
      expandedFrom: parentId,
      produces,
      consumes: parentProduces.length > 0 ? [...parentProduces] : [],
      validate: [
        { type: 'intent', statement: `Plan is now clear for: ${gap.type}`, confidence: 0.95, evaluator: 'self' as const, expandOnFail: canExpandFurther, maxExpansionDepth: failure.rule.maxExpansionDepth },
        ...deterministicRules,
      ],
      _intentDiagnosis: {
        statement: `${descMap[gap.type]} — ${gap.detail}`,
        achievedConfidence: failure.achieved, threshold: failure.threshold,
        reasoning: failure.reasoning, evidence: [gap.detail, ...failure.evidence],
        expansionDepth: depth + 1, estimatedCost: nodeCost, costRatio,
      },
    };
  });

  const costHistory: CostHistory[] = [{ depth, fixNodeCount: gaps.length, perNodeEstimate: levelTotal / gaps.length, levelTotal, cumulativeTotal: projectedTotal, timestamp: new Date().toISOString() }];

  return {
    status: 'expanding', fixNodes, depth: depth + 1, costHistory,
    cumulativeCost: projectedTotal,
    budgetRemaining: maxBudget !== undefined ? Math.max(0, maxBudget - projectedTotal) : undefined,
  };
}

// ── Convergence Metrics ────────────────────────────────────────────────────────

export interface ConvergenceIteration {
  recursionLevel: number;
  coverageDelta: number;
  expandedCount: number;
}

export interface ConvergenceHistory {
  iterations: ConvergenceIteration[];
  stalled: boolean;
  stalledAt?: number;
}

const CONVERGENCE_PATH = (repoRoot: string) =>
  join(repoRoot, '.roadmap', 'convergence-history.jsonl');

export function recordConvergenceIteration(iter: ConvergenceIteration, repoRoot: string): void {
  appendFileSync(CONVERGENCE_PATH(repoRoot), JSON.stringify(iter) + '\n', 'utf-8');
}

export function readConvergenceHistory(repoRoot: string): ConvergenceHistory {
  const path = CONVERGENCE_PATH(repoRoot);
  if (!existsSync(path)) return { iterations: [], stalled: false };
  const iterations = readFileSync(path, 'utf-8')
    .trim().split('\n').filter(Boolean)
    .map(line => JSON.parse(line) as ConvergenceIteration);

  const STALL_THRESHOLD = 0.02;
  const STALL_WINDOW = 3;
  let stalled = false;
  let stalledAt: number | undefined;

  for (let i = STALL_WINDOW - 1; i < iterations.length; i++) {
    const window = iterations.slice(i - STALL_WINDOW + 1, i + 1);
    if (window.every(it => it.coverageDelta < STALL_THRESHOLD)) {
      stalled = true;
      stalledAt = iterations[i].recursionLevel;
      break;
    }
  }
  return { iterations, stalled, stalledAt };
}
