// @module intent-expansion
// @exports IntentFailure, PlanClarityGap, ConvergenceLimits, CostHistory, FixNodeSpec, ExpansionResult, generateIntentExpansion, generateInitGateExpansion, resolveProduces, isInitGateFailure, extractPlanClarityGaps, detectStall, buildEscalation, extractIntentFailures, extractObservationFailures, enrichIntentFailuresWithObservations, fixNodeCost
// @entry roadmap

import type { ValidationRule, ValidationCheck, IntentJudgment, EscalationResult, ObservationResult } from '../protocol.ts';
export type { EscalationResult } from '../protocol.ts';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PlanClarityGap {
  type: 'VagueProduces' | 'UnresolvableConsumes' | 'NoValidate' | 'OwnershipConflict' | 'BroadScope';
  node: string;
  detail: string;
}

export interface IntentFailure {
  statement: string;
  threshold: number;
  achieved: number;
  reasoning: string;
  evidence: string[];
  rule: ValidationRule & { type: 'intent' };
  observationFailures?: Array<{ id: string; description: string; evidence: string }>;  // from runtime-explore
  informedBy?: 'runtime-explore' | 'llm' | 'hybrid' | 'unevaluated'; // judgment source
}

export interface ConvergenceLimits {
  maxExpansionDepth: number;   // hard recursion limit (default: 3)
  stallThreshold: number;      // min confidence improvement per level (default: 0.05)
  maxExpansionCost?: number;   // USD budget cap (optional)
}

export interface CostHistory {
  depth: number;           // expansion level (0 = first, 1 = fix-of-fix, ...)
  fixNodeCount: number;    // how many fix nodes at this depth
  perNodeEstimate: number; // USD estimate per node (average)
  levelTotal: number;      // USD for all nodes at this depth
  cumulativeTotal: number; // sum from depth 0 to current
  timestamp?: string;      // ISO-8601 when estimated
}

export interface FixNodeSpec {
  id: string;
  desc: string;
  expandedFrom: string;
  produces: string[];
  consumes: string[];
  ambient?: string[];
  validate: ValidationRule[];
  idempotent: boolean;
  _intentDiagnosis: {
    statement: string;
    achievedConfidence: number;
    threshold: number;
    reasoning: string;
    evidence: string[];
    expansionDepth: number;
    observationFailures?: Array<{ id: string; description: string; evidence: string }>;  // failed observations from runtime-explore
    informedBy?: 'runtime-explore' | 'llm' | 'hybrid' | 'unevaluated'; // judgment source
    estimatedCost?: number;      // USD for this fix node
    costRatio?: number;          // ratio: thisNodeCost / maxBudgetRemaining
  };
}

