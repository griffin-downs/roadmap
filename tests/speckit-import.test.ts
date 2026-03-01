import { describe, it, expect } from 'vitest';
import { parseTasksMd, tasksToDAG } from '../src/lib/intake/speckit-import.ts';
import { define, check, verify } from '../src/protocol.ts';

const SIMPLE_MD = `
## Setup
- [P0] setup: Initialize the project
  - produces: package.json, tsconfig.json

## Core
- [P1] auth: Implement authentication module
  - depends: setup
  - consumes: package.json
  - produces: src/auth.ts
- [P1] db: Set up database layer
  - depends: setup
  - consumes: package.json
  - produces: src/db.ts

## Integration
- [P2] api: Build API endpoints
  - depends: auth, db
  - consumes: src/auth.ts, src/db.ts
  - produces: src/api.ts
`;

describe('parseTasksMd', () => {
  it('parses tasks with priority, deps, produces, consumes', () => {
    const tasks = parseTasksMd(SIMPLE_MD);
    expect(tasks).toHaveLength(4);
    expect(tasks[0].id).toBe('setup');
    expect(tasks[0].priority).toBe(0);
    expect(tasks[0].produces).toEqual(['package.json', 'tsconfig.json']);
    expect(tasks[1].id).toBe('auth');
    expect(tasks[1].depends).toEqual(['setup']);
    expect(tasks[3].depends).toEqual(['auth', 'db']);
  });

  it('parses mode: plan', () => {
    const md = `- [P0] design: Plan the architecture\n  - mode: plan\n  - produces: design.md`;
    const tasks = parseTasksMd(md);
    expect(tasks[0].mode).toBe('plan');
  });

  it('parses validate: shell commands', () => {
    const md = `- [P0] build: Build project\n  - validate: shell:npm run build`;
    const tasks = parseTasksMd(md);
    expect(tasks[0].validate).toEqual([{ type: 'shell', command: 'npm run build' }]);
  });

  it('parses validate: exists rules', () => {
    const md = `- [P0] build: Build\n  - validate: exists:dist/index.js`;
    const tasks = parseTasksMd(md);
    expect(tasks[0].validate).toEqual([{ type: 'artifact-exists', target: 'dist/index.js' }]);
  });

  it('defaults mode to execute', () => {
    const md = `- [P0] impl: Do the thing`;
    const tasks = parseTasksMd(md);
    expect(tasks[0].mode).toBe('execute');
  });

  it('returns empty array for no tasks', () => {
    expect(parseTasksMd('# Just a heading\nSome text.')).toEqual([]);
  });

  it('handles multiple items on depends line', () => {
    const md = `- [P0] a: First\n- [P1] b: Second\n  - depends: a\n- [P1] c: Third\n  - depends: a\n- [P2] d: Fourth\n  - depends: b, c`;
    const tasks = parseTasksMd(md);
    expect(tasks[3].depends).toEqual(['b', 'c']);
  });
});

