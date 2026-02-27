import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { readFileSync, existsSync } from 'node:fs';
import type { FixNodeSpec } from '../src/lib/intent-expansion.ts';
import type { NodeSpec, ValidationRule } from '../src/protocol.ts';
import { writeExpansionScript } from '../src/lib/expansion-writer.ts';

describe('expansion-writer: writeExpansionScript()', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'expansion-writer-'));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('creates .roadmap/expansions directory if missing', async () => {
    const parentNode: NodeSpec<any, any> = {
      id: 'plan-test',
      desc: 'Plan node',
      produces: ['src/output.ts'],
      consumes: [],
      deps: [],
      validate: [],
      idempotent: true,
    };

    const fixNode: FixNodeSpec = {
      id: 'plan-test-fix-0',
      desc: 'Fix: test intent',
      expandedFrom: 'plan-test',
      produces: ['src/output.ts'],
      consumes: ['src/output.ts'],
      validate: [],
      idempotent: true,
      _intentDiagnosis: {
        statement: 'Test statement',
        achievedConfidence: 0.5,
        threshold: 0.9,
        reasoning: 'Test reasoning',
        evidence: [],
        expansionDepth: 1,
      },
    };

    const result = writeExpansionScript({
      parentId: 'plan-test',
      parentNode,
      failures: [],
      fixNodes: [fixNode],
      reason: 'intent-expansion',
      repoRoot: tmpDir,
    });

    const expansionsDir = join(tmpDir, '.roadmap', 'expansions');
    expect(existsSync(expansionsDir)).toBe(true);
    expect(existsSync(result)).toBe(true);
  });

  it('writes script with correct filename pattern: <nodeId>-<timestamp>.ts', async () => {
    const parentNode: NodeSpec<any, any> = {
      id: 'plan-auth',
      desc: 'Auth plan',
      produces: ['src/auth.ts'],
      consumes: [],
      deps: [],
      validate: [],
      idempotent: true,
    };

    const fixNode: FixNodeSpec = {
      id: 'plan-auth-fix-0',
      desc: 'Fix: JWT rotation',
      expandedFrom: 'plan-auth',
      produces: ['src/auth.ts'],
      consumes: [],
      validate: [],
      idempotent: true,
      _intentDiagnosis: {
        statement: 'JWT module implements rotation',
        achievedConfidence: 0.42,
        threshold: 0.9,
        reasoning: 'Tokens rotate but no test coverage',
        evidence: ['src/auth.ts:45'],
        expansionDepth: 1,
      },
    };

    const result = writeExpansionScript({
      parentId: 'plan-auth',
      parentNode,
      failures: [],
      fixNodes: [fixNode],
      reason: 'intent-expansion',
      repoRoot: tmpDir,
    });

    const filename = result.split('/').pop();
    expect(filename).toMatch(/^plan-auth-\d+\.ts$/);
  });

  it('generates valid TypeScript that exports fix nodes', async () => {
    const parentNode: NodeSpec<any, any> = {
      id: 'plan-db',
      desc: 'Database plan',
      produces: ['src/db.ts'],
      consumes: [],
      deps: [],
      validate: [],
      idempotent: true,
    };

    const fixNode: FixNodeSpec = {
      id: 'plan-db-fix-0',
      desc: 'Fix: CRUD layer',
      expandedFrom: 'plan-db',
      produces: ['src/db.ts'],
      consumes: [],
      validate: [],
      idempotent: true,
      _intentDiagnosis: {
        statement: 'Database CRUD layer',
        achievedConfidence: 0.3,
        threshold: 0.9,
        reasoning: 'Schema exists but queries missing',
        evidence: ['src/db.ts:10'],
        expansionDepth: 1,
      },
    };

    const result = writeExpansionScript({
      parentId: 'plan-db',
      parentNode,
      failures: [],
      fixNodes: [fixNode],
      reason: 'intent-expansion',
      repoRoot: tmpDir,
    });

    const content = readFileSync(result, 'utf-8');

    // Verify header comments
    expect(content).toContain('// Expansion script for: plan-db');
    expect(content).toContain('// Parent: plan-db');
    expect(content).toContain('// Reason: intent-expansion');
    expect(content).toContain('// Generated:');

    // Verify imports
    expect(content).toContain("import { readFileSync, writeFileSync } from 'node:fs'");
    expect(content).toContain("import { join } from 'node:path'");

    // Verify DAG loading
    expect(content).toContain('const dag = JSON.parse(readFileSync(headPath');

    // Verify fix node is assigned
    expect(content).toContain("dag.nodes['plan-db-fix-0']");

    // Verify finalization
    expect(content).toContain('writeFileSync(headPath');
    expect(content).toContain('console.log');
  });

  it('includes _intentDiagnosis in generated fix nodes', async () => {
    const parentNode: NodeSpec<any, any> = {
      id: 'plan-api',
      desc: 'API plan',
      produces: ['src/api.ts'],
      consumes: [],
      deps: [],
      validate: [],
      idempotent: true,
    };

    const fixNode: FixNodeSpec = {
      id: 'plan-api-fix-0',
      desc: 'Fix: error handling',
      expandedFrom: 'plan-api',
      produces: ['src/api.ts'],
      consumes: [],
      validate: [],
      idempotent: true,
      _intentDiagnosis: {
        statement: 'API error handling comprehensive',
        achievedConfidence: 0.6,
        threshold: 0.85,
        reasoning: 'Error handling exists but edge cases missing',
        evidence: ['src/api.ts:20', 'tests/api.test.ts'],
        expansionDepth: 1,
      },
    };

    const result = writeExpansionScript({
      parentId: 'plan-api',
      parentNode,
      failures: [],
      fixNodes: [fixNode],
      reason: 'intent-expansion',
      repoRoot: tmpDir,
    });

    const content = readFileSync(result, 'utf-8');

    // Verify _intentDiagnosis is included
    expect(content).toContain('_intentDiagnosis');
    expect(content).toContain('API error handling comprehensive');
    expect(content).toContain('0.6');
    expect(content).toContain('0.85');
    expect(content).toContain('Error handling exists but edge cases missing');
  });

  it('includes expandedFrom backpointer on fix nodes', async () => {
    const parentNode: NodeSpec<any, any> = {
      id: 'plan-storage',
      desc: 'Storage plan',
      produces: ['src/storage.ts'],
      consumes: [],
      deps: [],
      validate: [],
      idempotent: true,
    };

    const fixNode: FixNodeSpec = {
      id: 'plan-storage-fix-0',
      desc: 'Fix: S3 integration',
      expandedFrom: 'plan-storage',
      produces: ['src/storage.ts'],
      consumes: [],
      validate: [],
      idempotent: true,
      _intentDiagnosis: {
        statement: 'S3 integration complete',
        achievedConfidence: 0.5,
        threshold: 0.9,
        reasoning: 'Connection works, retry logic missing',
        evidence: [],
        expansionDepth: 1,
      },
    };

    const result = writeExpansionScript({
      parentId: 'plan-storage',
      parentNode,
      failures: [],
      fixNodes: [fixNode],
      reason: 'intent-expansion',
      repoRoot: tmpDir,
    });

    const content = readFileSync(result, 'utf-8');

    expect(content).toContain('"expandedFrom": "plan-storage"');
  });

  it('handles multiple fix nodes in single expansion', async () => {
    const parentNode: NodeSpec<any, any> = {
      id: 'plan-multi',
      desc: 'Multi-intent plan',
      produces: ['src/multi.ts'],
      consumes: [],
      deps: [],
      validate: [],
      idempotent: true,
    };

    const fixNode1: FixNodeSpec = {
      id: 'plan-multi-fix-0',
      desc: 'Fix: feature 1',
      expandedFrom: 'plan-multi',
      produces: ['src/multi.ts'],
      consumes: [],
      validate: [],
      idempotent: true,
      _intentDiagnosis: {
        statement: 'Feature 1 complete',
        achievedConfidence: 0.4,
        threshold: 0.9,
        reasoning: 'Partial implementation',
        evidence: [],
        expansionDepth: 1,
      },
    };

    const fixNode2: FixNodeSpec = {
      id: 'plan-multi-fix-1',
      desc: 'Fix: feature 2',
      expandedFrom: 'plan-multi',
      produces: ['src/multi.ts'],
      consumes: [],
      validate: [],
      idempotent: true,
      _intentDiagnosis: {
        statement: 'Feature 2 complete',
        achievedConfidence: 0.3,
        threshold: 0.9,
        reasoning: 'Not started',
        evidence: [],
        expansionDepth: 1,
      },
    };

    const result = writeExpansionScript({
      parentId: 'plan-multi',
      parentNode,
      failures: [],
      fixNodes: [fixNode1, fixNode2],
      reason: 'intent-expansion',
      repoRoot: tmpDir,
    });

    const content = readFileSync(result, 'utf-8');

    expect(content).toContain("dag.nodes['plan-multi-fix-0']");
    expect(content).toContain("dag.nodes['plan-multi-fix-1']");
    expect(content).toContain('+2 node(s)');
  });

  it('generates plan node connection logic for mode: plan nodes', async () => {
    const parentNode: NodeSpec<any, any> = {
      id: 'plan-test-mode',
      desc: 'Plan mode node',
      produces: [],
      consumes: [],
      deps: [],
      validate: [],
      idempotent: true,
      mode: 'plan',
    };

    const fixNode: FixNodeSpec = {
      id: 'plan-test-mode-fix-0',
      desc: 'Fix: implementation',
      expandedFrom: 'plan-test-mode',
      produces: [],
      consumes: [],
      validate: [],
      idempotent: true,
      _intentDiagnosis: {
        statement: 'Plan expansion',
        achievedConfidence: 0.5,
        threshold: 0.9,
        reasoning: 'Initial expansion',
        evidence: [],
        expansionDepth: 1,
      },
    };

    const result = writeExpansionScript({
      parentId: 'plan-test-mode',
      parentNode,
      failures: [],
      fixNodes: [fixNode],
      reason: 'intent-expansion',
      repoRoot: tmpDir,
    });

    const content = readFileSync(result, 'utf-8');

    // Should include parent rewiring section
    expect(content).toContain('Connect: rewire parent deps');
    expect(content).toContain("dag.nodes['plan-test-mode']");
    expect(content).toContain('plan-test-mode-fix-0');
    expect(content).toContain('"deps"');
  });

  it('supports different expansion reasons', async () => {
    const parentNode: NodeSpec<any, any> = {
      id: 'plan-reason-test',
      desc: 'Test reason node',
      produces: [],
      consumes: [],
      deps: [],
      validate: [],
      idempotent: true,
    };

    const fixNode: FixNodeSpec = {
      id: 'plan-reason-test-fix-0',
      desc: 'Fix',
      expandedFrom: 'plan-reason-test',
      produces: [],
      consumes: [],
      validate: [],
      idempotent: true,
      _intentDiagnosis: {
        statement: 'test',
        achievedConfidence: 0.5,
        threshold: 0.9,
        reasoning: 'test',
        evidence: [],
        expansionDepth: 1,
      },
    };

    const reasons: Array<'intent-expansion' | 'runtime-explore' | 'escalation-recovery'> = [
      'intent-expansion',
      'runtime-explore',
      'escalation-recovery',
    ];

    for (const reason of reasons) {
      const result = writeExpansionScript({
        parentId: 'plan-reason-test',
        parentNode,
        failures: [],
        fixNodes: [fixNode],
        reason,
        repoRoot: tmpDir,
      });

      const content = readFileSync(result, 'utf-8');
      expect(content).toContain(`// Reason: ${reason}`);
    }
  });

  it('uses Unix timestamp in filename (sortable)', async () => {
    const parentNode: NodeSpec<any, any> = {
      id: 'plan-timestamp',
      desc: 'Timestamp test',
      produces: [],
      consumes: [],
      deps: [],
      validate: [],
      idempotent: true,
    };

    const fixNode: FixNodeSpec = {
      id: 'plan-timestamp-fix-0',
      desc: 'Fix',
      expandedFrom: 'plan-timestamp',
      produces: [],
      consumes: [],
      validate: [],
      idempotent: true,
      _intentDiagnosis: {
        statement: 'test',
        achievedConfidence: 0.5,
        threshold: 0.9,
        reasoning: 'test',
        evidence: [],
        expansionDepth: 1,
      },
    };

    const result1 = writeExpansionScript({
      parentId: 'plan-timestamp',
      parentNode,
      failures: [],
      fixNodes: [fixNode],
      reason: 'intent-expansion',
      repoRoot: tmpDir,
    });

    // Delay to ensure different timestamp (Unix seconds)
    await new Promise(resolve => setTimeout(resolve, 1100));

    const result2 = writeExpansionScript({
      parentId: 'plan-timestamp',
      parentNode,
      failures: [],
      fixNodes: [fixNode],
      reason: 'intent-expansion',
      repoRoot: tmpDir,
    });

    // Both should exist and have different names
    expect(existsSync(result1)).toBe(true);
    expect(existsSync(result2)).toBe(true);
    expect(result1).not.toEqual(result2);

    const name1 = result1.split('/').pop();
    const name2 = result2.split('/').pop();

    // Should be chronologically sortable
    expect(name1! < name2!).toBe(true);
  });

  it('handles nodes with custom ambient and validate rules', async () => {
    const validate: ValidationRule[] = [
      {
        type: 'artifact-exists',
        target: 'src/output.ts',
      },
      {
        type: 'shell',
        command: 'tsc --noEmit',
      },
    ];

    const parentNode: NodeSpec<any, any> = {
      id: 'plan-complex',
      desc: 'Complex plan',
      produces: ['src/output.ts'],
      consumes: ['src/input.ts'],
      ambient: ['docs/spec.md', 'tsconfig.json'],
      deps: [],
      validate,
      idempotent: true,
    };

    const fixNode: FixNodeSpec = {
      id: 'plan-complex-fix-0',
      desc: 'Fix: complex implementation',
      expandedFrom: 'plan-complex',
      produces: ['src/output.ts'],
      consumes: ['src/input.ts'],
      ambient: ['docs/spec.md', 'tsconfig.json'],
      validate,
      idempotent: true,
      _intentDiagnosis: {
        statement: 'Complex intent',
        achievedConfidence: 0.5,
        threshold: 0.9,
        reasoning: 'Complex work',
        evidence: [],
        expansionDepth: 1,
      },
    };

    const result = writeExpansionScript({
      parentId: 'plan-complex',
      parentNode,
      failures: [],
      fixNodes: [fixNode],
      reason: 'intent-expansion',
      repoRoot: tmpDir,
    });

    const content = readFileSync(result, 'utf-8');

    // Verify ambient and validate are preserved
    expect(content).toContain('docs/spec.md');
    expect(content).toContain('tsconfig.json');
    expect(content).toContain('artifact-exists');
    expect(content).toContain('shell');
  });

  it('returns absolute path to generated script', async () => {
    const parentNode: NodeSpec<any, any> = {
      id: 'plan-path',
      desc: 'Path test',
      produces: [],
      consumes: [],
      deps: [],
      validate: [],
      idempotent: true,
    };

    const fixNode: FixNodeSpec = {
      id: 'plan-path-fix-0',
      desc: 'Fix',
      expandedFrom: 'plan-path',
      produces: [],
      consumes: [],
      validate: [],
      idempotent: true,
      _intentDiagnosis: {
        statement: 'test',
        achievedConfidence: 0.5,
        threshold: 0.9,
        reasoning: 'test',
        evidence: [],
        expansionDepth: 1,
      },
    };

    const result = writeExpansionScript({
      parentId: 'plan-path',
      parentNode,
      failures: [],
      fixNodes: [fixNode],
      reason: 'intent-expansion',
      repoRoot: tmpDir,
    });

    // Should be absolute path
    expect(result).toMatch(/^\/.*\.ts$/);
    expect(result).toContain('.roadmap/expansions');
  });

  it('preserves exact JSON structure of fix nodes', async () => {
    const parentNode: NodeSpec<any, any> = {
      id: 'plan-json',
      desc: 'JSON preservation test',
      produces: ['src/a.ts', 'src/b.ts'],
      consumes: ['src/input.ts'],
      deps: [],
      validate: [],
      idempotent: true,
    };

    const fixNode: FixNodeSpec = {
      id: 'plan-json-fix-0',
      desc: 'Fix with multiple produces/consumes',
      expandedFrom: 'plan-json',
      produces: ['src/a.ts', 'src/b.ts'],
      consumes: ['src/input.ts', 'src/base.ts'],
      ambient: ['config.json'],
      validate: [
        {
          type: 'intent',
          statement: 'Module A is complete',
          confidence: 0.9,
          evaluator: 'self',
        },
      ],
      idempotent: true,
      _intentDiagnosis: {
        statement: 'Module A and B complete',
        achievedConfidence: 0.65,
        threshold: 0.9,
        reasoning: 'Both modules started, B incomplete',
        evidence: ['src/a.ts:1-50', 'src/b.ts:1-10'],
        expansionDepth: 2,
      },
    };

    const result = writeExpansionScript({
      parentId: 'plan-json',
      parentNode,
      failures: [],
      fixNodes: [fixNode],
      reason: 'intent-expansion',
      repoRoot: tmpDir,
    });

    const content = readFileSync(result, 'utf-8');

    // Parse the script to verify JSON is valid
    expect(() => {
      // Extract the JSON assignment and validate
      const match = content.match(/dag\.nodes\['plan-json-fix-0'\] = ({[\s\S]*?});/);
      if (match) {
        JSON.parse(match[1]);
      }
    }).not.toThrow();

    // Verify all properties are present
    expect(content).toContain('src/a.ts');
    expect(content).toContain('src/b.ts');
    expect(content).toContain('src/input.ts');
    expect(content).toContain('src/base.ts');
    expect(content).toContain('config.json');
    expect(content).toContain('Module A and B complete');
    expect(content).toContain('0.65');
    expect(content).toContain('2'); // expansion depth
  });
});
