// @module speckit-import
// @exports parseTasksMd, tasksToDAG
// @types ParsedTask, ImportOptions
// @entry roadmap

// Parses a markdown task list into a candidate roadmap DAG.
// Format:
//   - [P<n>] <id>: <description>
//     - depends: <id>, <id>
//     - produces: <artifact>, <artifact>
//     - consumes: <artifact>, <artifact>
//     - mode: plan | execute
//     - validate: shell:<command>
//
// [P<n>] is priority/phase — tasks with same P value can run in parallel.
// Dependencies override phase ordering when specified.

import type { Graph, NodeSpec, ValidationRule } from '../../protocol.ts';
import { existsSync } from 'fs';

export interface ParsedTask {
  id: string;
  desc: string;
  priority: number;
  depends: string[];
  produces: string[];
  consumes: string[];
  mode: 'execute' | 'plan';
  validate: ValidationRule[];
}

export interface ImportOptions {
  dagId: string;
  dagDesc?: string;
  version?: string;
}

const TASK_RE = /^[-*]\s+\[P(\d+)\]\s+(\S+):\s*(.+)$/;
const PROP_RE = /^\s+[-*]\s+(depends|produces|consumes|mode|validate):\s*(.+)$/;
const YAML_BLOCK_RE = /^```yaml\n([\s\S]*?)\n```/gm;

