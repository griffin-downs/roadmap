import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  buildPlanOverlay, writePlanOverlay, loadPlanOverlay, isOverlayValid,
} from '../src/lib/plan-overlay.js';

function makeTmpDir(): string {
  return mkdtempSync(join(tmpdir(), 'po-test-'));
}

function writeHeadJson(dir: string, content: object): void {
  const roadmapDir = join(dir, '.roadmap');
  mkdirSync(roadmapDir, { recursive: true });
  writeFileSync(join(roadmapDir, 'head.json'), JSON.stringify(content, null, 2));
}

describe('plan-overlay', () => {
  let tmp: string;
  beforeEach(() => { tmp = makeTmpDir(); });
  afterEach(() => { rmSync(tmp, { recursive: true, force: true }); });

  describe('buildPlanOverlay', () => {
    it('builds overlay from clusters and schedule', () => {
      writeHeadJson(tmp, { id: 'test-dag', nodes: {} });
      const clusters = [
        { id: 'c1', nodes: ['a', 'b'], produces: ['a.ts'], consumes: [] },
        { id: 'c2', nodes: ['c'], produces: ['c.ts'], consumes: ['a.ts'] },
      ];
      const schedule = [
        { wave: 0, spawn: ['c1'] },
        { wave: 1, spawn: ['c2'] },
      ];

      const overlay = buildPlanOverlay(tmp, 'plan-v1', clusters, schedule);
      expect(overlay.schemaVersion).toBe(1);
      expect(overlay.candidateId).toBe('plan-v1');
      expect(overlay.clusters).toHaveLength(2);
      expect(overlay.schedule).toHaveLength(2);
      expect(overlay.schedule[0].wave).toBe(0);
      expect(overlay.schedule[1].wave).toBe(1);
    });

    it('throws when no head.json exists', () => {
      expect(() => buildPlanOverlay(tmp, 'x', [], [])).toThrow('No head.json');
    });

    it('produces deterministic overlayHash', () => {
      writeHeadJson(tmp, { id: 'test', nodes: {} });
      const clusters = [{ id: 'c1', nodes: ['a'], produces: [], consumes: [] }];
      const schedule = [{ wave: 0, spawn: ['c1'] }];

      const o1 = buildPlanOverlay(tmp, 'plan', clusters, schedule);
      const o2 = buildPlanOverlay(tmp, 'plan', clusters, schedule);
      expect(o1.overlayHash).toBe(o2.overlayHash);
    });
  });

  describe('write/load', () => {
    it('round-trips overlay through disk', () => {
      writeHeadJson(tmp, { id: 'test', nodes: {} });
      const overlay = buildPlanOverlay(tmp, 'plan-v1', [], []);
      const path = writePlanOverlay(tmp, overlay);
      expect(existsSync(path)).toBe(true);

      const loaded = loadPlanOverlay(tmp);
      expect(loaded).not.toBeNull();
      expect(loaded!.candidateId).toBe('plan-v1');
      expect(loaded!.overlayHash).toBe(overlay.overlayHash);
    });
  });

  describe('isOverlayValid', () => {
    it('returns true when DAG unchanged', () => {
      writeHeadJson(tmp, { id: 'test', nodes: {} });
      const overlay = buildPlanOverlay(tmp, 'plan-v1', [], []);
      expect(isOverlayValid(tmp, overlay)).toBe(true);
    });

    it('returns false when DAG mutated', () => {
      writeHeadJson(tmp, { id: 'test', nodes: {} });
      const overlay = buildPlanOverlay(tmp, 'plan-v1', [], []);
      // Mutate the DAG
      writeHeadJson(tmp, { id: 'test-modified', nodes: { x: {} } });
      expect(isOverlayValid(tmp, overlay)).toBe(false);
    });
  });
});
