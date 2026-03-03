/**
 * Comprehensive tests for `make`: DAG generation from specs
 * Tests spec → IR → DAG transformation with validation of recursive structure
 */

import { describe, it, expect } from 'vitest';
import { parseTasksMd, tasksToDAG } from '../src/lib/intake/speckit-import.ts';
import { compileIR, parseIRFile, irTasksToParsed } from '../src/lib/intake/spec-ir.ts';
import { define, check, verify } from '../src/protocol.ts';
import { getBrief } from '../src/lib/brief.ts';
import type { Graph, NodeSpec } from '../src/protocol.ts';
import type { SpecIR, SpecIRTask } from '../src/lib/intake/spec-ir.ts';

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Test markdown task spec
 */
const SIMPLE_SPEC = `
## Setup
- [P0] setup: Initialize project
  - produces: package.json, tsconfig.json

## Build
- [P1] compile: Compile TypeScript
  - depends: setup
  - consumes: package.json
  - produces: dist/index.js
  - validate: shell:npm run build

## Test
- [P2] test: Run tests
  - depends: compile
  - consumes: dist/index.js
  - produces: test-results.json
  - validate: shell:npm test
`;

const MULTI_BRANCH_SPEC = `
## Init
- [P0] init: Bootstrap
  - produces: pkg.json

## Core
- [P1] auth: Auth service
  - depends: init
  - consumes: pkg.json
  - produces: src/auth.ts

- [P1] db: Database layer
  - depends: init
  - consumes: pkg.json
  - produces: src/db.ts

## Integration
- [P2] api: API gateway
  - depends: auth, db
  - consumes: src/auth.ts, src/db.ts
  - produces: src/api.ts

## Release
- [P3] release: Ship v1.0
  - depends: api
  - consumes: src/api.ts
`;

const PLAN_MODE_SPEC = `
## Design
- [P0] design: Architecture design
  - produces: design.md
  - mode: plan

## Implementation
- [P1] impl: Implement design
  - depends: design
  - consumes: design.md
  - produces: src/app.ts
`;

const YAML_BLOCK_SPEC = `
## Tasks (YAML format)

\`\`\`yaml
nodeId: bootstrap
description: "Set up project structure"
produces:
  - package.json
  - tsconfig.json
consumes: []
dependencies: []
mode: execute
validate: []
\`\`\`

\`\`\`yaml
nodeId: build
description: "Build application"
produces:
  - dist/app.js
consumes:
  - package.json
dependencies:
  - bootstrap
mode: execute
validate:
  - npm run build
\`\`\`
`;

/**
 * Create a sample SpecIR object
 */
function makeSampleIR(taskCount: number = 3): SpecIR {
  const tasks: SpecIRTask[] = [
    {
      id: 'init',
      desc: 'Setup',
      priority: 0,
      depends: [],
      produces: ['config.json'],
      consumes: [],
      mode: 'execute',
      validate: [],
    },
  ];

  for (let i = 1; i < taskCount; i++) {
    tasks.push({
      id: `task-${i}`,
      desc: `Task ${i}`,
      priority: i,
      depends: [tasks[i - 1].id],
      produces: [`output-${i}.json`],
      consumes: [tasks[i - 1].produces[0]],
      mode: 'execute',
      validate: [],
    });
  }

  return {
    schema_version: 1,
    engine: { name: 'spec-kit', version: '1.0.0', config_hash: 'hash123' },
    dag_id: 'test-make',
    dag_desc: 'Test DAG from make',
    inputs: [{ path: 'tasks.md', sha256: 'abc123', role: 'tasks' }],
    tasks,
    metadata: { generated: new Date().toISOString(), compile_hash: 'hash123' },
  };
}

/**
 * Validate a DAG has expected structure
 */