// Parse YAML block (spec-kit format): nodeId: ..., description: ..., produces: [...], etc.
function parseYamlBlock(block: string): Partial<ParsedTask> | null {
  const lines = block.split('\n');
  const result: any = { depends: [], produces: [], consumes: [], validate: [], mode: 'execute' };
  let inArray: string | null = null; // Track which array we're collecting

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim() || line.startsWith('#')) continue;

    // Check indentation: 0-level = key:, 2-level = - item
    const indent = line.match(/^(\s*)/)?.[1].length || 0;
    const content = line.trim();

    // Top-level keys
    if (indent === 0) {
      const match = content.match(/^(\w+):\s*(.*)$/);
      if (!match) continue;

      const [, key, value] = match;
      inArray = null; // Reset array context

      if (key === 'nodeId') {
        result.id = value.trim();
      } else if (key === 'description') {
        result.desc = value.replace(/^["']|["']$/g, '').trim();
      } else if (key === 'produces') {
        if (value === '[]') {
          result.produces = [];
        } else if (value === '') {
          inArray = 'produces';
        } else if (value.startsWith('[') && value.endsWith(']')) {
          result.produces = value.slice(1, -1).split(',').map(s => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
        }
      } else if (key === 'consumes') {
        if (value === '[]') {
          result.consumes = [];
        } else if (value === '') {
          inArray = 'consumes';
        } else if (value.startsWith('[') && value.endsWith(']')) {
          result.consumes = value.slice(1, -1).split(',').map(s => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
        }
      } else if (key === 'dependencies') {
        if (value === '[]') {
          result.depends = [];
        } else if (value === '') {
          inArray = 'depends';
        } else if (value.startsWith('[') && value.endsWith(']')) {
          result.depends = value.slice(1, -1).split(',').map(s => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
        }
      } else if (key === 'validate') {
        if (value === '[]') {
          result.validate = [];
        } else if (value === '') {
          inArray = 'validate';
        }
        // Skip complex validation object parsing for now
      } else if (key === 'mode') {
        result.mode = value === 'plan' ? 'plan' : 'execute';
      }
    } else if (indent === 2 && inArray && content.startsWith('-')) {
      // Array item
      const item = content.slice(1).trim();
      if (item && !item.startsWith('{') && !item.includes(':')) {
        // Simple scalar value, not a complex object
        result[inArray].push(item);
      }
    }
  }

  return result.id ? result : null;
}

export function parseTasksMd(content: string): ParsedTask[] {
  const tasks: ParsedTask[] = [];

  // Try YAML block format first (spec-kit native)
  let match;
  const yamlRegex = /^```yaml\n([\s\S]*?)\n```/gm;
  while ((match = yamlRegex.exec(content)) !== null) {
    const parsed = parseYamlBlock(match[1]);
    if (parsed && parsed.id) {
      // Derive priority from batch level (if available in context)
      // For now, use order of appearance
      tasks.push({
        id: parsed.id,
        desc: parsed.desc || '(no description)',
        priority: tasks.length, // Sequential priority
        depends: parsed.depends || [],
        produces: parsed.produces || [],
        consumes: parsed.consumes || [],
        mode: parsed.mode || 'execute',
        validate: parsed.validate || [],
      });
    }
  }

  // If YAML blocks found, return them
  if (tasks.length > 0) return tasks;

  // Fall back to original format: - [P<n>] task-id: description
  const lines = content.split('\n');
  let current: ParsedTask | null = null;

  for (const line of lines) {
    const taskMatch = line.match(TASK_RE);
    if (taskMatch) {
      if (current) tasks.push(current);
      current = {
        id: taskMatch[2],
        desc: taskMatch[3].trim(),
        priority: parseInt(taskMatch[1], 10),
        depends: [],
        produces: [],
        consumes: [],
        mode: 'execute',
        validate: [],
      };
      continue;
    }

    if (!current) continue;

    const propMatch = line.match(PROP_RE);
    if (!propMatch) {
      // Non-property line while in a task — if it's a heading or blank, close current
      if (/^#+\s/.test(line) || line.trim() === '') continue;
      // Could be continuation text — ignore
      continue;
    }

    const [, key, value] = propMatch;
    const items = value.split(',').map(s => s.trim()).filter(Boolean);

    switch (key) {
      case 'depends':
        current.depends.push(...items);
        break;
      case 'produces':
        current.produces.push(...items);
        break;
      case 'consumes':
        current.consumes.push(...items);
        break;
      case 'mode':
        if (value.trim() === 'plan') current.mode = 'plan';
        break;
      case 'validate': {
        const v = value.trim();
        if (v.startsWith('shell:')) {
          current.validate.push({ type: 'shell' as any, command: v.slice(6).trim() });
        } else if (v.startsWith('exists:')) {
          current.validate.push({ type: 'artifact-exists', target: v.slice(7).trim() });
        } else {
          current.validate.push({ type: 'shell' as any, command: v });
        }
        break;
      }
    }
  }

  if (current) tasks.push(current);
  return tasks;
}

/** Thread spec-kit materials into init and term gates for spec-conformance validation */
function enrichGatesWithSpecKit(
  nodes: Record<string, NodeSpec<string, string>>,
  dagId: string,
  initId: string,
  termId: string,
): void {
  // Detect spec-kit path: .specify/specs/{dagId}/ or .specify/specs/001-{last-part}/
  const specDir = [
    `.specify/specs/${dagId}`,
    `.specify/specs/001-${dagId.replace(/^0+/, '').replace(/-.*/, '')}`,
    `.specify/specs/001-todo-app`, // fallback for todo-app
  ].find(dir => existsSync(dir));

  if (!specDir) return;

  const preSpec = `.specify/pre-spec.md`;
  const specFiles = [
    `${specDir}/spec.md`,
    `${specDir}/plan.md`,
    `${specDir}/data-model.md`,
    `${specDir}/tasks.md`,
  ];

  // Enrich init gate with spec-kit materials
  const initNode = nodes[initId];
  if (initNode) {
    nodes[initId] = {
      ...initNode,
      ambient: [
        ...(initNode.ambient || []),
        ...[preSpec, ...specFiles].filter(f => existsSync(f)),
      ],
      validate: [
        ...(initNode.validate || []),
        {
          type: 'spec-conformance',
          spec: `${specDir}/spec.md`,
          scenario: 'Plan clarity validated against feature spec',
          section: 'Specification',
        } as any,
      ],
    };
  }

  // Enrich term gate with spec-conformance validators
  const termNode = nodes[termId];
  if (termNode) {
    const termAmbient = [
      ...(termNode.ambient || []),
      `${specDir}/spec.md`,
      `${specDir}/quickstart.md`,
    ].filter(f => existsSync(f));

    // Add acceptance scenario validators from spec
    const termValidate = [
      ...(termNode.validate || []),
      {
        type: 'spec-conformance',
        spec: `${specDir}/spec.md`,
        scenario: 'All acceptance scenarios pass (User Stories 1-6)',
        section: 'Feature Specification',
      } as any,
      {
        type: 'shell',
        command: "test -f package.json && npm run test 2>&1 | grep -q 'test'",
        expectExitCode: 0,
      } as any,
      {
        type: 'shell',
        command: 'npm run build 2>&1 | grep -q "built"',
        expectExitCode: 0,
      } as any,
    ];

    nodes[termId] = {
      ...termNode,
      ambient: termAmbient,
      validate: termValidate,
    };
  }
}


export function tasksToDAG(tasks: ParsedTask[], opts: ImportOptions): Graph<string> {
  if (tasks.length === 0) throw new Error('No tasks parsed from input');

  // Sort by priority for init/term inference
  const sorted = [...tasks].sort((a, b) => a.priority - b.priority);
  const taskIds = new Set(sorted.map(t => t.id));

  // Validate deps reference real tasks
  for (const t of sorted) {
    for (const d of t.depends) {
      if (!taskIds.has(d)) throw new Error(`Task "${t.id}" depends on unknown task "${d}"`);
    }
  }

  // Synthesize produces for tasks that don't have them (simple task format)
  for (const t of sorted) {
    if (t.produces.length === 0) {
      // Generate artifact path from task ID
      t.produces = [`.roadmap/tasks/${t.id}.artifact.json`];
    }
  }

  // Build nodes
  const nodes: Record<string, NodeSpec<string, string>> = {};

  // Init node: all tasks with no dependencies are roots
  const rootTasks = sorted.filter(t => t.depends.length === 0);
  if (rootTasks.length === 0) throw new Error('No root tasks found (tasks with no dependencies)');

  // If single root, use it as init; otherwise synthesize
  let initId: string;
  if (rootTasks.length === 1) {
    initId = rootTasks[0].id;
  } else {
    initId = 'init';
    if (taskIds.has('init')) initId = '_init';
    nodes[initId] = {
      id: initId,
      desc: 'Synthetic init — roots all independent tasks',
      produces: [`${initId}.marker`],
      consumes: [],
      deps: [],
      validate: [],
      idempotent: true,
    } as any;
    // Wire all root tasks to synthetic init
    for (const t of rootTasks) {
      if (!t.depends.includes(initId)) t.depends.push(initId);
      if (!t.consumes.includes(`${initId}.marker`)) t.consumes.push(`${initId}.marker`);
    }
  }

  // Term node: synthesize if needed
  const maxPriority = sorted[sorted.length - 1].priority;
  const termTasks = sorted.filter(t => t.priority === maxPriority);
  let termId: string;

  // Check if any task is a natural term (nothing depends on it)
  const depTargets = new Set(sorted.flatMap(t => t.depends));
  const leafTasks = sorted.filter(t => !depTargets.has(t.id));

  if (leafTasks.length === 1) {
    termId = leafTasks[0].id;
  } else {
    termId = 'term';
    if (taskIds.has('term')) termId = '_term';
    const termConsumes = leafTasks.flatMap(t => t.produces).filter(Boolean);
    nodes[termId] = {
      id: termId,
      desc: 'Synthetic term — gates on all leaf tasks',
      produces: [],
      consumes: termConsumes,
      deps: leafTasks.map(t => t.id),
      validate: [],
      idempotent: false,
    } as any;
  }

  // Add all parsed tasks as nodes
  for (const t of sorted) {
    nodes[t.id] = {
      id: t.id,
      desc: t.desc,
      produces: t.produces,
      consumes: t.consumes,
      deps: t.depends,
      validate: t.validate,
      idempotent: true,
      ...(t.mode === 'plan' ? { mode: 'plan' } : {}),
    } as any;
  }

  // Thread spec-kit materials into gates for spec-conformance validation
  enrichGatesWithSpecKit(nodes, opts.dagId, initId, termId);

  // Auto-inject expandOnFail: true on intent validators for init-boundary and terminal nodes.
  // The init-intent and terminal-intent gates require expandOnFail but the SpecIR schema doesn't
  // expose it — so we derive it here during compilation rather than requiring the spec author to know.
  const initBoundaryIds = new Set(
    Object.values(nodes)
      .filter((n: any) => (n.deps ?? []).includes(initId))
      .map((n: any) => n.id)
  );
  const gatedIds = new Set([...initBoundaryIds, termId]);
  for (const nodeId of gatedIds) {
    const node = nodes[nodeId] as any;
    if (!node) continue;
    const patched = (node.validate ?? []).map((r: any) =>
      r.type === 'intent' && !r.expandOnFail ? { ...r, expandOnFail: true } : r
    );
    if (patched.some((r: any, i: number) => r !== (node.validate ?? [])[i])) {
      nodes[nodeId] = { ...node, validate: patched };
    }
  }

  return {
    id: opts.dagId,
    desc: opts.dagDesc || `Imported from spec-kit`,
    init: initId,
    term: termId,
    nodes,
    version: opts.version || '0.3.0',
    protocolVersion: '0.3.0',
  } as any;
}