describe('tasksToDAG', () => {
  it('produces a valid DAG from simple tasks', () => {
    const tasks = parseTasksMd(SIMPLE_MD);
    const dag = tasksToDAG(tasks, { dagId: 'test-import' });
    // Should not throw
    define(dag);
    expect(dag.id).toBe('test-import');
    expect(dag.init).toBe('setup');
    expect(dag.nodes['auth'].deps).toContain('setup');
    expect(dag.nodes['db'].deps).toContain('setup');
  });

  it('synthesizes term node for multiple leaf tasks', () => {
    const md = `- [P0] a: Root\n  - produces: a.txt\n- [P1] b: Leaf 1\n  - depends: a\n  - produces: b.txt\n- [P1] c: Leaf 2\n  - depends: a\n  - produces: c.txt`;
    const tasks = parseTasksMd(md);
    const dag = tasksToDAG(tasks, { dagId: 'multi-leaf' });
    expect(dag.term).toBe('term');
    expect(dag.nodes['term'].deps).toContain('b');
    expect(dag.nodes['term'].deps).toContain('c');
  });

  it('single leaf becomes term directly', () => {
    const md = `- [P0] start: Begin\n  - produces: start.txt\n- [P1] finish: End\n  - depends: start\n  - consumes: start.txt`;
    const tasks = parseTasksMd(md);
    const dag = tasksToDAG(tasks, { dagId: 'single-leaf' });
    expect(dag.term).toBe('finish');
  });

  it('passes define() validation', () => {
    const tasks = parseTasksMd(SIMPLE_MD);
    const dag = tasksToDAG(tasks, { dagId: 'valid' });
    // define throws on cycles or missing init/term
    expect(() => define(dag)).not.toThrow();
  });

  it('throws on unknown dependency', () => {
    const md = `- [P0] a: Task A\n  - depends: nonexistent`;
    const tasks = parseTasksMd(md);
    expect(() => tasksToDAG(tasks, { dagId: 'bad' })).toThrow('unknown task');
  });

  it('throws on empty input', () => {
    expect(() => tasksToDAG([], { dagId: 'empty' })).toThrow('No tasks');
  });

  it('preserves mode: plan on nodes', () => {
    const md = `- [P0] design: Plan arch\n  - mode: plan\n  - produces: design.md\n- [P1] impl: Build it\n  - depends: design\n  - consumes: design.md`;
    const tasks = parseTasksMd(md);
    const dag = tasksToDAG(tasks, { dagId: 'plan-test' });
    expect((dag.nodes['design'] as any).mode).toBe('plan');
  });

  it('preserves validate rules on nodes', () => {
    const md = `- [P0] build: Build\n  - produces: dist/\n  - validate: shell:npm run build`;
    const tasks = parseTasksMd(md);
    const dag = tasksToDAG(tasks, { dagId: 'validate-test' });
    expect(dag.nodes['build'].validate).toEqual([{ type: 'shell', command: 'npm run build' }]);
  });

  it('sets version and protocolVersion from options', () => {
    const md = `- [P0] a: Task`;
    const tasks = parseTasksMd(md);
    const dag = tasksToDAG(tasks, { dagId: 'versioned', version: '1.0.0' });
    expect((dag as any).version).toBe('1.0.0');
    expect((dag as any).protocolVersion).toBe('0.3.0');
  });
});

describe('round-trip: parse → DAG → define', () => {
  it('complex multi-phase task list produces valid DAG', () => {
    const md = `
## Phase 0: Bootstrap
- [P0] init-repo: Create repository structure
  - produces: package.json, tsconfig.json, README.md

## Phase 1: Core modules
- [P1] auth: Authentication service
  - depends: init-repo
  - consumes: package.json
  - produces: src/auth.ts, tests/auth.test.ts
  - validate: shell:npx vitest run tests/auth.test.ts
- [P1] storage: Storage layer
  - depends: init-repo
  - consumes: package.json
  - produces: src/storage.ts

## Phase 2: Integration
- [P2] api-gateway: API gateway service
  - depends: auth, storage
  - consumes: src/auth.ts, src/storage.ts
  - produces: src/gateway.ts
- [P2] admin-panel: Admin dashboard
  - depends: auth
  - consumes: src/auth.ts
  - produces: src/admin.ts

## Phase 3: Release
- [P3] release: Cut v1.0.0
  - depends: api-gateway, admin-panel
  - consumes: src/gateway.ts, src/admin.ts
  - validate: shell:npm run build
  - validate: shell:npm test
`;
    const tasks = parseTasksMd(md);
    expect(tasks).toHaveLength(6);

    const dag = tasksToDAG(tasks, { dagId: 'full-project', dagDesc: 'Full project roadmap' });
    expect(() => define(dag)).not.toThrow();
    expect(dag.init).toBe('init-repo');
    expect(dag.term).toBe('release');
    expect(dag.nodes['auth'].deps).toContain('init-repo');
    expect(dag.nodes['api-gateway'].deps).toContain('auth');
    expect(dag.nodes['api-gateway'].deps).toContain('storage');
    expect(dag.nodes['release'].validate).toHaveLength(2);
  });
});