export interface ExpansionResult {
  status: 'expanding' | 'escalated';
  fixNodes: FixNodeSpec[];
  depth: number;
  costHistory?: CostHistory[];    // NEW: cost progression
  cumulativeCost?: number;        // NEW: total USD for this expansion tree
  budgetRemaining?: number;       // NEW: USD left in budget
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

/**
 * Compute USD cost for a single LLM token given model allocation.
 * Weighted by allocation percentages.
 */
function costPerToken(modelAllocation: string): number {
  if (modelAllocation === 'opus-all') {
    return COST_PER_1K_OPUS / 1000;
  }
  if (modelAllocation === 'opus-emit+haiku-fix') {
    // 60% Opus, 40% Haiku
    return (COST_PER_1K_OPUS * 0.6 + COST_PER_1K_HAIKU * 0.4) / 1000;
  }
  // haiku-emit+opus-judge: 70% Haiku, 30% Opus
  return (COST_PER_1K_HAIKU * 0.7 + COST_PER_1K_OPUS * 0.3) / 1000;
}

/**
 * Estimate cost for a single fix node.
 *
 * Cost formula:
 *   baseTokens = 500 (TOKENS_PER_NODE_K × 1000)
 *   scopeTokens = baseTokens × (1 + 0.1 × (produces.length + consumes.length))
 *   depthMultiplier = 1.0 + (0.2 × depth)
 *   tokens = scopeTokens × depthMultiplier
 *   costUSD = tokens × costPerToken(modelAllocation)
 */
export function fixNodeCost(
  node: FixNodeSpec,
  depth: number,
  modelAllocation: string = 'opus-all',
): number {
  const baseTokens = TOKENS_PER_NODE_K * 1000; // 500 tokens
  const scopeMultiplier = 1.0 + (0.1 * (node.produces.length + node.consumes.length));
  const scopeTokens = baseTokens * scopeMultiplier;
  const depthMultiplier = 1.0 + (0.2 * depth);
  const totalTokens = scopeTokens * depthMultiplier;
  const costUsd = totalTokens * costPerToken(modelAllocation);
  return costUsd;
}

// ── Core ──────────────────────────────────────────────────────────────────────

export function extractIntentFailures(
  checks: ValidationCheck[],
  judgments: IntentJudgment[],
): IntentFailure[] {
  const failures: IntentFailure[] = [];

  for (const check of checks) {
    const rule = check.rule;
    if (rule.type !== 'intent') continue;
    if (check.passed) continue;
    if (!rule.expandOnFail) continue;

    const judgment = judgments.find(j => j.statement === rule.statement);
    if (!judgment) continue;

    failures.push({
      statement: rule.statement,
      threshold: rule.confidence,
      achieved: judgment.confidence,
      reasoning: judgment.reasoning,
      evidence: judgment.evidence ?? [],
      rule,
    });
  }

  return failures;
}

export function resolveProduces(
  parentProduces: readonly string[],
  failure: IntentFailure,
): string[] {
  // If intent rule has context paths, scope fix node to those
  const context = failure.rule.context;
  if (context && context.length > 0) {
    // Filter parent produces to only those in context
    const contextSet = new Set(context);
    const scoped = parentProduces.filter(p => contextSet.has(p));
    return scoped.length > 0 ? scoped : [...parentProduces];
  }
  return [...parentProduces];
}

/**
 * Detect if an intent failure is an init gate failure (plan clarity context).
 * Init gate failures have statements about plan clarity, unambiguity, or executability.
 */
export function isInitGateFailure(failure: IntentFailure): boolean {
  const statement = failure.statement.toLowerCase();
  const keywords = ['plan', 'unambiguous', 'clear', 'clarity', 'concrete', 'resolvable', 'executable', 'testable', 'scope', 'produces', 'consumes'];
  return keywords.some(keyword => statement.includes(keyword));
}

/**
 * Parse plan clarity gaps from the init gate failure's reasoning and evidence.
 * Returns structured gap descriptions that map to fix node categories.
 */
export function extractPlanClarityGaps(
  failure: IntentFailure,
): PlanClarityGap[] {
  const gaps: PlanClarityGap[] = [];
  const reasoning = failure.reasoning.toLowerCase();
  const evidence = failure.evidence.map(e => e.toLowerCase());
  const allText = [reasoning, ...evidence].join(' ');

  // Vague produces: placeholder names, non-file patterns, abstract descriptions
  if (allText.includes('produces') && (allText.includes('placeholder') || allText.includes('abstract') || allText.includes('vague'))) {
    gaps.push({
      type: 'VagueProduces',
      node: failure.reasoning.split('\n')[0] || 'unknown',
      detail: 'produces contains placeholders or non-concrete paths',
    });
  }

  // Unresolvable consumes: artifacts not produced by predecessors
  if (allText.includes('consumes') && (allText.includes('not found') || allText.includes('no producer') || allText.includes('unresolvable'))) {
    gaps.push({
      type: 'UnresolvableConsumes',
      node: failure.reasoning.split('\n')[0] || 'unknown',
      detail: 'consumes references artifacts without producers',
    });
  }

  // No validate: missing validation rules
  if (allText.includes('validate') && (allText.includes('no validate') || allText.includes('missing validate') || allText.includes('not testable'))) {
    gaps.push({
      type: 'NoValidate',
      node: failure.reasoning.split('\n')[0] || 'unknown',
      detail: 'no validation rules defined',
    });
  }

  // Ownership conflict: multiple nodes claim same output or unclear ownership
  if (allText.includes('ownership') || allText.includes('conflict') || allText.includes('duplicate') || allText.includes('overlapping')) {
    gaps.push({
      type: 'OwnershipConflict',
      node: failure.reasoning.split('\n')[0] || 'unknown',
      detail: 'overlapping produces or unclear ownership',
    });
  }

  // Broad scope: node description has multiple concerns
  if (allText.includes('scope') && (allText.includes('broad') || allText.includes('multiple') || allText.includes('and') || allText.includes('also'))) {
    gaps.push({
      type: 'BroadScope',
      node: failure.reasoning.split('\n')[0] || 'unknown',
      detail: 'node scope covers multiple concerns',
    });
  }

  return gaps.length > 0 ? gaps : [
    {
      type: 'VagueProduces',
      node: failure.reasoning.split('\n')[0] || 'unknown',
      detail: failure.reasoning,
    },
  ];
}

export function generateIntentExpansion(
  parentId: string,
  parentProduces: readonly string[],
  parentConsumes: readonly string[],
  parentAmbient: readonly string[] | undefined,
  parentValidate: readonly ValidationRule[],
  failures: IntentFailure[],
  depth: number,
  limits?: Partial<ConvergenceLimits>,
  modelAllocation: string = 'opus-all',
  cumulativeCost: number = 0,
): ExpansionResult {
  const resolved = { ...DEFAULT_LIMITS, ...limits };
  const deterministicRules = parentValidate.filter(r => r.type !== 'intent' && r.type !== 'runtime-explore');

  // Estimate costs for all fix nodes before creating them
  const maxBudget = resolved.maxExpansionCost;
  const perNodeCosts: number[] = failures.map(f => {
    const tempNode: FixNodeSpec = {
      id: 'temp',
      desc: 'temp',
      expandedFrom: parentId,
      produces: resolveProduces(parentProduces, f),
      consumes: [...parentProduces],
      ambient: parentAmbient ? [...parentAmbient] : undefined,
      validate: [],
      idempotent: true,
      _intentDiagnosis: {
        statement: f.statement,
        achievedConfidence: f.achieved,
        threshold: f.threshold,
        reasoning: f.reasoning,
        evidence: f.evidence,
        expansionDepth: depth + 1,
      },
    };
    return fixNodeCost(tempNode, depth, modelAllocation);
  });

  const levelTotal = perNodeCosts.reduce((sum, cost) => sum + cost, 0);
  const projectedTotal = cumulativeCost + levelTotal;

  // Budget gate 1: before generating fix nodes
  if (maxBudget !== undefined && projectedTotal > maxBudget) {
    const history = failures.map(f => ({ depth, confidence: f.achieved }));
    const escalation = buildEscalation(parentId, failures[0].statement, history, 'budget-exceeded');
    return {
      status: 'escalated',
      fixNodes: [],
      depth: depth + 1,
      costHistory: [{
        depth,
        fixNodeCount: failures.length,
        perNodeEstimate: levelTotal / failures.length,
        levelTotal,
        cumulativeTotal: projectedTotal,
        timestamp: new Date().toISOString(),
      }],
      cumulativeCost: projectedTotal,
      budgetRemaining: Math.max(0, maxBudget - projectedTotal),
    };
  }

  // Create fix nodes with cost annotations
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
      consumes: [...parentProduces], // reads current state
      ambient: parentAmbient ? [...parentAmbient] : undefined,
      validate: [
        // The failing intent — fix node's acceptance test
        {
          ...f.rule,
          expandOnFail: canExpandFurther,
          maxExpansionDepth: f.rule.maxExpansionDepth,
        },
        // Plus deterministic gates from parent
        ...deterministicRules,
      ],
      idempotent: true,
      _intentDiagnosis: {
        statement: f.statement,
        achievedConfidence: f.achieved,
        threshold: f.threshold,
        reasoning: f.reasoning,
        evidence: f.evidence,
        expansionDepth: depth + 1,
        observationFailures: f.observationFailures,  // pass through observation data
        informedBy: f.informedBy,                    // pass through judgment source
        estimatedCost: nodeCost,
        costRatio,
      },
    };
  });

  const costHistory: CostHistory[] = [{
    depth,
    fixNodeCount: failures.length,
    perNodeEstimate: levelTotal / failures.length,
    levelTotal,
    cumulativeTotal: projectedTotal,
    timestamp: new Date().toISOString(),
  }];

  return {
    status: 'expanding',
    fixNodes,
    depth: depth + 1,
    costHistory,
    cumulativeCost: projectedTotal,
    budgetRemaining: maxBudget !== undefined ? Math.max(0, maxBudget - projectedTotal) : undefined,
  };
}