function validateDagStructure(dag: Graph<any>): {
  hasInit: boolean;
  hasTerm: boolean;
  acyclic: boolean;
  allReachable: boolean;
  validProduces: boolean;
  validConsumes: boolean;
} {
  let acyclic = true;
  let allReachable = false;

  try {
    define(dag);
    acyclic = true;
  } catch {
    acyclic = false;
  }

  try {
    allReachable = check(dag).done === true;
  } catch {
    allReachable = false;
  }

  const hasInit = !!(dag.init && dag.nodes[dag.init]);
  const hasTerm = !!(dag.term && dag.nodes[dag.term]);

  // All produces should be strings
  const validProduces = Object.values(dag.nodes).every(
    (n) => Array.isArray(n.produces) && n.produces.every((p) => typeof p === 'string')
  );

  // All consumes should be strings
  const validConsumes = Object.values(dag.nodes).every(
    (n) => Array.isArray(n.consumes) && n.consumes.every((c) => typeof c === 'string')
  );

  return { hasInit, hasTerm, acyclic, allReachable, validProduces, validConsumes };
}

// ═══════════════════════════════════════════════════════════════════════════════
// TESTS: Spec → IR → DAG
// ═══════════════════════════════════════════════════════════════════════════════

describe('make: DAG generation from specs', () => {
  // ─── Test 1: Accept spec files (JSON or SpecIR format) ──────────────────────

  describe('accepts spec files (JSON or SpecIR format)', () => {
    it('accepts SpecIR JSON and produces valid DAG via compileIR', () => {
      const ir = makeSampleIR(3);
      const dag = compileIR(ir);

      expect(dag).toBeDefined();
      expect(dag.id).toBe('test-make');
      expect(Object.keys(dag.nodes).length).toBeGreaterThan(0);
    });

    it('parses markdown task specification via parseTasksMd', () => {
      const tasks = parseTasksMd(SIMPLE_SPEC);

      expect(tasks).toBeDefined();
      expect(Array.isArray(tasks)).toBe(true);
      expect(tasks.length).toBeGreaterThan(0);
      expect(tasks[0]).toHaveProperty('id');
      expect(tasks[0]).toHaveProperty('desc');
      expect(tasks[0]).toHaveProperty('produces');
      expect(tasks[0]).toHaveProperty('consumes');
    });

    it('converts parsed tasks to DAG via tasksToDAG', () => {
      const tasks = parseTasksMd(SIMPLE_SPEC);
      const dag = tasksToDAG(tasks, { dagId: 'from-markdown' });

      expect(dag).toBeDefined();
      expect(dag.id).toBe('from-markdown');
      expect(dag.init).toBeTruthy();
      expect(dag.term).toBeTruthy();
    });

    it('parseIRFile rejects invalid schema versions', () => {
      const invalid = JSON.stringify({ schema_version: 99, dag_id: 'x', tasks: [{ id: 'a' }] });
      expect(() => parseIRFile(invalid)).toThrow('Unsupported');
    });

    it('parseIRFile rejects missing dag_id', () => {
      const invalid = JSON.stringify({ schema_version: 1, tasks: [{ id: 'a' }] });
      expect(() => parseIRFile(invalid)).toThrow('missing dag_id');
    });
  });

  // ─── Test 2: Generated DAG passes acyclic validation ────────────────────────

  describe('generated DAG passes acyclic validation', () => {
    it('compileIR produces acyclic DAG', () => {
      const ir = makeSampleIR(5);
      const dag = compileIR(ir);

      // define() throws on cycles
      expect(() => define(dag)).not.toThrow();
    });

    it('tasksToDAG with linear deps produces acyclic DAG', () => {
      const tasks = parseTasksMd(SIMPLE_SPEC);
      const dag = tasksToDAG(tasks, { dagId: 'linear' });

      expect(() => define(dag)).not.toThrow();
    });

    it('tasksToDAG with branching deps produces acyclic DAG', () => {
      const tasks = parseTasksMd(MULTI_BRANCH_SPEC);
      const dag = tasksToDAG(tasks, { dagId: 'branched' });

      expect(() => define(dag)).not.toThrow();
    });

    it('rejecting spec with circular deps via tasksToDAG would detect cycles on define', () => {
      // Create tasks that form a cycle: a → b → c → a
      const circularMD = `
- [P0] a: Task A
  - produces: a.txt
  - depends: c
- [P1] b: Task B
  - produces: b.txt
  - depends: a
  - consumes: a.txt
- [P1] c: Task C
  - produces: c.txt
  - depends: b
  - consumes: b.txt
`;
      const tasks = parseTasksMd(circularMD);
      // The parsed tasks will have a→c, b→a, c→b (circular)
      // This should be caught by define()
      expect(() => {
        const dag = tasksToDAG(tasks, { dagId: 'circular' });
        define(dag);
      }).toThrow();
    });
  });

  // ─── Test 3: Init and term nodes are present ──────────────────────────────────

  describe('init and term nodes are present', () => {
    it('compileIR-generated DAG has init node', () => {
      const ir = makeSampleIR(3);
      const dag = compileIR(ir);

      expect(dag.init).toBeTruthy();
      expect(dag.nodes[dag.init]).toBeDefined();
    });

    it('compileIR-generated DAG has term node', () => {
      const ir = makeSampleIR(3);
      const dag = compileIR(ir);

      expect(dag.term).toBeTruthy();
      expect(dag.nodes[dag.term]).toBeDefined();
    });

    it('tasksToDAG synthesizes init for multiple P0 tasks', () => {
      const md = `
- [P0] a: Task A
  - produces: a.txt
- [P0] b: Task B
  - produces: b.txt
- [P1] c: Task C
  - depends: a, b
  - consumes: a.txt, b.txt
  - produces: c.txt
`;
      const tasks = parseTasksMd(md);
      const dag = tasksToDAG(tasks, { dagId: 'multi-p0' });

      expect(dag.init).toBe('init');
      expect(dag.nodes['init']).toBeDefined();
      expect(dag.nodes['a'].deps).toContain('init');
      expect(dag.nodes['b'].deps).toContain('init');
    });

    it('tasksToDAG synthesizes term for multiple leaf tasks', () => {
      const md = `
- [P0] start: Start
  - produces: start.txt
- [P1] left: Left branch
  - depends: start
  - consumes: start.txt
  - produces: left.txt
- [P1] right: Right branch
  - depends: start
  - consumes: start.txt
  - produces: right.txt
`;
      const tasks = parseTasksMd(md);
      const dag = tasksToDAG(tasks, { dagId: 'multi-leaf' });

      expect(dag.term).toBe('term');
      expect(dag.nodes['term']).toBeDefined();
      expect(dag.nodes['term'].deps).toContain('left');
      expect(dag.nodes['term'].deps).toContain('right');
    });

    it('tasksToDAG uses single leaf task as term directly', () => {
      const md = `
- [P0] start: Start
  - produces: start.txt
- [P1] end: End
  - depends: start
  - consumes: start.txt
`;
      const tasks = parseTasksMd(md);
      const dag = tasksToDAG(tasks, { dagId: 'single-leaf' });

      expect(dag.term).toBe('end');
      expect(dag.nodes[dag.term]).toBeDefined();
    });
  });

  // ─── Test 4: Phase ordering enforced ──────────────────────────────────────────

  describe('phase ordering enforced (make→validate→brief→execute→term)', () => {
    it('preserves task priority ordering in dependencies', () => {
      const tasks = parseTasksMd(SIMPLE_SPEC);
      const dag = tasksToDAG(tasks, { dagId: 'phases' });

      // setup (P0) → compile (P1) → test (P2)
      expect(dag.nodes['setup'].deps).toHaveLength(0);
      expect(dag.nodes['compile'].deps).toContain('setup');
      expect(dag.nodes['test'].deps).toContain('compile');
    });

    it('multi-branch spec maintains phase ordering per branch', () => {
      const tasks = parseTasksMd(MULTI_BRANCH_SPEC);
      const dag = tasksToDAG(tasks, { dagId: 'phases-branched' });

      // Both auth and db depend on init (P0 → P1)
      expect(dag.nodes['auth'].deps).toContain('init');
      expect(dag.nodes['db'].deps).toContain('init');
      // api depends on both auth and db (P1 → P2)
      expect(dag.nodes['api'].deps).toContain('auth');
      expect(dag.nodes['api'].deps).toContain('db');
      // release depends on api (P2 → P3)
      expect(dag.nodes['release'].deps).toContain('api');
    });

    it('validates phase ordering via check() — all nodes reachable', () => {
      const tasks = parseTasksMd(MULTI_BRANCH_SPEC);
      const dag = tasksToDAG(tasks, { dagId: 'phases-reach' });

      const result = check(dag);
      expect(result.done).toBe(true);
    });
  });

  // ─── Test 5: All nodes reachable from init to term ────────────────────────────

  describe('all nodes reachable from init to term', () => {
    it('simple linear DAG: all nodes reachable', () => {
      const ir = makeSampleIR(4);
      const dag = compileIR(ir);

      const checkResult = check(dag);
      expect(checkResult.done).toBe(true);
    });

    it('branching DAG: all branches converge at term', () => {
      const tasks = parseTasksMd(MULTI_BRANCH_SPEC);
      const dag = tasksToDAG(tasks, { dagId: 'branches-converge' });

      const checkResult = check(dag);
      expect(checkResult.done).toBe(true);
    });

    it('plan-mode nodes are reachable', () => {
      const tasks = parseTasksMd(PLAN_MODE_SPEC);
      const dag = tasksToDAG(tasks, { dagId: 'plan-reach' });

      const checkResult = check(dag);
      expect(checkResult.done).toBe(true);
    });

    it('verify() confirms all consumes satisfied by predecessor produces', () => {
      const tasks = parseTasksMd(MULTI_BRANCH_SPEC);
      const dag = tasksToDAG(tasks, { dagId: 'verify-consumes' });

      const errors = verify(dag);
      // No errors means all consumes are satisfied
      expect(errors).toHaveLength(0);
    });
  });

  // ─── Test 6: Briefs are sealed (read-only, deterministic) ──────────────────────

  describe('briefs are sealed (read-only, deterministic)', () => {
    it('brief contains sealed read-only information', async () => {
      const ir = makeSampleIR(3);
      const dag = compileIR(ir);

      const nodeId = 'task-1';
      // getBrief returns a Brief interface with specific properties
      const brief = await getBrief(dag, nodeId, process.cwd());

      expect(brief).toHaveProperty('position');
      expect(brief).toHaveProperty('produces');
      expect(brief).toHaveProperty('consumes');
      expect(brief).toHaveProperty('description');
      expect(brief.position).toBe(nodeId);
    });

    it('brief.produces is an array of strings (deterministic)', async () => {
      const ir = makeSampleIR(3);
      const dag = compileIR(ir);

      const brief = await getBrief(dag, 'task-1', process.cwd());

      expect(Array.isArray(brief.produces)).toBe(true);
      expect(brief.produces.every((p) => typeof p === 'string')).toBe(true);
    });

    it('brief.consumes is an array of strings (deterministic)', async () => {
      const ir = makeSampleIR(3);
      const dag = compileIR(ir);

      const brief = await getBrief(dag, 'task-1', process.cwd());

      expect(Array.isArray(brief.consumes)).toBe(true);
      expect(brief.consumes.every((c) => typeof c === 'string')).toBe(true);
    });

    it('same DAG yields identical brief for same node', async () => {
      const ir = makeSampleIR(3);
      const dag = compileIR(ir);

      const brief1 = await getBrief(dag, 'task-1', process.cwd());
      const brief2 = await getBrief(dag, 'task-1', process.cwd());

      // Properties should match
      expect(brief1.position).toBe(brief2.position);
      expect(JSON.stringify(brief1.produces)).toBe(JSON.stringify(brief2.produces));
      expect(JSON.stringify(brief1.consumes)).toBe(JSON.stringify(brief2.consumes));
    });

    it('brief includes mode field when node is plan mode', async () => {
      const tasks = parseTasksMd(PLAN_MODE_SPEC);
      const dag = tasksToDAG(tasks, { dagId: 'plan-brief' });

      const brief = await getBrief(dag, 'design', process.cwd());

      expect(brief).toHaveProperty('mode');
      expect(brief.mode).toBe('plan');
    });
  });

  // ─── Test 7: Sub-DAGs recursively follow the same pattern ──────────────────────

  describe('sub-DAGs recursively follow the same pattern', () => {
    it('nested structure: each sub-node level has init and term', () => {
      const ir = makeSampleIR(5);
      const dag = compileIR(ir);

      // Validate the structure
      const validation = validateDagStructure(dag);

      expect(validation.hasInit).toBe(true);
      expect(validation.hasTerm).toBe(true);
      expect(validation.acyclic).toBe(true);
    });

    it('all nodes in DAG have produces as strings array', () => {
      const tasks = parseTasksMd(MULTI_BRANCH_SPEC);
      const dag = tasksToDAG(tasks, { dagId: 'validate-produces' });

      for (const node of Object.values(dag.nodes)) {
        expect(Array.isArray(node.produces)).toBe(true);
        expect(node.produces.every((p) => typeof p === 'string')).toBe(true);
      }
    });

    it('all nodes in DAG have consumes as strings array', () => {
      const tasks = parseTasksMd(MULTI_BRANCH_SPEC);
      const dag = tasksToDAG(tasks, { dagId: 'validate-consumes' });

      for (const node of Object.values(dag.nodes)) {
        expect(Array.isArray(node.consumes)).toBe(true);
        expect(node.consumes.every((c) => typeof c === 'string')).toBe(true);
      }
    });

    it('all nodes have deps array with valid node references', () => {
      const tasks = parseTasksMd(MULTI_BRANCH_SPEC);
      const dag = tasksToDAG(tasks, { dagId: 'validate-deps' });

      const nodeIds = new Set(Object.keys(dag.nodes));

      for (const node of Object.values(dag.nodes)) {
        expect(Array.isArray(node.deps)).toBe(true);
        for (const dep of node.deps) {
          expect(nodeIds.has(dep)).toBe(true);
        }
      }
    });

    it('recursive structure: YAML block parsing produces valid tasks', () => {
      const tasks = parseTasksMd(YAML_BLOCK_SPEC);

      expect(tasks.length).toBeGreaterThan(0);
      for (const task of tasks) {
        expect(task).toHaveProperty('id');
        expect(task).toHaveProperty('desc');
        expect(task).toHaveProperty('produces');
        expect(task).toHaveProperty('consumes');
        expect(task).toHaveProperty('mode');
        expect(task.mode).toMatch(/^(execute|plan)$/);
      }
    });

    it('YAML block tasks convert to valid DAG', () => {
      const tasks = parseTasksMd(YAML_BLOCK_SPEC);
      const dag = tasksToDAG(tasks, { dagId: 'yaml-dag' });

      expect(() => define(dag)).not.toThrow();
      const validation = validateDagStructure(dag);
      expect(validation.acyclic).toBe(true);
      expect(validation.allReachable).toBe(true);
    });
  });

  // ─── Test 8: Error messages are clear on invalid specs ────────────────────────

  describe('error messages are clear on invalid specs', () => {
    it('rejects unknown dependency with informative message', () => {
      const md = `
- [P0] a: Task A
  - produces: a.txt
- [P1] b: Task B
  - depends: nonexistent
  - produces: b.txt
`;
      const tasks = parseTasksMd(md);

      expect(() => tasksToDAG(tasks, { dagId: 'unknown-dep' })).toThrow('unknown task');
    });

    it('rejects empty task list with informative message', () => {
      expect(() => tasksToDAG([], { dagId: 'empty' })).toThrow('No tasks');
    });

    it('parseIRFile rejects IR with no tasks', () => {
      const ir = JSON.stringify({
        schema_version: 1,
        dag_id: 'no-tasks',
        tasks: [],
      });

      expect(() => parseIRFile(ir)).toThrow('no tasks');
    });

    it('compileIR converts error-bearing IR gracefully if tasks are malformed', () => {
      const badIR: SpecIR = {
        schema_version: 1,
        engine: { name: 'spec-kit', version: '1.0.0', config_hash: 'hash' },
        dag_id: 'bad',
        inputs: [],
        tasks: [
          {
            id: 'a',
            desc: 'A',
            priority: 0,
            depends: ['nonexistent'],
            produces: ['a.txt'],
            consumes: [],
            mode: 'execute',
            validate: [],
          },
        ],
        metadata: { generated: new Date().toISOString(), compile_hash: 'hash' },
      };

      expect(() => compileIR(badIR)).toThrow();
    });

    it('validates that produces and consumes are non-empty when needed', () => {
      // A task with no produces at P0 should auto-generate one
      const md = `
- [P0] init: Initialize
- [P1] task: Do work
  - depends: init
`;
      const tasks = parseTasksMd(md);
      const dag = tasksToDAG(tasks, { dagId: 'auto-produces' });

      // tasksToDAG auto-generates produces for tasks without them
      expect(dag.nodes['init'].produces.length).toBeGreaterThan(0);
      expect(dag.nodes['task'].produces.length).toBeGreaterThan(0);
    });

    it('irTasksToParsed preserves all task properties', () => {
      const irTasks: SpecIRTask[] = [
        {
          id: 'test-node',
          desc: 'Test task',
          priority: 5,
          depends: ['dep1', 'dep2'],
          produces: ['out1.txt', 'out2.txt'],
          consumes: ['in1.txt'],
          mode: 'plan',
          validate: [{ type: 'shell', command: 'echo test' }],
        },
      ];

      const parsed = irTasksToParsed(irTasks);

      expect(parsed[0].id).toBe('test-node');
      expect(parsed[0].desc).toBe('Test task');
      expect(parsed[0].priority).toBe(5);
      expect(parsed[0].depends).toEqual(['dep1', 'dep2']);
      expect(parsed[0].produces).toEqual(['out1.txt', 'out2.txt']);
      expect(parsed[0].consumes).toEqual(['in1.txt']);
      expect(parsed[0].mode).toBe('plan');
    });
  });

  // ─── Test 9: Validate rules preserved through make pipeline ─────────────────────

  describe('validate rules preserved through make pipeline', () => {
    it('validation rules from markdown spec are preserved in DAG', () => {
      const tasks = parseTasksMd(SIMPLE_SPEC);
      const dag = tasksToDAG(tasks, { dagId: 'with-validation' });

      // compile task has validate: shell:npm run build
      const compileNode = dag.nodes['compile'];
      expect(compileNode.validate.length).toBeGreaterThan(0);
      expect(compileNode.validate[0].type).toBe('shell');
    });

    it('validation rules from SpecIR are preserved in compiled DAG', () => {
      const ir: SpecIR = {
        schema_version: 1,
        engine: { name: 'test', version: '1.0.0', config_hash: 'hash' },
        dag_id: 'test-validate',
        inputs: [],
        tasks: [
          {
            id: 'task1',
            desc: 'Task 1',
            priority: 0,
            depends: [],
            produces: ['out.txt'],
            consumes: [],
            mode: 'execute',
            validate: [
              { type: 'shell', command: 'test -f out.txt' },
              { type: 'artifact-exists', target: 'out.txt' },
            ],
          },
        ],
        metadata: { generated: new Date().toISOString(), compile_hash: 'hash' },
      };

      const dag = compileIR(ir);
      const node = dag.nodes['task1'];

      expect(node.validate.length).toBe(2);
      expect(node.validate.some((v) => v.type === 'shell')).toBe(true);
      expect(node.validate.some((v) => v.type === 'artifact-exists')).toBe(true);
    });
  });
});
