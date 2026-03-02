// @module artifact-gates-integration
// @exports (test suite)
// @entry test

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  integrateArtifactGates,
  ArtifactGatesIntegrationConfig,
  ArtifactGatesIntegrationResult,
} from '../src/lib/roadmap/artifact-gates-integration';

let testDir: string;

beforeEach(() => {
  testDir = join(tmpdir(), `artifact-gates-integration-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(testDir, { recursive: true });
});

afterEach(() => {
  if (testDir) {
    try {
      rmSync(testDir, { recursive: true, force: true });
    } catch (e) {
      // Cleanup error is non-fatal
    }
  }
});

describe('integrateArtifactGates', () => {
  describe('pre-gate check: no produces', () => {
    it('should pass when node has no produces', async () => {
      const node = {
        id: 'no-produces-node',
        desc: 'A node with no produces',
        // produces intentionally omitted
      };

      const result = await integrateArtifactGates('no-produces-node', node, () => false, testDir);

      expect(result.passed).toBe(true);
      expect(result.nodeId).toBe('no-produces-node');
      expect(result.message).toContain('no produces declared');
      expect(result.gateResults).toHaveLength(0);
    });

    it('should pass when produces is empty array', async () => {
      const node = {
        id: 'empty-produces-node',
        desc: 'A node with empty produces',
        produces: [],
      };

      const result = await integrateArtifactGates('empty-produces-node', node, () => false, testDir);

      expect(result.passed).toBe(true);
      expect(result.message).toContain('no produces declared');
    });
  });

  describe('gate execution: single artifact', () => {
    it('should pass when single artifact exists', async () => {
      writeFileSync(join(testDir, 'output.ts'), 'export const x = 1;');

      const node = {
        id: 'single-artifact-node',
        desc: 'Node with single artifact',
        produces: ['output.ts'],
      };

      const result = await integrateArtifactGates('single-artifact-node', node, (path) => {
        const { existsSync } = require('node:fs');
        return existsSync(join(testDir, path));
      }, testDir);

      expect(result.passed).toBe(true);
      expect(result.failedGates).toHaveLength(0);
      expect(result.message).toContain('artifact gates passed');
    });

    it('should fail when single artifact missing', async () => {
      const node = {
        id: 'missing-artifact-node',
        desc: 'Node with missing artifact',
        produces: ['missing-output.ts'],
      };

      const result = await integrateArtifactGates('missing-artifact-node', node, () => false, testDir);

      expect(result.passed).toBe(false);
      expect(result.failedGates.length).toBeGreaterThan(0);
      const existsGate = result.failedGates.find((g) => g.gate === 'artifact-exists');
      expect(existsGate).toBeDefined();
      expect(existsGate?.error).toContain('artifact');
    });
  });

  describe('gate execution: multiple artifacts', () => {
    it('should pass when all artifacts exist', async () => {
      writeFileSync(join(testDir, 'file1.ts'), 'export const a = 1;');
      writeFileSync(join(testDir, 'file2.ts'), 'export const b = 2;');
      writeFileSync(join(testDir, 'file3.ts'), 'export const c = 3;');

      const node = {
        id: 'multi-artifact-node',
        desc: 'Node with multiple artifacts',
        produces: ['file1.ts', 'file2.ts', 'file3.ts'],
      };

      const result = await integrateArtifactGates('multi-artifact-node', node, (path) => {
        const { existsSync } = require('node:fs');
        return existsSync(join(testDir, path));
      }, testDir);

      expect(result.passed).toBe(true);
    });

    it('should fail when some artifacts missing', async () => {
      writeFileSync(join(testDir, 'file1.ts'), 'export const a = 1;');
      // file2.ts intentionally missing
      writeFileSync(join(testDir, 'file3.ts'), 'export const c = 3;');

      const node = {
        id: 'partial-artifact-node',
        desc: 'Node with partial artifacts',
        produces: ['file1.ts', 'file2.ts', 'file3.ts'],
      };

      const result = await integrateArtifactGates('partial-artifact-node', node, (path) => {
        const { existsSync } = require('node:fs');
        return existsSync(join(testDir, path));
      }, testDir);

      expect(result.passed).toBe(false);
      expect(result.evidence).toContain('file2.ts');
    });

    it('should fail when all artifacts missing', async () => {
      const node = {
        id: 'no-artifacts-node',
        desc: 'Node with no artifacts present',
        produces: ['file1.ts', 'file2.ts', 'file3.ts'],
      };

      const result = await integrateArtifactGates('no-artifacts-node', node, () => false, testDir);

      expect(result.passed).toBe(false);
      expect(result.failedGates.length).toBeGreaterThan(0);
    });
  });

  describe('gate execution: nested paths', () => {
    it('should handle nested artifact paths', async () => {
      mkdirSync(join(testDir, 'src', 'lib', 'modules'), { recursive: true });
      writeFileSync(join(testDir, 'src', 'lib', 'modules', 'index.ts'), 'export const mod = {};');

      const node = {
        id: 'nested-node',
        desc: 'Node with nested artifacts',
        produces: ['src/lib/modules/index.ts'],
      };

      const result = await integrateArtifactGates('nested-node', node, (path) => {
        const { existsSync } = require('node:fs');
        return existsSync(join(testDir, path));
      }, testDir);

      expect(result.passed).toBe(true);
    });
  });

  describe('gate execution: typecheck', () => {
    it('should include typecheck result in gates', async () => {
      const node = {
        id: 'typecheck-node',
        desc: 'Node with typecheck',
        produces: ['output.ts'],
      };

      const result = await integrateArtifactGates('typecheck-node', node, () => false, testDir);

      // Typecheck gate should be included
      const typecheckGate = result.gateResults.find((g) => g.gate === 'artifact-typecheck');
      expect(typecheckGate).toBeDefined();
    });
  });

  describe('gate config building from validate rules', () => {
    it('should extract schema config from validate rules', async () => {
      writeFileSync(join(testDir, 'config.json'), '{"key": "value"}');

      const node = {
        id: 'schema-node',
        desc: 'Node with schema validation',
        produces: ['config.json'],
        validate: [
          {
            type: 'artifact-schema',
            schema: 'config.schema.ts',
            artifactPath: 'config.json',
          },
        ],
      };

      const result = await integrateArtifactGates('schema-node', node, (path) => {
        const { existsSync } = require('node:fs');
        return existsSync(join(testDir, path));
      }, testDir);

      // Should include schema gate (though stubbed to pass)
      const schemaGate = result.gateResults.find((g) => g.gate === 'artifact-schema');
      expect(schemaGate).toBeDefined();
    });

    it('should extract hash config from validate rules', async () => {
      writeFileSync(join(testDir, 'package.json'), '{}');

      const node = {
        id: 'hash-node',
        desc: 'Node with hash validation',
        produces: ['package.json'],
        validate: [
          {
            type: 'artifact-hash',
            expectedHash: 'abc123def456',
            artifactPath: 'package.json',
          },
        ],
      };

      const result = await integrateArtifactGates('hash-node', node, (path) => {
        const { existsSync } = require('node:fs');
        return existsSync(join(testDir, path));
      }, testDir);

      // Should include hash gate (though stubbed to pass)
      const hashGate = result.gateResults.find((g) => g.gate === 'artifact-hash');
      expect(hashGate).toBeDefined();
    });
  });

  describe('result structure', () => {
    it('should return structured result with required fields', async () => {
      const node = {
        id: 'test-node',
        desc: 'Test node',
        produces: [],
      };

      const result = await integrateArtifactGates('test-node', node, () => false, testDir);

      expect(result).toHaveProperty('passed');
      expect(result).toHaveProperty('nodeId');
      expect(result).toHaveProperty('gateResults');
      expect(result).toHaveProperty('failedGates');
      expect(result).toHaveProperty('evidence');
      expect(result).toHaveProperty('message');
      expect(result).toHaveProperty('timestamp');
    });

    it('should populate failedGates only when gates fail', async () => {
      const node = {
        id: 'pass-node',
        desc: 'Node that passes',
        produces: [],
      };

      const result = await integrateArtifactGates('pass-node', node, () => false, testDir);

      expect(result.passed).toBe(true);
      expect(result.failedGates).toHaveLength(0);
    });

    it('should populate failedGates when gates fail', async () => {
      const node = {
        id: 'fail-node',
        desc: 'Node that fails',
        produces: ['missing.ts'],
      };

      const result = await integrateArtifactGates('fail-node', node, () => false, testDir);

      expect(result.passed).toBe(false);
      expect(result.failedGates.length).toBeGreaterThan(0);
    });
  });

  describe('error messaging', () => {
    it('should produce human-readable message for passed gates', async () => {
      const node = {
        id: 'passing-node',
        desc: 'Node that passes',
        produces: [],
      };

      const result = await integrateArtifactGates('passing-node', node, () => false, testDir);

      expect(result.message).toMatch(/artifact gates passed/);
      expect(result.message).toContain('passing-node');
    });

    it('should produce human-readable message for failed gates', async () => {
      const node = {
        id: 'failing-node',
        desc: 'Node that fails',
        produces: ['missing.ts'],
      };

      const result = await integrateArtifactGates('failing-node', node, () => false, testDir);

      expect(result.message).toMatch(/ARTIFACT GATE FAILED/);
      expect(result.message).toContain('failing-node');
    });

    it('should include gate details in error message', async () => {
      const node = {
        id: 'detailed-fail-node',
        desc: 'Node with detailed failure',
        produces: ['missing-file.ts'],
      };

      const result = await integrateArtifactGates('detailed-fail-node', node, () => false, testDir);

      expect(result.message).toContain('artifact-exists');
    });
  });

  describe('timestamp and metadata', () => {
    it('should include ISO timestamp in result', async () => {
      const node = {
        id: 'timestamp-node',
        desc: 'Node with timestamp',
        produces: [],
      };

      const result = await integrateArtifactGates('timestamp-node', node, () => false, testDir);

      expect(result.timestamp).toBeDefined();
      // Should be ISO format (contains T and Z or offset)
      expect(result.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it('should preserve nodeId in result', async () => {
      const nodeId = 'my-special-node-id';
      const node = {
        id: nodeId,
        desc: 'Node with special ID',
        produces: [],
      };

      const result = await integrateArtifactGates(nodeId, node, () => false, testDir);

      expect(result.nodeId).toBe(nodeId);
    });
  });

  describe('integration scenario: completion flow', () => {
    it('should simulate completion flow: artifacts exist, gates pass', async () => {
      writeFileSync(join(testDir, 'index.ts'), 'export const idx = 1;');
      writeFileSync(join(testDir, 'index.test.ts'), 'test("idx", () => {});');

      const node = {
        id: 'completion-node',
        desc: 'Node ready for completion',
        produces: ['index.ts', 'index.test.ts'],
      };

      const result = await integrateArtifactGates('completion-node', node, (path) => {
        const { existsSync } = require('node:fs');
        return existsSync(join(testDir, path));
      }, testDir);

      // Should be ready for completion
      expect(result.passed).toBe(true);
      expect(result.message).toContain('artifact gates passed');
      // No gate failures should block progress
      expect(result.failedGates.filter((g) => g.severity === 'error')).toHaveLength(0);
    });

    it('should simulate completion flow: artifacts missing, gates fail, block completion', async () => {
      const node = {
        id: 'incomplete-node',
        desc: 'Node not ready for completion',
        produces: ['missing-index.ts', 'missing-index.test.ts'],
      };

      const result = await integrateArtifactGates('incomplete-node', node, () => false, testDir);

      // Should block completion
      expect(result.passed).toBe(false);
      expect(result.message).toContain('ARTIFACT GATE FAILED');
      // Should have error-severity failures
      const errorGates = result.failedGates.filter((g) => g.severity === 'error');
      expect(errorGates.length).toBeGreaterThan(0);
    });
  });
});