/**
 * Generate expansion for init gate failures (plan clarity issues).
 * When intent statement is about plan clarity, extract gaps and create targeted fix nodes.
 *
 * Gap types and fixes:
 * - VagueProduces → split into concrete file paths
 * - UnresolvableConsumes → create producer backlink or mark as spec gap
 * - NoValidate → add validation node as sibling
 * - OwnershipConflict → generate reassignment nodes
 * - BroadScope → decompose into parallel children
 */
export function generateInitGateExpansion(
  parentId: string,
  parentProduces: readonly string[],
  parentConsumes: readonly string[],
  parentAmbient: readonly string[] | undefined,
  parentValidate: readonly ValidationRule[],
  failure: IntentFailure,
  depth: number,
  limits?: Partial<ConvergenceLimits>,
  modelAllocation: string = 'opus-all',
  cumulativeCost: number = 0,
): ExpansionResult {
  if (!isInitGateFailure(failure)) {
    // Fallback to standard intent expansion if not plan clarity context
    return generateIntentExpansion(
      parentId, parentProduces, parentConsumes, parentAmbient, parentValidate,
      [failure], depth, limits, modelAllocation, cumulativeCost,
    );
  }

  const resolved = { ...DEFAULT_LIMITS, ...limits };
  const gaps = extractPlanClarityGaps(failure);
  const deterministicRules = parentValidate.filter(r => r.type !== 'intent' && r.type !== 'runtime-explore');

  // Estimate costs for all clarity fix nodes
  const maxBudget = resolved.maxExpansionCost;
  const perNodeCosts: number[] = gaps.map(gap => {
    const tempNode: FixNodeSpec = {
      id: 'temp',
      desc: 'temp',
      expandedFrom: parentId,
      produces: parentProduces.length > 0 ? [...parentProduces] : ['clarity-spec.md'],
      consumes: parentProduces.length > 0 ? [...parentProduces] : [],
      ambient: parentAmbient ? [...parentAmbient] : undefined,
      validate: [],
      idempotent: true,
      _intentDiagnosis: {
        statement: failure.statement,
        achievedConfidence: failure.achieved,
        threshold: failure.threshold,
        reasoning: failure.reasoning,
        evidence: failure.evidence,
        expansionDepth: depth + 1,
      },
    };
    return fixNodeCost(tempNode, depth, modelAllocation);
  });

  const levelTotal = perNodeCosts.reduce((sum, cost) => sum + cost, 0);
  const projectedTotal = cumulativeCost + levelTotal;

  // Budget gate
  if (maxBudget !== undefined && projectedTotal > maxBudget) {
    const history = [{ depth, confidence: failure.achieved }];
    const escalation = buildEscalation(parentId, failure.statement, history, 'budget-exceeded');
    return {
      status: 'escalated',
      fixNodes: [],
      depth: depth + 1,
      costHistory: [{
        depth,
        fixNodeCount: gaps.length,
        perNodeEstimate: levelTotal / gaps.length,
        levelTotal,
        cumulativeTotal: projectedTotal,
        timestamp: new Date().toISOString(),
      }],
      cumulativeCost: projectedTotal,
      budgetRemaining: Math.max(0, maxBudget - projectedTotal),
    };
  }

  // Create clarity fix nodes, one per gap
  const fixNodes: FixNodeSpec[] = gaps.map((gap, i) => {
    const maxDepth = failure.rule.maxExpansionDepth ?? resolved.maxExpansionDepth;
    const canExpandFurther = depth + 1 < maxDepth;
    const nodeCost = perNodeCosts[i];
    const budgetRemaining = maxBudget !== undefined ? maxBudget - projectedTotal : undefined;
    const costRatio = budgetRemaining !== undefined && budgetRemaining > 0 ? nodeCost / budgetRemaining : undefined;

    // Produce based on gap type
    let produces: string[];
    switch (gap.type) {
      case 'VagueProduces':
        produces = ['schema.ts', 'crud.ts', 'migration.ts'];
        break;
      case 'UnresolvableConsumes':
        produces = ['producer-backlink.ts'];
        break;
      case 'NoValidate':
        produces = ['validate-rules.ts'];
        break;
      case 'OwnershipConflict':
        produces = ['ownership-reassignment.md'];
        break;
      case 'BroadScope':
        produces = ['decomposed-spec.md'];
        break;
    }

    const descMap: Record<PlanClarityGap['type'], string> = {
      VagueProduces: 'Clarify: split vague produces into concrete file paths',
      UnresolvableConsumes: 'Clarify: resolve missing consumes or create producer',
      NoValidate: 'Clarify: add testable validation rules',
      OwnershipConflict: 'Clarify: reassign overlapping produces',
      BroadScope: 'Clarify: decompose broad scope into focused children',
    };

    return {
      id: `${parentId}-clarify-${i}`,
      desc: `${descMap[gap.type]} (${gap.type})`,
      expandedFrom: parentId,
      produces,
      consumes: parentProduces.length > 0 ? [...parentProduces] : [],
      ambient: parentAmbient ? [...parentAmbient] : undefined,
      validate: [
        // Plan clarity validation — parent intent adapted for this gap
        {
          type: 'intent',
          statement: `Plan is now clear for: ${gap.type}`,
          confidence: 0.95,
          evaluator: 'self' as const,
          expandOnFail: canExpandFurther,
          maxExpansionDepth: failure.rule.maxExpansionDepth,
        },
        // Plus deterministic gates from parent
        ...deterministicRules,
      ],
      idempotent: true,
      _intentDiagnosis: {
        statement: `${descMap[gap.type]} — ${gap.detail}`,
        achievedConfidence: failure.achieved,
        threshold: failure.threshold,
        reasoning: failure.reasoning,
        evidence: [gap.detail, ...failure.evidence],
        expansionDepth: depth + 1,
        estimatedCost: nodeCost,
        costRatio,
      },
    };
  });

  const costHistory: CostHistory[] = [{
    depth,
    fixNodeCount: gaps.length,
    perNodeEstimate: levelTotal / gaps.length,
    levelTotal,
    cumulativeTotal: projectedTotal,
    timestamp: new Date().toISOString(),
  }];

  return {
    status: 'expanding',
    fixNodes,
    depth: depth + 1,
    costHistory,
    cumulativeCost: projectedTotal,
    budgetRemaining: maxBudget !== undefined ? Math.max(0, maxBudget - projectedTotal) : undefined,
  };
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
): EscalationResult {
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

// ── Observation integration ────────────────────────────────────────────────────

export function extractObservationFailures(
  observations: ObservationResult[],
): Array<{ id: string; description: string; evidence: string }> {
  // Observation descriptions are resolved from the rule via runtime-explore spec
  // Here we just extract the failed ones with their evidence
  return observations
    .filter(obs => !obs.pass)
    .map(obs => ({
      id: obs.id,
      description: obs.id, // Will be enriched by caller with actual description from spec
      evidence: obs.evidence,
    }));
}

/**
 * Enrich intent failures with observation data from runtime-explore checks.
 * Maps failed observations to the intent failure they inform.
 * Determines informedBy source: 'runtime-explore', 'llm', 'hybrid', or 'unevaluated'.
 */
export function enrichIntentFailuresWithObservations(
  failures: IntentFailure[],
  checks: ValidationCheck[],
): IntentFailure[] {
  return failures.map(failure => {
    // Find failed runtime-explore observations
    const failedObservations = checks
      .filter(c => c.rule.type === 'runtime-explore' && !c.passed && c.observations)
      .flatMap(c => {
        const rule = c.rule as any;
        const observations = rule.observations as any[] ?? [];
        const checkObs = c.observations as ObservationResult[] ?? [];

        // Only return observations that failed (pass === false)
        return checkObs
          .filter(obs => !obs.pass)
          .map(obs => {
            const spec = observations.find((o: any) => o.id === obs.id);
            return {
              id: obs.id,
              description: spec?.description ?? obs.id,
              evidence: obs.evidence,
            };
          });
      });

    if (failedObservations.length > 0) {
      // Observations + judgment = hybrid source
      // Observations only = runtime-explore only
      const hasJudgment = !!failure.reasoning && failure.reasoning.length > 0;
      const informedBy = hasJudgment ? 'hybrid' : 'runtime-explore';

      return {
        ...failure,
        observationFailures: failedObservations,
        informedBy,
      };
    }

    // Default: judgment-only, no observations
    return {
      ...failure,
      informedBy: 'llm',
    };
  });
}
