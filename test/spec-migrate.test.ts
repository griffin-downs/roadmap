import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFileSync, readFileSync, unlinkSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';

// Test suite for spec-migrate command
describe('spec-migrate', () => {
  const tmpDir = '/tmp/roadmap-migrate-test';
  let testSpecPath: string;

  beforeEach(() => {
    // Create test directory
    execSync(`mkdir -p ${tmpDir}`);
    testSpecPath = join(tmpDir, 'legacy-spec.json');
  });

  afterEach(() => {
    // Cleanup test files
    if (existsSync(testSpecPath)) {
      unlinkSync(testSpecPath);
    }
    try {
      execSync(`rm -rf ${tmpDir}`);
    } catch {
      // ignore
    }
  });

  it('should add missing inputs field with computed sha256', () => {
    const legacySpec = {
      dag_id: 'test-dag',
      tasks: [{ id: 'task1', desc: 'Test task', priority: 1, depends: [], produces: [], consumes: [], mode: 'execute', validate: [] }],
    };

    writeFileSync(testSpecPath, JSON.stringify(legacySpec, null, 2));

    // Run migrate command
    const result = execSync(`npx tsx bin/roadmap.ts spec migrate ${testSpecPath} --note "test migrate"`, {
      cwd: process.cwd(),
      encoding: 'utf-8',
    });

    const output = JSON.parse(result);
    expect(output.data.ok).toBe(true);
    expect(output.data.fixed).toContain('inputs');

    // Verify file was updated
    const updated = JSON.parse(readFileSync(testSpecPath, 'utf-8'));
    expect(updated.inputs).toBeDefined();
    expect(Array.isArray(updated.inputs)).toBe(true);
    expect(updated.inputs.length).toBe(1);
    expect(updated.inputs[0].role).toBe('spec');
    expect(updated.inputs[0].sha256).toBeDefined();
    expect(updated.inputs[0].sha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it('should add missing metadata.compile_hash', () => {
    const legacySpec = {
      dag_id: 'test-dag',
      metadata: {},
      tasks: [{ id: 'task1', desc: 'Test task', priority: 1, depends: [], produces: [], consumes: [], mode: 'execute', validate: [] }],
    };

    writeFileSync(testSpecPath, JSON.stringify(legacySpec, null, 2));

    const result = execSync(`npx tsx bin/roadmap.ts spec migrate ${testSpecPath} --note "test migrate"`, {
      cwd: process.cwd(),
      encoding: 'utf-8',
    });

    const output = JSON.parse(result);
    expect(output.data.fixed).toContain('metadata.compile_hash');

    const updated = JSON.parse(readFileSync(testSpecPath, 'utf-8'));
    expect(updated.metadata.compile_hash).toBe('auto');
  });

  it('should add missing metadata.generated', () => {
    const legacySpec = {
      dag_id: 'test-dag',
      metadata: { compile_hash: 'hash123' },
      tasks: [{ id: 'task1', desc: 'Test task', priority: 1, depends: [], produces: [], consumes: [], mode: 'execute', validate: [] }],
    };

    writeFileSync(testSpecPath, JSON.stringify(legacySpec, null, 2));

    const result = execSync(`npx tsx bin/roadmap.ts spec migrate ${testSpecPath} --note "test migrate"`, {
      cwd: process.cwd(),
      encoding: 'utf-8',
    });

    const output = JSON.parse(result);
    expect(output.data.fixed).toContain('metadata.generated');

    const updated = JSON.parse(readFileSync(testSpecPath, 'utf-8'));
    expect(updated.metadata.generated).toBeDefined();
    expect(updated.metadata.generated).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('should add missing engine field', () => {
    const legacySpec = {
      dag_id: 'test-dag',
      metadata: { compile_hash: 'hash123', generated: '2026-03-01T00:00:00Z' },
      tasks: [{ id: 'task1', desc: 'Test task', priority: 1, depends: [], produces: [], consumes: [], mode: 'execute', validate: [] }],
    };

    writeFileSync(testSpecPath, JSON.stringify(legacySpec, null, 2));

    const result = execSync(`npx tsx bin/roadmap.ts spec migrate ${testSpecPath} --note "test migrate"`, {
      cwd: process.cwd(),
      encoding: 'utf-8',
    });

    const output = JSON.parse(result);
    expect(output.data.fixed).toContain('engine');

    const updated = JSON.parse(readFileSync(testSpecPath, 'utf-8'));
    expect(updated.engine).toBeDefined();
    expect(updated.engine.name).toBe('spec-kit');
    expect(updated.engine.version).toBe('1.0.0');
    expect(updated.engine.config_hash).toBeNull();
  });

  it('should copy first task desc to dag_desc if missing', () => {
    const legacySpec = {
      dag_id: 'test-dag',
      metadata: { compile_hash: 'hash123', generated: '2026-03-01T00:00:00Z' },
      tasks: [
        { id: 'task1', desc: 'Initialize the system', priority: 1, depends: [], produces: [], consumes: [], mode: 'execute', validate: [] },
        { id: 'task2', desc: 'Run validation', priority: 2, depends: ['task1'], produces: [], consumes: [], mode: 'execute', validate: [] },
      ],
    };

    writeFileSync(testSpecPath, JSON.stringify(legacySpec, null, 2));

    const result = execSync(`npx tsx bin/roadmap.ts spec migrate ${testSpecPath} --note "test migrate"`, {
      cwd: process.cwd(),
      encoding: 'utf-8',
    });

    const output = JSON.parse(result);
    expect(output.data.fixed).toContain('dag_desc');

    const updated = JSON.parse(readFileSync(testSpecPath, 'utf-8'));
    expect(updated.dag_desc).toBe('Initialize the system');
  });

  it('should add missing schema_version', () => {
    const legacySpec = {
      dag_id: 'test-dag',
      metadata: { compile_hash: 'hash123', generated: '2026-03-01T00:00:00Z' },
      tasks: [{ id: 'task1', desc: 'Test task', priority: 1, depends: [], produces: [], consumes: [], mode: 'execute', validate: [] }],
    };

    writeFileSync(testSpecPath, JSON.stringify(legacySpec, null, 2));

    const result = execSync(`npx tsx bin/roadmap.ts spec migrate ${testSpecPath} --note "test migrate"`, {
      cwd: process.cwd(),
      encoding: 'utf-8',
    });

    const output = JSON.parse(result);
    expect(output.data.fixed).toContain('schema_version');

    const updated = JSON.parse(readFileSync(testSpecPath, 'utf-8'));
    expect(updated.schema_version).toBe(1);
  });

  it('should fix minimal legacy spec with all fields missing', () => {
    const legacySpec = {
      dag_id: 'minimal-dag',
      tasks: [{ id: 'task1', desc: 'Do work', priority: 1, depends: [], produces: [], consumes: [], mode: 'execute', validate: [] }],
    };

    writeFileSync(testSpecPath, JSON.stringify(legacySpec, null, 2));

    const result = execSync(`npx tsx bin/roadmap.ts spec migrate ${testSpecPath} --note "fix minimal spec"`, {
      cwd: process.cwd(),
      encoding: 'utf-8',
    });

    const output = JSON.parse(result);
    expect(output.data.ok).toBe(true);
    expect(output.data.fixed.length).toBeGreaterThan(0);
    expect(output.data.fixed).toContain('inputs');
    expect(output.data.fixed).toContain('metadata.compile_hash');
    expect(output.data.fixed).toContain('metadata.generated');
    expect(output.data.fixed).toContain('engine');
    expect(output.data.fixed).toContain('dag_desc');
    expect(output.data.fixed).toContain('schema_version');

    // Verify all required fields exist
    const updated = JSON.parse(readFileSync(testSpecPath, 'utf-8'));
    expect(updated.inputs).toBeDefined();
    expect(updated.metadata.compile_hash).toBe('auto');
    expect(updated.metadata.generated).toBeDefined();
    expect(updated.engine).toBeDefined();
    expect(updated.dag_desc).toBe('Do work');
    expect(updated.schema_version).toBe(1);
  });

  it('should not duplicate existing fields', () => {
    const existingSpec = {
      dag_id: 'complete-dag',
      dag_desc: 'Already has description',
      schema_version: 1,
      engine: { name: 'custom-engine', version: '2.0.0', config_hash: 'hash' },
      metadata: { compile_hash: 'existing-hash', generated: '2026-01-01T00:00:00Z' },
      inputs: [{ path: 'existing-input.json', sha256: 'abc123', role: 'spec' }],
      tasks: [{ id: 'task1', desc: 'Task', priority: 1, depends: [], produces: [], consumes: [], mode: 'execute', validate: [] }],
    };

    writeFileSync(testSpecPath, JSON.stringify(existingSpec, null, 2));

    const result = execSync(`npx tsx bin/roadmap.ts spec migrate ${testSpecPath} --note "test no-op migrate"`, {
      cwd: process.cwd(),
      encoding: 'utf-8',
    });

    const output = JSON.parse(result);
    expect(output.data.ok).toBe(true);
    expect(output.data.fixed.length).toBe(0); // Nothing should be fixed

    // Verify fields remained unchanged
    const updated = JSON.parse(readFileSync(testSpecPath, 'utf-8'));
    expect(updated.dag_desc).toBe('Already has description');
    expect(updated.engine.name).toBe('custom-engine');
    expect(updated.metadata.compile_hash).toBe('existing-hash');
    expect(updated.inputs[0].sha256).toBe('abc123');
  });

  it('should error on missing file', () => {
    try {
      execSync(`npx tsx bin/roadmap.ts spec migrate /nonexistent/file.json --note "test"`, {
        cwd: process.cwd(),
        encoding: 'utf-8',
      });
      expect.fail('Should have thrown');
    } catch (err: any) {
      expect(err.status).toBe(1);
    }
  });

  it('should error on missing path argument', () => {
    try {
      execSync(`npx tsx bin/roadmap.ts spec migrate --note "test"`, {
        cwd: process.cwd(),
        encoding: 'utf-8',
      });
      expect.fail('Should have thrown');
    } catch (err: any) {
      expect(err.status).toBe(1);
    }
  });
});
