// @module validate-dag
// @exports validateAcyclic, validateInitTermExists, validateReachability, validatePhaseOrdering, validateNodeConsistency, recursivelyValidate, ValidationError, PhaseType
// @entry roadmap

import type { Graph, NodeSpec, ValidationRule } from './protocol/types.ts';

// ── Types ──────────────────────────────────────────────────────────────────────

/**
 * Phase types in the DAG lifecycle.
 * Enforces ordering: make → validate → brief → execute → term
 */
export type PhaseType = 'make' | 'validate' | 'brief' | 'execute' | 'term';

/**
 * Result of a validation check
 */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Error thrown during validation with context
 */
export interface ValidationError {
  type: string;
  message: string;
  context?: Record<string, any>;
  fix?: string;
}

// ── Internal: Phase Detection ──────────────────────────────────────────────────

/**
 * Detect phase type from node properties.
 * Node phase is determined by:
 * 1. Explicit phase property if present
 * 2. Mode='plan' implies 'brief'
 * 3. Otherwise infer from position (first phase, last phase, middle)
 * 4. Default to 'execute'
 */
function getPhase(node: any, nodeId: string, init: string, term: string): PhaseType {
  // Explicit phase property
  if (node.phase) {
    if (node.phase === 'make' || node.phase === 'validate' || node.phase === 'brief' ||
        node.phase === 'execute' || node.phase === 'term') {
      return node.phase;
    }
  }

  // Mode='plan' implies brief
  if (node.mode === 'plan') {
    return 'brief';
  }

  // Known boundaries
  if (nodeId === init) return 'make';
  if (nodeId === term) return 'term';

  // Default
  return 'execute';
}

/**
 * Phase ordering hierarchy: earlier phases must come before later phases
 */
function phaseOrder(phase: PhaseType): number {
  const order: Record<PhaseType, number> = {
    'make': 0,
    'validate': 1,
    'brief': 2,
    'execute': 3,
    'term': 4,
  };
  return order[phase];
}

// ── Internal: Graph Flattening ─────────────────────────────────────────────────

type FlatNode = {
  id: string;
  phase: PhaseType;
  produces: readonly string[];
  consumes: readonly any[];
  deps: readonly string[];
  validate: readonly ValidationRule[];
};

function flattenGraph(g: Graph<any>): FlatNode[] {
  return Object.values(g.nodes).map((node: any) => ({
    id: node.id,
    phase: getPhase(node, node.id, g.init, g.term),
    produces: node.produces ?? [],
    consumes: node.consumes ?? [],
    deps: node.deps ?? [],
    validate: node.validate ?? [],
  }));
}

// ── Internal: Cycle Detection ──────────────────────────────────────────────────

/**
 * Detect cycles using Kahn's algorithm (topological sort).
 * Returns array of node IDs involved in cycles (empty = acyclic).
 */
function detectCycles(nodes: FlatNode[]): string[] {
  const ids = new Set(nodes.map(n => n.id));
  const inDegree = new Map(nodes.map(n => [n.id, 0]));
  const adj = new Map<string, string[]>();

  // Build adjacency list
  for (const n of nodes) {
    if (!adj.has(n.id)) adj.set(n.id, []);
    for (const dep of n.deps) {
      if (ids.has(dep)) {
        inDegree.set(n.id, (inDegree.get(n.id) ?? 0) + 1);
        if (!adj.has(dep)) adj.set(dep, []);
        adj.get(dep)!.push(n.id);
      }
    }
  }

  // Kahn's algorithm
  const queue: string[] = [];
  for (const [node, degree] of inDegree) {
    if (degree === 0) queue.push(node);
  }

  let visited = 0;
  while (queue.length > 0) {
    const node = queue.shift()!;
    visited++;
    for (const neighbor of adj.get(node) ?? []) {
      const newDegree = (inDegree.get(neighbor) ?? 0) - 1;
      inDegree.set(neighbor, newDegree);
      if (newDegree === 0) queue.push(neighbor);
    }
  }

  // If visited < total nodes, there's a cycle
  if (visited < nodes.length) {
    return [...inDegree].filter(([, d]) => d > 0).map(([id]) => id);
  }

  return [];
}

// ── Internal: Reachability ─────────────────────────────────────────────────────

/**
 * Check if there's a path from source to target
 */
function isReachable(nodes: FlatNode[], source: string, target: string): boolean {
  if (source === target) return true;
  const adj = new Map<string, string[]>();
  for (const n of nodes) {
    if (!adj.has(n.id)) adj.set(n.id, []);
  }
  for (const n of nodes) {
    for (const dep of n.deps) {
      if (!adj.has(dep)) adj.set(dep, []);
      adj.get(dep)!.push(n.id);
    }
  }

  const visited = new Set<string>();
  const queue: string[] = [source];

  while (queue.length > 0) {
    const node = queue.shift()!;
    if (visited.has(node)) continue;
    visited.add(node);
    if (node === target) return true;
    for (const next of adj.get(node) ?? []) {
      if (!visited.has(next)) queue.push(next);
    }
  }

  return false;
}

