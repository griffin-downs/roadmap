import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  createDispatchPlan, applyDispatchPlan, loadDispatchPlan, dispatchStatus,
} from '../src/lib/recipes/dispatch/dispatch.js';
import type { PlanOverlay } from '../src/lib/plan-overlay.js';

function makeTmpDir(): string {
  return mkdtempSync(join(tmpdir(), 'dispatch-test-'));
}

function makeOverlay(): PlanOverlay {
  return {
    schemaVersion: 1,
    headSha: 'abc123',
    candidateId: 'plan-v1',
    clusters: [
      { id: 'c1', nodes: ['a', 'b'], produces: ['a.ts'], consumes: [] },
      { id: 'c2', nodes: ['c'], produces: ['c.ts'], consumes: ['a.ts'] },
      { id: 'c3', nodes: ['d', 'e'], produces: ['d.ts'], consumes: [] },
    ],
    schedule: [
      { wave: 0, clusterId: 'c1', nodes: ['a', 'b'] },
      { wave: 0, clusterId: 'c3', nodes: ['d', 'e'] },
      { wave: 1, clusterId: 'c2', nodes: ['c'] },
    ],
    builtAt: '2026-01-01T00:00:00.000Z',
    overlayHash: 'overlay123',
  };
}

describe('dispatch', () => {
  let tmp: string;
  beforeEach(() => { tmp = makeTmpDir(); });
  afterEach(() => { rmSync(tmp, { recursive: true, force: true }); });

  describe('createDispatchPlan', () => {
    it('distributes clusters across workers', () => {
      const plan = createDispatchPlan(tmp, makeOverlay(), { workers: 2 });
      expect(plan.schemaVersion).toBe(1);
      expect(plan.worktrees).toHaveLength(3);
      expect(plan.workers).toBe(2);
      // Round-robin: worker-1, worker-2, worker-1
      expect(plan.worktrees[0].owner).toBe('worker-1');
      expect(plan.worktrees[1].owner).toBe('worker-2');
      expect(plan.worktrees[2].owner).toBe('worker-1');
    });

    it('writes plan file', () => {
      const plan = createDispatchPlan(tmp, makeOverlay());
      const planFile = join(tmp, '.roadmap', 'dispatch', `plan-${plan.planHash.slice(0, 12)}.json`);
      expect(existsSync(planFile)).toBe(true);
    });

    it('produces deterministic planHash', () => {
      const overlay = makeOverlay();
      const p1 = createDispatchPlan(tmp, overlay);
      const p2 = createDispatchPlan(tmp, overlay);
      expect(p1.planHash).toBe(p2.planHash);
    });
  });

  describe('applyDispatchPlan', () => {
    it('writes apply receipt', () => {
      const plan = createDispatchPlan(tmp, makeOverlay());
      const result = applyDispatchPlan(tmp, plan);
      expect(result.applied).toBe(true);
      expect(existsSync(result.receiptPath)).toBe(true);
    });
  });

  describe('loadDispatchPlan', () => {
    it('returns null when no plan exists', () => {
      expect(loadDispatchPlan(tmp)).toBeNull();
    });

    it('loads most recent plan', () => {
      const plan = createDispatchPlan(tmp, makeOverlay());
      const loaded = loadDispatchPlan(tmp);
      expect(loaded).not.toBeNull();
      expect(loaded!.planHash).toBe(plan.planHash);
    });
  });

  describe('dispatchStatus', () => {
    it('reports no plan when none exists', () => {
      const status = dispatchStatus(tmp);
      expect(status.hasPlan).toBe(false);
    });

    it('reports plan details and applied state', () => {
      const plan = createDispatchPlan(tmp, makeOverlay());
      let status = dispatchStatus(tmp);
      expect(status.hasPlan).toBe(true);
      expect(status.applied).toBe(false);

      applyDispatchPlan(tmp, plan);
      status = dispatchStatus(tmp);
      expect(status.applied).toBe(true);
    });
  });
});
