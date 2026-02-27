/**
 * Audit trail tests: verify logging and querying of operations.
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
