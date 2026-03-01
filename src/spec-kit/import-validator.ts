// @module spec-kit
// @exports validateImportFormat
// @types ImportValidationResult
// @entry roadmap/spec-kit

// Pre-parse validation for spec-kit tasks.md files.
// Catches format errors before parseTasksMd processes the content.
// Supports both YAML block format and [P<n>] bullet format.

import { readFileSync } from 'node:fs';
import type { ValidationResult } from './validation.ts';

const NODE_ID_PATTERN = /^[a-zA-Z][a-zA-Z0-9-]*$/;
const YAML_BLOCK_RE = /^```yaml\n([\s\S]*?)\n```/gm;
const TASK_RE = /^[-*]\s+\[P(\d+)\]\s+(\S+):\s*(.+)$/;

const YAML_KNOWN_KEYS = new Set([
  'nodeId', 'description', 'produces', 'consumes',
  'dependencies', 'validate', 'mode',
]);

/** Validate a spec-kit tasks.md file format before import. */
export function validateImportFormat(tasksPath: string): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  let content: string;
  try {
    content = readFileSync(tasksPath, 'utf-8');
  } catch {
    return { ok: false, errors: [`Cannot read tasks file: ${tasksPath}`], warnings };
  }

  if (!content.trim()) {
    return { ok: false, errors: ['Tasks file is empty'], warnings };
  }

  // Detect format
  const yamlBlocks = [...content.matchAll(YAML_BLOCK_RE)];
  const bulletLines = content.split('\n').filter(l => TASK_RE.test(l));

  if (yamlBlocks.length === 0 && bulletLines.length === 0) {
    return { ok: false, errors: ['No tasks found — expected YAML blocks (```yaml...```) or bullet format (- [P0] id: desc)'], warnings };
  }

  if (yamlBlocks.length > 0 && bulletLines.length > 0) {
    warnings.push('Mixed formats detected: YAML blocks and [P<n>] bullets. YAML blocks take precedence.');
  }

  const nodeIds = new Set<string>();
  const allDeps: Array<{ fromId: string; dep: string }> = [];

  if (yamlBlocks.length > 0) {
    validateYamlBlocks(yamlBlocks, errors, warnings, nodeIds, allDeps);
  } else {
    validateBulletFormat(content, errors, warnings, nodeIds, allDeps);
  }

  // Cross-node checks (only if we found valid nodes)
  if (nodeIds.size > 0) {
    // Orphan dependency check
    for (const { fromId, dep } of allDeps) {
      if (!nodeIds.has(dep)) {
        errors.push(`Node "${fromId}": dependency "${dep}" not defined`);
      }
    }

    // Acyclicity (Kahn's)
    if (errors.length === 0) {
      const cycleError = detectCycle(nodeIds, allDeps);
      if (cycleError) errors.push(cycleError);
    }
  }

  return { ok: errors.length === 0, errors, warnings };
}

// --- YAML block validation ---

