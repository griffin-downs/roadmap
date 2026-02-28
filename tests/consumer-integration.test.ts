import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { join } from 'node:path';
import { mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

/**
 * Consumer smoke test: minimal roadmap from a consumer project
 *
 * Receipt-only model: orient advances only when completed.json has passing receipts.
 * Artifacts alone don't advance position.
 */

const root = process.cwd();
const tmpBase = join(root, '.test-consumer');
const consumerRoot = join(tmpBase, 'test-project');
const cliPath = join(root, 'bin/roadmap.ts');

function run(cmd: string, cwd: string): any {
  const out = execSync(`node --experimental-strip-types ${cliPath} ${cmd}`, {
    cwd,
    encoding: 'utf-8',
    env: { ...process.env, NODE_NO_WARNINGS: '1' },
  });
  try {
    return JSON.parse(out);
  } catch {
    return out;
  }
}

function writeReceipts(nodeIds: string[]) {
  const records = nodeIds.map(id => ({
    nodeId: id,
    completedAt: new Date().toISOString(),
    validationChecks: [{ rule: 'test-fixture', passed: true, evidence: 'consumer integration test' }],
  }));
  writeFileSync(
    join(consumerRoot, '.roadmap/completed.json'),
    JSON.stringify(records, null, 2),
  );
}

beforeAll(() => {
  rmSync(tmpBase, { recursive: true, force: true });
  mkdirSync(join(consumerRoot, '.roadmap'), { recursive: true });

  // Initialize as git repo (required for some predicates)
  execSync('git init', { cwd: consumerRoot, stdio: 'pipe' });

  // Consumer's minimal roadmap DAG
  const dag = {
    id: 'test-consumer',
    desc: 'Consumer project workflow',
    init: 'bootstrap',
    term: 'ready',
    nodes: {
      bootstrap: {
        id: 'bootstrap',
        desc: 'Create initial scaffold',
        produces: ['src/main.ts', 'tsconfig.json'],
        consumes: [],
        deps: [],
        validate: [
          { type: 'artifact-exists', target: 'src/main.ts' },
          { type: 'artifact-exists', target: 'tsconfig.json' },
        ],
        idempotent: true,
      },
      build: {
        id: 'build',
        desc: 'Build TypeScript to JavaScript',
        produces: ['dist/index.js'],
        consumes: ['src/main.ts', 'tsconfig.json'],
        deps: ['bootstrap'],
        validate: [{ type: 'artifact-exists', target: 'dist/index.js' }],
        idempotent: true,
      },
      test: {
        id: 'test',
        desc: 'Run test suite',
        produces: ['coverage/report.html'],
        consumes: ['src/main.ts'],
        deps: ['bootstrap'],
        validate: [{ type: 'artifact-exists', target: 'coverage/report.html' }],
        idempotent: true,
      },
      ready: {
        id: 'ready',
        desc: 'Project ready for release',
        produces: [],
        consumes: ['dist/index.js', 'coverage/report.html'],
        deps: ['build', 'test'],
        validate: [],
        idempotent: false,
      },
    },
  };

  writeFileSync(join(consumerRoot, '.roadmap/head.json'), JSON.stringify(dag, null, 2));

  // Create initial artifacts and mark bootstrap complete
  mkdirSync(join(consumerRoot, 'src'), { recursive: true });
  writeFileSync(join(consumerRoot, 'src/main.ts'), 'export const main = () => "hello";');
  writeFileSync(join(consumerRoot, 'tsconfig.json'), '{ "compilerOptions": {} }');
  writeReceipts(['bootstrap']);

  // Commit initial state
  execSync('git add -A && git commit -m "init"', { cwd: consumerRoot, stdio: 'pipe' });
});

afterAll(() => {
  rmSync(tmpBase, { recursive: true, force: true });
});

describe('Consumer integration', () => {
  it('orient() finds position from real filesystem', () => {
    const result = run('orient --note "consumer test"', consumerRoot);

    expect(result).toBeDefined();
    expect(result.position).toBeDefined();
    // Bootstrap has receipt → done. Next: build and test (parallel batch)
    expect(result.position).toEqual(expect.arrayContaining(['build', 'test']));
    expect(result.done).toBeGreaterThan(0);
    expect(result.produces).toBeDefined();
    expect(Array.isArray(result.produces)).toBe(true);
    expect(result.consumes).toBeDefined();
    expect(Array.isArray(result.consumes)).toBe(true);
  });

  it('orient() reports correct produces/consumes for current node', () => {
    const result = run('orient --note "check consumes"', consumerRoot);

    // Both build and test in parallel batch
    expect(result.produces).toContain('dist/index.js');
    expect(result.produces).toContain('coverage/report.html');
    expect(result.consumes).toContain('src/main.ts');
  });

  it('orient() identifies remaining nodes', () => {
    const result = run('orient --note "check remaining"', consumerRoot);

    expect(result.remaining).toBeDefined();
    expect(typeof result.remaining).toBe('number');
    expect(result.remaining).toBeGreaterThan(0);
  });

  it('advancing by adding receipt moves position forward', () => {
    // Create build artifact + receipt
    mkdirSync(join(consumerRoot, 'dist'), { recursive: true });
    writeFileSync(join(consumerRoot, 'dist/index.js'), 'console.log("hello");');
    writeReceipts(['bootstrap', 'build']);

    const result = run('orient --note "after build"', consumerRoot);

    // build done, test still pending → position includes test
    expect(Array.isArray(result.position) && result.position.includes('test')).toBe(true);
    expect(result.done).toBeGreaterThanOrEqual(2);
  });

  it('chart displays progress correctly', () => {
    const output = run('chart', consumerRoot);

    expect(typeof output).toBe('string');
    expect(output).toContain('test-consumer');
    expect(output).toContain('position');
  });

  it('orient with all receipts completes to term', () => {
    // Complete test node
    mkdirSync(join(consumerRoot, 'coverage'), { recursive: true });
    writeFileSync(join(consumerRoot, 'coverage/report.html'), '<html></html>');
    writeReceipts(['bootstrap', 'build', 'test']);

    const result = run('orient --note "all complete"', consumerRoot);

    expect(result.position).toEqual(['ready']);
    // Terminal node excludes itself from done count: bootstrap, build, test = 3
    expect(result.done).toBe(3);
    expect(result.remaining).toBe(0);
    expect(result.complete).toBe(true);
  });

  it('consumer DAG structure validated by define()', () => {
    const result = run('orient --note "validate structure"', consumerRoot);
    expect(result).toBeDefined();
    expect(result.position).toBeDefined();
  });
});
