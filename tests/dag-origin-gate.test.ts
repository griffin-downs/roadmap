import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { validateDagOrigin, type ValidateResult } from '../scripts/validate-dag-origin.ts';

function makeOrigin(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schemaVersion: 1,
    engine: 'spec-kit',
    version: '1.0.0',
    compile_hash: 'a'.repeat(64),
    spec_sha: 'b'.repeat(64),
    importedAt: '2026-03-03T00:00:00Z',
    dagId: 'test-dag',
    ...overrides,
  };
}

function makeHead(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'test-dag',
    desc: 'test',
    init: 'init',
    term: 'term',
    nodes: {},
    ...overrides,
  };
}

function setupRepo(): string {
  const root = mkdtempSync(join(tmpdir(), 'dag-origin-'));
  mkdirSync(join(root, '.roadmap'), { recursive: true });
  return root;
}

describe('validateDagOrigin', () => {
  let root: string;

  beforeEach(() => { root = setupRepo(); });
  afterEach(() => { rmSync(root, { recursive: true, force: true }); });

  // Test 1: Missing spec-origin.json
  it('rejects when spec-origin.json is missing', () => {
    const result = validateDagOrigin(root);
    expect(result.ok).toBe(false);
    expect(result.code).toBe('missing-origin');
    expect(result.message).toContain('Missing');
    expect(result.fix).toContain('roadmap make');
  });

  // Test 2: Valid spec-origin.json
  it('accepts valid spec-origin.json', () => {
    writeFileSync(join(root, '.roadmap/spec-origin.json'), JSON.stringify(makeOrigin()));
    const result = validateDagOrigin(root);
    expect(result.ok).toBe(true);
    expect(result.code).toBe('valid');
  });

  // Test 3: Corrupt JSON
  it('rejects corrupt JSON in spec-origin.json', () => {
    writeFileSync(join(root, '.roadmap/spec-origin.json'), '{not valid json');
    const result = validateDagOrigin(root);
    expect(result.ok).toBe(false);
    expect(result.code).toBe('invalid-format');
    expect(result.message).toContain('not valid JSON');
  });

  // Test 4: Wrong schema version
  it('rejects wrong schemaVersion', () => {
    writeFileSync(join(root, '.roadmap/spec-origin.json'), JSON.stringify(makeOrigin({ schemaVersion: 2 })));
    const result = validateDagOrigin(root);
    expect(result.ok).toBe(false);
    expect(result.code).toBe('invalid-format');
  });

  // Test 5: Invalid hash format (not 64 hex chars)
  it('rejects invalid compile_hash format', () => {
    writeFileSync(join(root, '.roadmap/spec-origin.json'), JSON.stringify(makeOrigin({ compile_hash: 'short' })));
    const result = validateDagOrigin(root);
    expect(result.ok).toBe(false);
    expect(result.code).toBe('invalid-format');
  });

  // Test 6: Invalid spec_sha format
  it('rejects invalid spec_sha format', () => {
    writeFileSync(join(root, '.roadmap/spec-origin.json'), JSON.stringify(makeOrigin({ spec_sha: 'ZZZZ' })));
    const result = validateDagOrigin(root);
    expect(result.ok).toBe(false);
    expect(result.code).toBe('invalid-format');
  });

  // Test 7: DAG ID mismatch between head.json and spec-origin.json
  it('rejects dag-id mismatch with head.json', () => {
    writeFileSync(join(root, '.roadmap/spec-origin.json'), JSON.stringify(makeOrigin({ dagId: 'origin-dag' })));
    writeFileSync(join(root, '.roadmap/head.json'), JSON.stringify(makeHead({ id: 'different-dag' })));
    const result = validateDagOrigin(root);
    expect(result.ok).toBe(false);
    expect(result.code).toBe('dag-id-mismatch');
    expect(result.message).toContain('origin-dag');
    expect(result.message).toContain('different-dag');
  });

  // Test 8: Matching dag-id between head.json and spec-origin.json
  it('accepts matching dag-id', () => {
    writeFileSync(join(root, '.roadmap/spec-origin.json'), JSON.stringify(makeOrigin({ dagId: 'my-dag' })));
    writeFileSync(join(root, '.roadmap/head.json'), JSON.stringify(makeHead({ id: 'my-dag' })));
    const result = validateDagOrigin(root);
    expect(result.ok).toBe(true);
    expect(result.code).toBe('valid');
  });

  // Test 9: Missing required fields
  it('rejects missing engine field', () => {
    const origin = makeOrigin();
    delete origin.engine;
    writeFileSync(join(root, '.roadmap/spec-origin.json'), JSON.stringify(origin));
    const result = validateDagOrigin(root);
    expect(result.ok).toBe(false);
    expect(result.code).toBe('invalid-format');
  });

  // Test 10: Empty string fields rejected
  it('rejects empty engine string', () => {
    writeFileSync(join(root, '.roadmap/spec-origin.json'), JSON.stringify(makeOrigin({ engine: '' })));
    const result = validateDagOrigin(root);
    expect(result.ok).toBe(false);
    expect(result.code).toBe('invalid-format');
  });

  // Test 11: Valid origin with no head.json (new DAG scenario)
  it('accepts valid origin when head.json does not exist yet', () => {
    writeFileSync(join(root, '.roadmap/spec-origin.json'), JSON.stringify(makeOrigin()));
    // No head.json — this is fine, origin is valid on its own
    const result = validateDagOrigin(root);
    expect(result.ok).toBe(true);
  });
});
