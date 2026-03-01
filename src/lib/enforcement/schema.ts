// @module enforcement
// @exports ValidationRuleType, EnforcementContract, EnforcementSchema, StateTransition
// @types ValidationRuleType, EnforcementContract, EnforcementSchema, StateTransition
// @entry roadmap

/**
 * Core enforcement schema: validation rule types, state contracts, mechanical checks.
 * Defines DSL for mechanical enforcement across roadmap operations.
 */

export type ValidationRuleType =
  | 'artifact-exists'
  | 'artifact-schema'
  | 'process-invariant'
  | 'state-transition'
  | 'concurrent-safety'
  | 'function'
  | 'shell'
  | 'manual-approval';

export interface ValidatorConfig {
  type: ValidationRuleType;
  target?: string | string[];
  command?: string;
  schema?: string;
  invariant?: string;
  allowedTransitions?: string[];
  maxConcurrency?: number;
}

/**
 * Enforcement contract: binds state machine to validator rules.
 * Used by complete() to verify node readiness and enforce transitions.
 */
export interface EnforcementContract {
  nodeId: string;
  /** Expected state before executing this node */
  precondition: NodeState;
  /** Expected state after node completes */
  postcondition: NodeState;
  /** Validators to run before transition */
  preValidate: ValidatorConfig[];
  /** Validators to run after transition */
  postValidate: ValidatorConfig[];
  /** Maximum concurrent executions allowed for this node */
  maxConcurrency: number;
  /** If true, only one instance of this node can execute per batch */
  exclusivePerBatch: boolean;
}

/**
 * Node state in execution machine.
 */
export type NodeState =
  | 'init'
  | 'pending'
  | 'claimed'
  | 'executing'
  | 'validated'
  | 'complete'
  | 'failed'
  | 'skipped';

/**
 * State transition event with audit trail.
 */
export interface StateTransition {
  nodeId: string;
  from: NodeState;
  to: NodeState;
  timestamp: string;
  evidence: Record<string, unknown>;
  reason?: string;
}

/**
 * Enforcement schema: registry of contracts per node.
 * Compiled at startup from head.json validators + derived rules.
 */
export interface EnforcementSchema {
  schemaVersion: number;
  contracts: Record<string, EnforcementContract>;
  globalRules: {
    maxParallelNodes: number;
    maxConcurrentPerNode: number;
    validateOnComplete: boolean;
    validateOnClaim: boolean;
    auditTransitions: boolean;
  };
}

/**
 * Factory: build enforcement contract from node spec + audit trail.
 */
export function createEnforcementContract(nodeId: string, spec: any): EnforcementContract {
  return {
    nodeId,
    precondition: 'pending',
    postcondition: 'complete',
    preValidate: spec.validate || [],
    postValidate: [],
    maxConcurrency: spec.maxConcurrency ?? 1,
    exclusivePerBatch: spec.exclusivePerBatch ?? false,
  };
}

/**
 * Verify state transition is legal.
 */
export function isLegalTransition(from: NodeState, to: NodeState): boolean {
  const allowed: Record<NodeState, NodeState[]> = {
    init: ['pending'],
    pending: ['claimed'],
    claimed: ['executing'],
    executing: ['validated', 'failed'],
    validated: ['complete'],
    complete: [],
    failed: ['pending'], // allow retry
    skipped: [],
  };
  return (allowed[from] || []).includes(to);
}
