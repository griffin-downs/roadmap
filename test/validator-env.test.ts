import { test } from 'node:test';
import { strictEqual, ok } from 'node:assert';
import { execSync } from 'node:child_process';
import { writeFileSync, mkdirSync, unlinkSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { validateNode } from '../src/lib/protocol/validation.ts';
import type { Graph } from '../src/protocol.ts';

const testDir = join(process.cwd(), '.test-validator-env');

test('shell validators receive ROADMAP_NODE env var', async () => {
  // Create output directory
  mkdirSync(testDir, { recursive: true });
  const outputFile = join(testDir, 'output.txt');

  // Create minimal DAG with shell validator using function type
  const dag: Graph<'test-node'> = {
    id: 'test',
    desc: 'test',
    init: 'test-node',
    term: 'test-node',
    nodes: {
      'test-node': {
        id: 'test-node',
        desc: 'test node',
        produces: [outputFile],
        consumes: [],
        deps: [],
        validate: [
          {
            type: 'function',
            fn: `sh -c "echo $ROADMAP_NODE > ${outputFile}"`,
          },
        ],
      },
    },
  };

  try {
    const exists = (artifact: string) => {
      try {
        return existsSync(artifact);
      } catch {
        return false;
      }
    };

    // Validate node with repoRoot and branch
    const result = await validateNode(dag, 'test-node', exists, {
      repoRoot: process.cwd(),
      branch: 'feat/test',
    });

    ok(result.passed, `Validation should pass: ${result.failedReason}`);

    // Verify the env var was passed and echoed
    const content = readFileSync(outputFile, 'utf-8').trim();
    strictEqual(content, 'test-node', `ROADMAP_NODE env var should be "test-node", got "${content}"`);
  } finally {
    rmSync(testDir, { recursive: true, force: true });
  }
});

test('shell validators receive ROADMAP_REPO env var', async () => {
  mkdirSync(testDir, { recursive: true });
  const outputFile = join(testDir, 'repo.txt');

  const dag: Graph<'test-node'> = {
    id: 'test',
    desc: 'test',
    init: 'test-node',
    term: 'test-node',
    nodes: {
      'test-node': {
        id: 'test-node',
        desc: 'test node',
        produces: [outputFile],
        consumes: [],
        deps: [],
        validate: [
          {
            type: 'function',
            fn: `sh -c "echo $ROADMAP_REPO > ${outputFile}"`,
          },
        ],
      },
    },
  };

  try {
    const exists = (artifact: string) => {
      try {
        return existsSync(artifact);
      } catch {
        return false;
      }
    };

    const result = await validateNode(dag, 'test-node', exists, {
      repoRoot: process.cwd(),
      branch: 'feat/test',
    });

    ok(result.passed, `Validation should pass: ${result.failedReason}`);

    // Verify the env var was passed
    const content = readFileSync(outputFile, 'utf-8').trim();
    strictEqual(content, process.cwd(), `ROADMAP_REPO should be current dir, got "${content}"`);
  } finally {
    rmSync(testDir, { recursive: true, force: true });
  }
});

test('shell validators receive ROADMAP_BRANCH env var', async () => {
  mkdirSync(testDir, { recursive: true });
  const outputFile = join(testDir, 'branch.txt');

  const dag: Graph<'test-node'> = {
    id: 'test',
    desc: 'test',
    init: 'test-node',
    term: 'test-node',
    nodes: {
      'test-node': {
        id: 'test-node',
        desc: 'test node',
        produces: [outputFile],
        consumes: [],
        deps: [],
        validate: [
          {
            type: 'function',
            fn: `sh -c "echo $ROADMAP_BRANCH > ${outputFile}"`,
          },
        ],
      },
    },
  };

  try {
    const exists = (artifact: string) => {
      try {
        return existsSync(artifact);
      } catch {
        return false;
      }
    };

    const result = await validateNode(dag, 'test-node', exists, {
      repoRoot: process.cwd(),
      branch: 'feat/hardening-004',
    });

    ok(result.passed, `Validation should pass: ${result.failedReason}`);

    // Verify the env var was passed
    const content = readFileSync(outputFile, 'utf-8').trim();
    strictEqual(content, 'feat/hardening-004', `ROADMAP_BRANCH should be "feat/hardening-004", got "${content}"`);
  } finally {
    rmSync(testDir, { recursive: true, force: true });
  }
});

test('shell validators still set ROADMAP_VALIDATING', async () => {
  mkdirSync(testDir, { recursive: true });
  const outputFile = join(testDir, 'validating.txt');

  const dag: Graph<'test-node'> = {
    id: 'test',
    desc: 'test',
    init: 'test-node',
    term: 'test-node',
    nodes: {
      'test-node': {
        id: 'test-node',
        desc: 'test node',
        produces: [outputFile],
        consumes: [],
        deps: [],
        validate: [
          {
            type: 'function',
            fn: `sh -c "echo $ROADMAP_VALIDATING > ${outputFile}"`,
          },
        ],
      },
    },
  };

  try {
    const exists = (artifact: string) => {
      try {
        return existsSync(artifact);
      } catch {
        return false;
      }
    };

    const result = await validateNode(dag, 'test-node', exists, {
      repoRoot: process.cwd(),
      branch: 'feat/test',
    });

    ok(result.passed, `Validation should pass: ${result.failedReason}`);

    // Verify ROADMAP_VALIDATING is set
    const content = readFileSync(outputFile, 'utf-8').trim();
    strictEqual(content, '1', `ROADMAP_VALIDATING should be "1", got "${content}"`);
  } finally {
    rmSync(testDir, { recursive: true, force: true });
  }
});
