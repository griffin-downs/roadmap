/**
 * Audit trail tests: verify logging and querying of operations.
 * Surface audit tests: schema validation, engine scanning, CLI invocation.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { AuditTrail } from '../src/audit';
import fs from 'fs';
import path from 'path';
import { tmpdir } from 'os';

describe('audit trail', () => {
  let trail: AuditTrail;
  const testDir = path.join(tmpdir(), `.roadmap-test-${process.pid}`);

  beforeEach(() => {
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }
    trail = new AuditTrail(testDir);
  });

  afterEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true });
    }
  });

  it('logs orient operation', () => {
    trail.logOrient({
      position: 'phase-1',
      produces: ['dist/app.js'],
      consumes: ['src/main.ts'],
      done: 5,
      remaining: 10,
    });

    const entries = trail.readLocal();
    expect(entries.length).toBe(1);
    expect(entries[0].type).toBe('orient');
  });

  it('logs modify operation', () => {
    trail.logModify({ operation: 'add', nodeId: 'build' });
    const entries = trail.readLocal();
    expect(entries.length).toBe(1);
    expect(entries[0].type).toBe('modify');
  });

  it('logs checkpoint creation', () => {
    trail.logCheckpoint({ label: 'v1.0.0', position: 'phase-2-term' });
    const entries = trail.readLocal();
    expect(entries.length).toBe(1);
    expect(entries[0].type).toBe('checkpoint');
  });

  it('logs error operation', () => {
    trail.logError({ operation: 'orient', code: 'ERROR' });
    const entries = trail.readLocal();
    expect(entries[0].type).toBe('error');
  });

  it('filters entries by type', () => {
    trail.logOrient({ position: 'a', produces: [], consumes: [], done: 0, remaining: 1 });
    trail.logModify({ operation: 'add', nodeId: 'x' });
    trail.logOrient({ position: 'b', produces: [], consumes: [], done: 1, remaining: 0 });

    const orients = trail.filterByType('orient');
    expect(orients.length).toBe(2);
  });

  it('gets last N entries', () => {
    for (let i = 0; i < 5; i++) {
      trail.logOrient({ position: `p${i}`, produces: [], consumes: [], done: i, remaining: 5 - i });
    }
    const last2 = trail.last(2);
    expect(last2.length).toBe(2);
  });

  it('handles empty trail', () => {
    expect(trail.readLocal()).toEqual([]);
    expect(trail.last(5)).toEqual([]);
  });

  it('includes timestamp in entries', () => {
    trail.logOrient({ position: 'p1', produces: [], consumes: [], done: 1, remaining: 5 });
    const entries = trail.readLocal();
    expect(entries[0].timestamp).toBeDefined();
    expect(typeof entries[0].timestamp).toBe('string');
  });

  it('archives local trail', () => {
    trail.logOrient({ position: 'p1', produces: [], consumes: [], done: 1, remaining: 5 });
    const trailPath = path.join(testDir, 'trail.jsonl');
    expect(fs.existsSync(trailPath)).toBe(true);

    trail.archive();
    expect(fs.existsSync(trailPath)).toBe(false);
  });
});

// --- Surface audit schemas + engine ---

import { validateSurface, validatePlan, validateResult } from '../src/lib/audit/audit-schema.ts';
import type { SurfaceSchema, PlanSchema, ResultSchema } from '../src/lib/audit/audit-schema.ts';
import { scanSurface, buildImportGraph, scoreArchival } from '../src/lib/audit/audit-engine.ts';

describe('audit-schema validators', () => {
  it('validateSurface accepts valid schema', () => {
    const surface: SurfaceSchema = {
      version: 1,
      timestamp: new Date().toISOString(),
      root: '/tmp/test',
      files: [
        { path: 'src/index.ts', role: 'core', hash: 'abc123', sizeBytes: 100 },
      ],
      summary: { total: 1, byRole: { core: 1 } as any },
    };
    const result = validateSurface(surface);
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('validateSurface rejects missing fields', () => {
    const result = validateSurface({ version: 2 });
    expect(result.ok).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('validatePlan accepts valid plan', () => {
    const plan: PlanSchema = {
      version: 1,
      timestamp: new Date().toISOString(),
      ops: [{ type: 'move', from: 'a.ts', to: 'b.ts', hash: 'abc' }],
      order: ['a.ts'],
      sourceHashes: { 'a.ts': 'abc' },
    };
    expect(validatePlan(plan).ok).toBe(true);
  });

  it('validatePlan rejects bad ops', () => {
    const result = validatePlan({ version: 1, timestamp: 'x', ops: [{ type: 'unknown' }], order: [], sourceHashes: {} });
    expect(result.ok).toBe(false);
  });

  it('validateResult accepts valid result', () => {
    const result: ResultSchema = {
      version: 1,
      timestamp: new Date().toISOString(),
      applied: [],
      skipped: [],
      hashes: { before: {}, after: {} },
      receipt: { ok: true, errors: [], duration_ms: 50 },
    };
    expect(validateResult(result).ok).toBe(true);
  });

  it('validateResult rejects missing receipt', () => {
    const result = validateResult({ version: 1, timestamp: 'x', applied: [], skipped: [], hashes: { before: {}, after: {} } });
    expect(result.ok).toBe(false);
  });
});

describe('audit-engine', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = path.join(tmpdir(), `.roadmap-audit-test-${process.pid}-${Date.now()}`);
    fs.mkdirSync(path.join(testDir, 'src/lib'), { recursive: true });
    fs.mkdirSync(path.join(testDir, 'src/cli'), { recursive: true });
    fs.mkdirSync(path.join(testDir, 'tests'), { recursive: true });

    fs.writeFileSync(path.join(testDir, 'src/lib/core.ts'), `
export function greet(name: string): string { return 'hi ' + name; }
`);
    fs.writeFileSync(path.join(testDir, 'src/lib/util.ts'), `
import { greet } from './core.ts';
export const hello = greet('world');
`);
    fs.writeFileSync(path.join(testDir, 'src/cli/main.ts'), `
import { hello } from '../lib/util.ts';
console.log(hello);
`);
    fs.writeFileSync(path.join(testDir, 'tests/core.test.ts'), `
import { greet } from '../src/lib/core.ts';
`);
  });

  afterEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true });
    }
  });

  it('scanSurface returns valid SurfaceSchema', () => {
    const surface = scanSurface(testDir);
    expect(surface.version).toBe(1);
    expect(surface.files.length).toBe(4);
    expect(surface.summary.total).toBe(4);
    const result = validateSurface(surface);
    expect(result.ok).toBe(true);
  });

  it('scanSurface classifies roles correctly', () => {
    const surface = scanSurface(testDir);
    const roles = Object.fromEntries(surface.files.map(f => [f.path, f.role]));
    expect(roles['src/lib/core.ts']).toBe('lib');
    expect(roles['tests/core.test.ts']).toBe('test');
  });

  it('buildImportGraph detects edges', () => {
    const surface = scanSurface(testDir);
    const graph = buildImportGraph(surface);
    expect(graph.edges.length).toBeGreaterThan(0);
    // util imports core
    const utilToCore = graph.edges.find(e => e.from.includes('util') && e.to.includes('core'));
    expect(utilToCore).toBeDefined();
  });

  it('buildImportGraph computes in/out degree', () => {
    const surface = scanSurface(testDir);
    const graph = buildImportGraph(surface);
    // core.ts is imported by util.ts and core.test.ts
    expect(graph.inDegree['src/lib/core.ts']).toBeGreaterThanOrEqual(1);
  });

  it('scoreArchival ranks candidates', () => {
    const surface = scanSurface(testDir);
    const graph = buildImportGraph(surface);
    const scores = scoreArchival(surface, graph);
    expect(scores.length).toBe(surface.files.length);
    // Sorted descending
    for (let i = 1; i < scores.length; i++) {
      expect(scores[i - 1].score).toBeGreaterThanOrEqual(scores[i].score);
    }
  });
});
