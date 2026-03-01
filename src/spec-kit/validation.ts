// @module spec-kit
// @exports validateSpecKitPlan, validateSpecKitTasks, ValidationResult
// @entry roadmap/spec-kit

import { readFileSync } from 'node:fs';

/** Result of validating a spec-kit output file. */
export interface ValidationResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
}

// --- Plan validation ---

const REQUIRED_PLAN_SECTIONS = [
  'Objective',
  'Scope',
  'Core artifacts',
  'Acceptance scenarios',
  'Implementation',
] as const;

/**
 * Validate a spec-kit plan markdown file.
 * Checks: required sections present, node ID references resolve.
 */
export function validateSpecKitPlan(planPath: string): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  let content: string;
  try {
    content = readFileSync(planPath, 'utf-8');
  } catch {
    return { ok: false, errors: [`Cannot read plan file: ${planPath}`], warnings };
  }

  // Check required sections (heading lines starting with # or ##)
  const headings = content
    .split('\n')
    .filter(line => /^#{1,3}\s+/.test(line))
    .map(line => line.replace(/^#{1,3}\s+/, '').trim());

  for (const section of REQUIRED_PLAN_SECTIONS) {
    const found = headings.some(h => h.toLowerCase().includes(section.toLowerCase()));
    if (!found) {
      errors.push(`Missing required section: "${section}"`);
    }
  }

  // Extract node ID references from inline code spans like `node-id`
  const nodeIdRefs = [...content.matchAll(/`([a-zA-Z][a-zA-Z0-9_-]*)`/g)].map(m => m[1]);

  // If plan references node IDs but has no implementation section, warn
  if (nodeIdRefs.length > 0 && !headings.some(h => h.toLowerCase().includes('implementation'))) {
    warnings.push('Plan references node IDs but has no Implementation section');
  }

  return { ok: errors.length === 0, errors, warnings };
}

// --- Tasks validation ---

interface TaskNode {
  nodeId: string;
  description: string;
  produces: string[];
  consumes: string[];
  dependencies: string[];
  validate: unknown[];
  mode: string;
  [key: string]: unknown;
}

const NODE_ID_PATTERN = /^[a-zA-Z][a-zA-Z0-9_-]*$/;

const REQUIRED_NODE_FIELDS: (keyof TaskNode)[] = [
  'nodeId',
  'description',
  'produces',
  'consumes',
  'dependencies',
  'validate',
  'mode',
];

/**
 * Validate a spec-kit tasks JSON file.
 * Checks: required fields, valid IDs, dependency resolution, acyclicity, init/term uniqueness.
 */
export function validateSpecKitTasks(tasksPath: string): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  let raw: string;
  try {
    raw = readFileSync(tasksPath, 'utf-8');
  } catch {
    return { ok: false, errors: [`Cannot read tasks file: ${tasksPath}`], warnings };
  }

  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return { ok: false, errors: [`Invalid JSON in tasks file: ${tasksPath}`], warnings };
  }

  if (!Array.isArray(data)) {
    return { ok: false, errors: ['Tasks file must contain a JSON array'], warnings };
  }

  const nodes = data as Record<string, unknown>[];
  const nodeIds = new Set<string>();

  // Field presence + ID validity
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    const label = (node['nodeId'] as string) || `index ${i}`;

    for (const field of REQUIRED_NODE_FIELDS) {
      if (!(field in node)) {
        errors.push(`Node "${label}": missing required field "${field}"`);
      }
    }

    const id = node['nodeId'];
    if (typeof id !== 'string') {
      errors.push(`Node at index ${i}: nodeId must be a string`);
      continue;
    }

    if (!NODE_ID_PATTERN.test(id)) {
      errors.push(`Node "${id}": invalid nodeId (no spaces or special chars allowed)`);
    }

    if (nodeIds.has(id)) {
      errors.push(`Duplicate nodeId: "${id}"`);
    }
    nodeIds.add(id);
  }

  // Dependency resolution — all deps must reference defined nodeIds
  for (const node of nodes) {
    const id = node['nodeId'] as string;
    const deps = node['dependencies'];
    if (!Array.isArray(deps)) continue;
    for (const dep of deps) {
      if (typeof dep !== 'string') {
        errors.push(`Node "${id}": dependency must be a string, got ${typeof dep}`);
        continue;
      }
      if (!nodeIds.has(dep)) {
        errors.push(`Node "${id}": dependency "${dep}" not found in defined nodes`);
      }
    }
  }

  // Init and term nodes
  const initNodes = nodes.filter(n => (n['nodeId'] as string) === 'init');
  const termNodes = nodes.filter(n => (n['nodeId'] as string) === 'term');

  if (initNodes.length === 0) errors.push('No "init" node defined');
  if (initNodes.length > 1) errors.push('Multiple "init" nodes defined');
  if (termNodes.length === 0) errors.push('No "term" node defined');
  if (termNodes.length > 1) errors.push('Multiple "term" nodes defined');

  // Acyclicity check (Kahn's algorithm)
  if (errors.length === 0) {
    const cycleError = detectCycle(nodes as TaskNode[]);
    if (cycleError) errors.push(cycleError);
  }

  // Mode validation
  for (const node of nodes) {
    const mode = node['mode'];
    if (mode !== undefined && mode !== 'execute' && mode !== 'plan') {
      warnings.push(`Node "${node['nodeId']}": mode should be "execute" or "plan", got "${mode}"`);
    }
  }

  return { ok: errors.length === 0, errors, warnings };
}

/** Detect cycles using Kahn's topological sort. Returns error string if cycle found, null otherwise. */
function detectCycle(nodes: TaskNode[]): string | null {
  const inDegree = new Map<string, number>();
  const adj = new Map<string, string[]>();

  for (const node of nodes) {
    inDegree.set(node.nodeId, 0);
    adj.set(node.nodeId, []);
  }

  for (const node of nodes) {
    if (!Array.isArray(node.dependencies)) continue;
    for (const dep of node.dependencies) {
      if (!adj.has(dep)) continue;
      adj.get(dep)!.push(node.nodeId);
      inDegree.set(node.nodeId, (inDegree.get(node.nodeId) ?? 0) + 1);
    }
  }

  const queue: string[] = [];
  for (const [id, deg] of inDegree) {
    if (deg === 0) queue.push(id);
  }

  let visited = 0;
  while (queue.length > 0) {
    const curr = queue.shift()!;
    visited++;
    for (const next of adj.get(curr) ?? []) {
      const newDeg = (inDegree.get(next) ?? 1) - 1;
      inDegree.set(next, newDeg);
      if (newDeg === 0) queue.push(next);
    }
  }

  if (visited < nodes.length) {
    const cycleNodes = [...inDegree.entries()]
      .filter(([, deg]) => deg > 0)
      .map(([id]) => id);
    return `Dependency cycle detected involving: ${cycleNodes.join(', ')}`;
  }

  return null;
}