// ── Validation Functions ───────────────────────────────────────────────────────

/**
 * Validate that the DAG is acyclic
 */
export function validateAcyclic(g: Graph<any>): ValidationResult {
  const nodes = flattenGraph(g);
  const cycles = detectCycles(nodes);

  if (cycles.length === 0) {
    return { valid: true, errors: [] };
  }

  return {
    valid: false,
    errors: [
      `Cycle detected in DAG "${g.id}": nodes ${cycles.join(', ')} form a circular dependency. ` +
      `Ensure all dependencies are acyclic (no node can indirectly depend on itself).`,
    ],
  };
}

/**
 * Validate that init and term nodes exist and are distinct
 */
export function validateInitTermExists(g: Graph<any>): ValidationResult {
  const nodeIds = new Set(Object.keys(g.nodes));
  const errors: string[] = [];

  if (!nodeIds.has(g.init)) {
    errors.push(
      `Init node "${g.init}" does not exist in DAG "${g.id}". ` +
      `Define a node with id="${g.init}" or change the init field.`
    );
  }

  if (!nodeIds.has(g.term)) {
    errors.push(
      `Term node "${g.term}" does not exist in DAG "${g.id}". ` +
      `Define a node with id="${g.term}" or change the term field.`
    );
  }

  if (g.init === g.term && g.init !== undefined) {
    errors.push(
      `Init and term nodes must be distinct. Both are "${g.init}". ` +
      `Define separate init and term nodes.`
    );
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validate that all nodes are reachable from init and can reach term
 */
export function validateReachability(g: Graph<any>): ValidationResult {
  const nodes = flattenGraph(g);
  const nodeIds = new Set(nodes.map(n => n.id));
  const errors: string[] = [];

  // Check init → term reachability
  if (!isReachable(nodes, g.init, g.term)) {
    errors.push(
      `Init node "${g.init}" cannot reach term node "${g.term}" in DAG "${g.id}". ` +
      `Ensure there is a path of dependencies from init to term.`
    );
  }

  // Check all nodes are reachable from init
  for (const n of nodes) {
    if (n.id === g.init) continue;
    if (!isReachable(nodes, g.init, n.id)) {
      errors.push(
        `Node "${n.id}" is unreachable from init "${g.init}" in DAG "${g.id}". ` +
        `Either connect it via dependencies or remove it.`
      );
    }
  }

  // Check all nodes can reach term
  for (const n of nodes) {
    if (n.id === g.term) continue;
    if (!isReachable(nodes, n.id, g.term)) {
      errors.push(
        `Node "${n.id}" cannot reach term "${g.term}" in DAG "${g.id}". ` +
        `Ensure there is a path of dependencies from it to term.`
      );
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validate phase ordering: make → validate → brief → execute → term
 * Nodes cannot depend on nodes in later phases.
 */
export function validatePhaseOrdering(g: Graph<any>): ValidationResult {
  const nodes = flattenGraph(g);
  const nodeMap = new Map(nodes.map(n => [n.id, n]));
  const errors: string[] = [];

  for (const node of nodes) {
    const nodePhase = node.phase;
    const nodePhaseOrder = phaseOrder(nodePhase);

    for (const dep of node.deps) {
      const depNode = nodeMap.get(dep);
      if (!depNode) continue;

      const depPhaseOrder = phaseOrder(depNode.phase);

      // Dependency must be in an equal or earlier phase
      if (depPhaseOrder > nodePhaseOrder) {
        errors.push(
          `Phase ordering violation in DAG "${g.id}": node "${node.id}" (${nodePhase}) ` +
          `depends on "${dep}" (${depNode.phase}). ` +
          `Phase order must be: make → validate → brief → execute → term. ` +
          `A node cannot depend on a node in a later phase.`
        );
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validate node-level consistency: phase types, validate arrays, etc.
 */
export function validateNodeConsistency(g: Graph<any>): ValidationResult {
  const errors: string[] = [];

  for (const node of Object.values(g.nodes) as any[]) {
    // Validate phase is valid
    if (node.phase !== undefined) {
      const validPhases = ['make', 'validate', 'brief', 'execute', 'term'];
      if (!validPhases.includes(node.phase)) {
        errors.push(
          `Node "${node.id}" has invalid phase "${node.phase}". ` +
          `Valid phases are: ${validPhases.join(', ')}.`
        );
      }
    }

    // Validate array must exist
    if (!Array.isArray(node.validate)) {
      errors.push(
        `Node "${node.id}" validate field must be an array, got ${typeof node.validate}. ` +
        `Provide at least an empty array [].`
      );
    }

    // validate array should not be empty (best practice)
    if (Array.isArray(node.validate) && node.validate.length === 0 && node.id !== g.term) {
      // Term nodes may have empty validate. Other nodes should have at least one rule.
      // This is a warning, not an error for now.
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Recursively validate a DAG at all levels:
 * 1. Acyclicity
 * 2. Init/term existence
 * 3. Reachability
 * 4. Phase ordering
 * 5. Node consistency
 *
 * Returns aggregated validation result.
 */
export function recursivelyValidate(g: Graph<any>): ValidationResult {
  const allErrors: string[] = [];

  // Run all validation checks
  const checks = [
    validateAcyclic(g),
    validateInitTermExists(g),
    validateReachability(g),
    validatePhaseOrdering(g),
    validateNodeConsistency(g),
  ];

  for (const check of checks) {
    allErrors.push(...check.errors);
  }

  // If there are errors, return them all
  if (allErrors.length > 0) {
    return {
      valid: false,
      errors: allErrors,
    };
  }

  return {
    valid: true,
    errors: [],
  };
}

/**
 * Legacy: findTerminalNodes — find nodes with no downstream dependents.
 * Used for checking that terminal intent gates exist.
 */
export function findTerminalNodes<T extends string>(g: Graph<T>): string[] {
  const nodes = Object.values(g.nodes) as Array<{ id: string; deps: readonly string[] }>;
  const hasDependents = new Set<string>();
  for (const n of nodes) {
    for (const dep of n.deps) {
      hasDependents.add(dep);
    }
  }
  return nodes.filter(n => !hasDependents.has(n.id)).map(n => n.id);
}

/**
 * Legacy: validateTerminalIntentGate, validateInitIntentGate, validateStackedTermGates
 * Preserved for backward compatibility.
 */
export interface TerminalIntentError {
  type: 'missing-terminal-intent';
  node: string;
  message: string;
  fix: string;
}

export interface InitIntentError {
  type: 'missing-init-intent' | 'init-gate-no-expand-on-fail';
  node: string;
  message: string;
  fix: string;
}

export interface StackedTermGateError {
  type: 'invalid-stacked-gates' | 'gate-missing-checks';
  gates?: any[];
  message: string;
  fix: string;
}

export function findInitBoundary<T extends string>(g: Graph<T>): string[] {
  const nodes = Object.values(g.nodes) as Array<{ id: string; deps: readonly string[] }>;
  return nodes
    .filter(n => n.deps.includes(g.init as string))
    .map(n => n.id)
    .sort();
}

export function validateTerminalIntentGate<T extends string>(_g: Graph<T>): TerminalIntentError | null {
  // Terminal audit gate (computed sections + gap detection) runs automatically
  // in bin/roadmap.ts when advancing terminal nodes. Explicit intent rules
  // on terminal nodes are no longer required.
  return null;
}

export function validateInitIntentGate<T extends string>(g: Graph<T>): InitIntentError | null {
  const initBoundary = findInitBoundary(g);

  if (initBoundary.length === 0) {
    return {
      type: 'missing-init-intent',
      node: g.init as string,
      message: `DAG missing init boundary — no nodes depend directly on init`,
      fix: 'Add at least one node that depends on init and includes an intent gate',
    };
  }

  for (const nodeId of initBoundary) {
    const node = (g.nodes as Record<string, { validate: readonly ValidationRule[] }>)[nodeId];
    if (!node) continue;

    const intentRule = node.validate?.find(
      (r: ValidationRule) => r.type === 'intent'
    ) as any;

    if (intentRule) {
      const statement = (intentRule.statement ?? '').toLowerCase();
      const hasContextKeyword = /plan|clarity|unambiguous/.test(statement);

      if (!intentRule.expandOnFail) {
        return {
          type: 'init-gate-no-expand-on-fail',
          node: nodeId,
          message: `Init boundary node '${nodeId}' intent rule must have expandOnFail: true`,
          fix: 'Set expandOnFail: true on the intent rule to enable expansion when clarity is uncertain',
        };
      }

      if (hasContextKeyword) {
        return null;
      }
    }
  }

  return {
    type: 'missing-init-intent',
    node: initBoundary[0],
    message: `Init boundary node '${initBoundary[0]}' requires an intent rule with expandOnFail: true and mention of plan/clarity/unambiguous`,
    fix: 'Add an intent gate on an init-adjacent node with a statement mentioning planning or clarity',
  };
}

export function validateStackedTermGates(gates: readonly any[] | undefined): StackedTermGateError | null {
  if (!gates || gates.length === 0) {
    return null;
  }

  const reviewerRoles = new Set<string>();

  for (const gate of gates) {
    if (reviewerRoles.has(gate.reviewer)) {
      return {
        type: 'invalid-stacked-gates',
        gates: gates as any[],
        message: `Duplicate reviewer role: '${gate.reviewer}' appears in multiple term gates`,
        fix: 'Each term gate should have a distinct reviewer role (e.g., "Visual Engineer", "Feature Engineer")',
      };
    }
    reviewerRoles.add(gate.reviewer);

    if (!gate.checks || gate.checks.length === 0) {
      return {
        type: 'gate-missing-checks',
        gates: gates as any[],
        message: `Term gate '${gate.id}' (${gate.reviewer}) has no validation checks`,
        fix: `Add validation rules to the '${gate.id}' gate that verify "${gate.validates}"`,
      };
    }
  }

  return null;
}
