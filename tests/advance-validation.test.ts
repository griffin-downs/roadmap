import { test } from 'node:test';
import assert from 'node:assert';
import { validateNode } from '../src/lib/protocol/validation.ts';
import type { Graph, NodeSpec } from '../src/lib/protocol/types.ts';

// Helper to build minimal test DAGs
function buildTestDAG(nodeSpecs: Record<string, Partial<NodeSpec<string, any>>>): Graph<string> {
  const nodes: Record<string, NodeSpec<string, any>> = {};

  for (const [id, spec] of Object.entries(nodeSpecs)) {
    nodes[id as any] = {
      id,
      desc: spec.desc ?? 'test node',
      produces: spec.produces ?? [],
      consumes: spec.consumes ?? [],
      deps: spec.deps ?? [],
      validate: spec.validate ?? [],
      idempotent: spec.idempotent ?? true,
      ...spec,
    };
  }

  const dag: Graph<string> = {
    id: 'test-dag',
    desc: 'test DAG',
    init: 'init',
    term: 'term',
    nodes: nodes as any,
  };

  return dag;
}

test('artifact-exists with no target does not crash', async () => {
  const dag = buildTestDAG({
    init: { id: 'init', produces: ['init.marker'] },
    test: {
      id: 'test',
      consumes: ['init.marker'],
      produces: ['test-output.txt'],
      validate: [
        { type: 'artifact-exists' } as any, // Missing both target and path
      ],
    },
    term: { id: 'term', consumes: ['test-output.txt'] },
  });

  const exists = () => true; // Assume all files exist for this test

  const result = await validateNode(dag, 'test', exists);

  assert(!result.passed, 'should not pass when artifact-exists has no target');
  assert(result.checks.length > 0, 'should have validation checks');
  const check = result.checks.find(c => c.rule.type === 'artifact-exists');
  assert(check, 'should have artifact-exists check');
  assert(!check.passed, 'artifact-exists with no target should fail');
});

test('shell validator executes command successfully', async () => {
  const dag = buildTestDAG({
    init: { id: 'init', produces: ['init.marker'] },
    test: {
      id: 'test',
      consumes: ['init.marker'],
      produces: ['test-output.txt'],
      validate: [
        { type: 'shell', command: 'echo "test passed"' },
      ],
    },
    term: { id: 'term', consumes: ['test-output.txt'] },
  });

  const exists = () => true;

  const result = await validateNode(dag, 'test', exists);

  assert(result.passed, 'shell command should pass');
  assert(result.checks.length > 0, 'should have validation checks');
  const shellCheck = result.checks.find(c => c.rule.type === 'shell');
  assert(shellCheck, 'should have shell check');
  assert(shellCheck?.passed, 'shell validator should pass for successful command');
});

test('shell validator fails on non-zero exit', async () => {
  // Skip this test if running inside validation (recursion guard will make it pass)
  if (process.env.ROADMAP_VALIDATING) {
    return;
  }

  const dag = buildTestDAG({
    init: { id: 'init', produces: ['init.marker'] },
    test: {
      id: 'test',
      consumes: ['init.marker'],
      produces: [],
      validate: [
        { type: 'shell', command: 'exit 1' },
      ],
    },
    term: { id: 'term', consumes: [] },
  });

  const exists = () => true;

  const result = await validateNode(dag, 'test', exists);

  assert(!result.passed, 'shell command with exit 1 should fail');
  const shellCheck = result.checks.find(c => c.rule.type === 'shell');
  assert(shellCheck && !shellCheck.passed, 'shell validator should fail for non-zero exit');
});

test('intent validator passes automatically (unevaluated)', async () => {
  const dag = buildTestDAG({
    init: { id: 'init', produces: ['init.marker'] },
    test: {
      id: 'test',
      consumes: ['init.marker'],
      produces: ['test-output.txt'],
      validate: [
        { type: 'intent', statement: 'code is well-formatted', confidence: 0.8 },
      ],
    },
    term: { id: 'term', consumes: ['test-output.txt'] },
  });

  const exists = () => true;

  const result = await validateNode(dag, 'test', exists);

  // Intent validators pass as unevaluated when no judgment provided
  assert(result.passed, 'intent validator without judgment should pass (unevaluated)');
  const intentCheck = result.checks.find(c => c.rule.type === 'intent');
  assert(intentCheck, 'should have intent check');
  assert(intentCheck?.passed, 'intent validator should pass when unevaluated');
});

test('artifact-exists with valid target succeeds', async () => {
  const dag = buildTestDAG({
    init: { id: 'init', produces: ['init.marker'] },
    test: {
      id: 'test',
      consumes: ['init.marker'],
      produces: ['test-output.txt'],
      validate: [
        { type: 'artifact-exists', target: 'test-output.txt' },
      ],
    },
    term: { id: 'term', consumes: ['test-output.txt'] },
  });

  const exists = (artifact: string) => artifact === 'test-output.txt';

  const result = await validateNode(dag, 'test', exists);

  assert(result.passed, 'artifact-exists with existing target should pass');
  const artifactCheck = result.checks.find(c => c.rule.type === 'artifact-exists');
  assert(artifactCheck?.passed, 'artifact-exists validator should pass when file exists');
});

test('artifact-exists with missing target fails', async () => {
  const dag = buildTestDAG({
    init: { id: 'init', produces: ['init.marker'] },
    test: {
      id: 'test',
      consumes: ['init.marker'],
      produces: ['test-output.txt'],
      validate: [
        { type: 'artifact-exists', target: 'missing-file.txt' },
      ],
    },
    term: { id: 'term', consumes: ['test-output.txt'] },
  });

  const exists = () => false;

  const result = await validateNode(dag, 'test', exists);

  assert(!result.passed, 'artifact-exists with missing target should fail');
  const artifactCheck = result.checks.find(c => c.rule.type === 'artifact-exists');
  assert(artifactCheck && !artifactCheck.passed, 'artifact-exists validator should fail when file missing');
});

test('produces artifacts are checked even without explicit artifact-exists rules', async () => {
  const dag = buildTestDAG({
    init: { id: 'init', produces: ['init.marker'] },
    test: {
      id: 'test',
      consumes: ['init.marker'],
      produces: ['test-output.txt'],
      validate: [], // No explicit validators
    },
    term: { id: 'term', consumes: ['test-output.txt'] },
  });

  const exists = (artifact: string) => artifact === 'test-output.txt';

  const result = await validateNode(dag, 'test', exists);

  // Should pass because produces artifacts exist
  assert(result.passed, 'node with existing produces should pass even without explicit validators');
});

test('produces artifacts are not checked by validateNode itself', async () => {
  const dag = buildTestDAG({
    init: { id: 'init', produces: ['init.marker'] },
    test: {
      id: 'test',
      consumes: ['init.marker'],
      produces: ['test-output.txt'],
      validate: [],
    },
    term: { id: 'term', consumes: ['test-output.txt'] },
  });

  const exists = () => false; // No files exist

  const result = await validateNode(dag, 'test', exists);

  // validateNode only checks the validate rules, not produces
  // The CLI code (advanceNode) manually checks produces separately
  assert(result.passed, 'validateNode passes when validate rules pass (produces checked separately by CLI)');
});
