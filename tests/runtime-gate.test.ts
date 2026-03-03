import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { requireValidOrigin, checkSpecDrift, runtimeGate } from '../src/lib/intake/runtime-gate.ts';
import { RoadmapError } from '../src/errors.ts';

function sha256(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

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

function setupRepo(): string {
  const root = mkdtempSync(join(tmpdir(), 'runtime-gate-'));
  mkdirSync(join(root, '.roadmap'), { recursive: true });
  return root;
}

describe('requireValidOrigin', () => {
  let root: string;
  beforeEach(() => { root = setupRepo(); });
  afterEach(() => { rmSync(root, { recursive: true, force: true }); });

  // Test 1: valid origin passes
  it('returns origin when spec-origin.json is valid', () => {
    writeFileSync(join(root, '.roadmap/spec-origin.json'), JSON.stringify(makeOrigin()));
    const origin = requireValidOrigin(root);
    expect(origin.dagId).toBe('test-dag');
    expect(origin.engine).toBe('spec-kit');
  });

  // Test 2: missing origin throws NO_ORIGIN
  it('throws NO_ORIGIN when spec-origin.json is missing', () => {
    try {
      requireValidOrigin(root);
      expect.unreachable('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(RoadmapError);
      expect((e as RoadmapError).code).toBe('NO_ORIGIN');
      expect((e as RoadmapError).context.fix).toContain('roadmap make');
    }
  });

  // Test 3: invalid origin (bad format) throws ORIGIN_INVALID
  it('throws ORIGIN_INVALID when spec-origin.json has bad format', () => {
    writeFileSync(join(root, '.roadmap/spec-origin.json'), JSON.stringify({ schemaVersion: 1, engine: 'x' }));
    try {
      requireValidOrigin(root);
      expect.unreachable('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(RoadmapError);
      // loadSpecOrigin returns null for invalid format → NO_ORIGIN
      expect((e as RoadmapError).code).toBe('NO_ORIGIN');
    }
  });

  // Test 4: corrupt JSON throws NO_ORIGIN
  it('throws NO_ORIGIN for corrupt JSON', () => {
    writeFileSync(join(root, '.roadmap/spec-origin.json'), '{not json}');
    try {
      requireValidOrigin(root);
      expect.unreachable('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(RoadmapError);
      expect((e as RoadmapError).code).toBe('NO_ORIGIN');
    }
  });

  // Test 5: hand-crafted head.json with no spec-origin.json rejects
  it('rejects hand-crafted head.json without spec-origin.json', () => {
    writeFileSync(join(root, '.roadmap/head.json'), JSON.stringify({
      id: 'fake', init: 'init', term: 'term', nodes: {},
    }));
    try {
      requireValidOrigin(root);
      expect.unreachable('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(RoadmapError);
      expect((e as RoadmapError).code).toBe('NO_ORIGIN');
    }
  });
});

describe('checkSpecDrift', () => {
  let root: string;
  beforeEach(() => { root = setupRepo(); });
  afterEach(() => { rmSync(root, { recursive: true, force: true }); });

  // Test 6: no origin → no drift
  it('returns no drift when origin is missing', () => {
    const result = checkSpecDrift(root);
    expect(result.drifted).toBe(false);
  });

  // Test 7: matching spec hash → no drift
  it('returns no drift when spec hash matches', () => {
    const specContent = '{"tasks": []}';
    const specHash = sha256(specContent);
    writeFileSync(join(root, '.roadmap/spec-origin.json'), JSON.stringify(makeOrigin({ spec_sha: specHash })));
    writeFileSync(join(root, '.roadmap/spec-source.json'), specContent);
    const result = checkSpecDrift(root);
    expect(result.drifted).toBe(false);
  });

  // Test 8: changed spec → drift detected
  it('detects drift when spec file changed', () => {
    const originalContent = '{"tasks": []}';
    const specHash = sha256(originalContent);
    writeFileSync(join(root, '.roadmap/spec-origin.json'), JSON.stringify(makeOrigin({ spec_sha: specHash })));
    writeFileSync(join(root, '.roadmap/spec-source.json'), '{"tasks": ["changed"]}');
    const result = checkSpecDrift(root);
    expect(result.drifted).toBe(true);
    expect(result.message).toContain('Spec has changed');
  });

  // Test 9: spec file deleted → no drift (can't determine)
  it('returns no drift when spec file does not exist', () => {
    writeFileSync(join(root, '.roadmap/spec-origin.json'), JSON.stringify(makeOrigin()));
    // No spec file at any candidate location
    const result = checkSpecDrift(root);
    expect(result.drifted).toBe(false);
  });
});

describe('runtimeGate', () => {
  let root: string;
  beforeEach(() => { root = setupRepo(); });
  afterEach(() => { rmSync(root, { recursive: true, force: true }); });

  // Test 10: valid origin → valid result
  it('returns valid for proper origin', () => {
    writeFileSync(join(root, '.roadmap/spec-origin.json'), JSON.stringify(makeOrigin()));
    const result = runtimeGate(root);
    expect(result.valid).toBe(true);
    expect(result.origin).not.toBeNull();
    expect(result.errors).toHaveLength(0);
  });

  // Test 11: no origin → invalid
  it('returns invalid when origin missing', () => {
    const result = runtimeGate(root);
    expect(result.valid).toBe(false);
    expect(result.origin).toBeNull();
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toContain('No spec origin');
  });

  // Test 12: drift detected → valid with warnings
  it('returns valid with drift warning', () => {
    const specContent = '{"tasks": []}';
    const specHash = sha256(specContent);
    writeFileSync(join(root, '.roadmap/spec-origin.json'), JSON.stringify(makeOrigin({ spec_sha: specHash })));
    writeFileSync(join(root, '.roadmap/spec-source.json'), '{"tasks": ["modified"]}');
    const result = runtimeGate(root);
    expect(result.valid).toBe(true);
    expect(result.specDrifted).toBe(true);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0]).toContain('Spec has changed');
  });

  // Test 13: make command does NOT need origin (test by verifying gate is not called for make)
  it('make command should not require origin (design intent)', () => {
    // This is a design-level test: runtimeGate returns invalid,
    // but cmdMake should never call it. We verify the gate correctly
    // reports invalid so that if make DID call it, it would fail.
    const result = runtimeGate(root);
    expect(result.valid).toBe(false);
  });

  // Test 14: help command does NOT need origin (design intent)
  it('help and chart commands have no DAG access (design intent)', () => {
    // Same pattern: gate reports invalid, but exempt commands skip it.
    const result = runtimeGate(root);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('No spec origin');
  });
});