function validateYamlBlocks(
  blocks: RegExpMatchArray[],
  errors: string[],
  warnings: string[],
  nodeIds: Set<string>,
  allDeps: Array<{ fromId: string; dep: string }>,
): void {
  for (let blockIdx = 0; blockIdx < blocks.length; blockIdx++) {
    const raw = blocks[blockIdx][1];
    const label = `YAML block ${blockIdx + 1}`;
    const lines = raw.split('\n');

    let nodeId: string | null = null;
    let hasDescription = false;
    let hasProduces = false;
    let hasConsumes = false;
    let hasDeps = false;
    let hasMode = false;
    const deps: string[] = [];

    let inArray: string | null = null;

    for (const line of lines) {
      if (!line.trim() || line.startsWith('#')) continue;

      const indent = line.match(/^(\s*)/)?.[1].length || 0;
      const trimmed = line.trim();

      if (indent === 0) {
        inArray = null;
        const kv = trimmed.match(/^(\w+):\s*(.*)$/);
        if (!kv) {
          warnings.push(`${label}: unparseable line "${trimmed}"`);
          continue;
        }

        const [, key, value] = kv;

        if (!YAML_KNOWN_KEYS.has(key)) {
          warnings.push(`${label}: unknown key "${key}"`);
        }

        if (key === 'nodeId') {
          nodeId = value.trim();
          if (!nodeId) {
            errors.push(`${label}: nodeId is empty`);
          } else if (!NODE_ID_PATTERN.test(nodeId)) {
            errors.push(`${label}: nodeId "${nodeId}" invalid (alphanumeric + hyphens only, must start with letter)`);
          } else if (nodeIds.has(nodeId)) {
            errors.push(`Duplicate nodeId: "${nodeId}"`);
          } else {
            nodeIds.add(nodeId);
          }
        } else if (key === 'description') {
          hasDescription = true;
        } else if (key === 'produces') {
          hasProduces = true;
          if (value === '') inArray = 'produces';
        } else if (key === 'consumes') {
          hasConsumes = true;
          if (value === '') inArray = 'consumes';
        } else if (key === 'dependencies') {
          hasDeps = true;
          if (value === '') {
            inArray = 'dependencies';
          } else if (value.startsWith('[') && value.endsWith(']')) {
            const items = value.slice(1, -1).split(',').map(s => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
            deps.push(...items);
          }
        } else if (key === 'mode') {
          hasMode = true;
          const v = value.trim();
          if (v !== 'execute' && v !== 'plan') {
            warnings.push(`${label}: mode should be "execute" or "plan", got "${v}"`);
          }
        }
      } else if (indent >= 2 && inArray && trimmed.startsWith('-')) {
        const item = trimmed.slice(1).trim().replace(/^["']|["']$/g, '');
        if (inArray === 'dependencies' && item) deps.push(item);
      }
    }

    const id = nodeId || label;
    if (!nodeId) errors.push(`${label}: missing nodeId`);
    if (!hasDescription) warnings.push(`${id}: missing description`);
    if (!hasProduces) warnings.push(`${id}: missing produces`);
    if (!hasConsumes) warnings.push(`${id}: missing consumes`);
    if (!hasDeps) warnings.push(`${id}: missing dependencies`);
    if (!hasMode) warnings.push(`${id}: missing mode (defaults to execute)`);

    // Validate dep IDs format
    for (const dep of deps) {
      if (!NODE_ID_PATTERN.test(dep)) {
        errors.push(`${id}: dependency "${dep}" is not a valid node ID`);
      }
    }

    if (nodeId) {
      for (const dep of deps) allDeps.push({ fromId: nodeId, dep });
    }
  }
}

// --- Bullet format validation ---

function validateBulletFormat(
  content: string,
  errors: string[],
  warnings: string[],
  nodeIds: Set<string>,
  allDeps: Array<{ fromId: string; dep: string }>,
): void {
  const lines = content.split('\n');
  let currentId: string | null = null;

  for (const line of lines) {
    const taskMatch = line.match(TASK_RE);
    if (taskMatch) {
      const id = taskMatch[2];
      if (!NODE_ID_PATTERN.test(id)) {
        errors.push(`Task "${id}": invalid ID (alphanumeric + hyphens only, must start with letter)`);
      }
      if (nodeIds.has(id)) {
        errors.push(`Duplicate task ID: "${id}"`);
      }
      nodeIds.add(id);
      currentId = id;
      continue;
    }

    if (!currentId) continue;

    const propMatch = line.match(/^\s+[-*]\s+(depends|produces|consumes|mode|validate):\s*(.+)$/);
    if (!propMatch) continue;

    const [, key, value] = propMatch;
    if (key === 'depends') {
      const items = value.split(',').map(s => s.trim()).filter(Boolean);
      for (const dep of items) {
        if (!NODE_ID_PATTERN.test(dep)) {
          errors.push(`Task "${currentId}": dependency "${dep}" is not a valid ID`);
        }
        allDeps.push({ fromId: currentId, dep });
      }
    } else if (key === 'mode') {
      const v = value.trim();
      if (v !== 'execute' && v !== 'plan') {
        warnings.push(`Task "${currentId}": mode should be "execute" or "plan", got "${v}"`);
      }
    }
  }
}

// --- Cycle detection (Kahn's algorithm) ---

function detectCycle(
  nodeIds: Set<string>,
  allDeps: Array<{ fromId: string; dep: string }>,
): string | null {
  const inDegree = new Map<string, number>();
  const adj = new Map<string, string[]>();

  for (const id of nodeIds) {
    inDegree.set(id, 0);
    adj.set(id, []);
  }

  for (const { fromId, dep } of allDeps) {
    if (!adj.has(dep) || !inDegree.has(fromId)) continue;
    adj.get(dep)!.push(fromId);
    inDegree.set(fromId, (inDegree.get(fromId) ?? 0) + 1);
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

  if (visited < nodeIds.size) {
    const cycleNodes = [...inDegree.entries()]
      .filter(([, deg]) => deg > 0)
      .map(([id]) => id);
    return `Dependency cycle detected involving: ${cycleNodes.join(', ')}`;
  }

  return null;
}
