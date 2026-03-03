// @module metrics-extractor-tests
// @purpose Unit tests for SLO metrics extraction from trail.jsonl

import { describe, it, expect } from 'vitest';
import { MetricsExtractor, TrailEntry } from '../src/metrics-extractor.ts';

function makeEntry(overrides: Partial<TrailEntry>): TrailEntry {
  return { ts: new Date().toISOString(), cmd: 'orient', repo: 'test', position: [], level: 0, ...overrides };
}

describe('MetricsExtractor', () => {
  describe('commandCounts', () => {
    it('counts commands by type', () => {
      const entries = [
        makeEntry({ cmd: 'orient' }),
        makeEntry({ cmd: 'orient' }),
        makeEntry({ cmd: 'complete' }),
        makeEntry({ cmd: 'validate' }),
      ];
      const ext = new MetricsExtractor(entries);
      const counts = ext.commandCounts();
      expect(counts.orient).toBe(2);
      expect(counts.complete).toBe(1);
      expect(counts.validate).toBe(1);
    });

    it('handles type field as fallback', () => {
      const entries = [
        makeEntry({ cmd: undefined, type: 'checkpoint' }),
      ];
      const ext = new MetricsExtractor(entries);
      expect(ext.commandCounts().checkpoint).toBe(1);
    });
  });

  describe('sessions', () => {
    it('splits sessions by 30min gap', () => {
      const t0 = new Date('2026-01-01T10:00:00Z');
      const entries = [
        makeEntry({ ts: t0.toISOString(), repo: 'r1' }),
        makeEntry({ ts: new Date(t0.getTime() + 5 * 60_000).toISOString(), repo: 'r1' }),
        // 2-hour gap -> new session
        makeEntry({ ts: new Date(t0.getTime() + 125 * 60_000).toISOString(), repo: 'r1' }),
      ];
      const ext = new MetricsExtractor(entries);
      const sessions = ext.sessions();
      expect(sessions.length).toBe(2);
      expect(sessions[0].commandCount).toBe(2);
      expect(sessions[1].commandCount).toBe(1);
    });

    it('separates repos into different sessions', () => {
      const ts = '2026-01-01T10:00:00Z';
      const entries = [
        makeEntry({ ts, repo: 'r1' }),
        makeEntry({ ts, repo: 'r2' }),
      ];
      const ext = new MetricsExtractor(entries);
      const sessions = ext.sessions();
      expect(sessions.length).toBe(2);
      expect(sessions.map(s => s.repo).sort()).toEqual(['r1', 'r2']);
    });

    it('tracks nodesCompleted from complete commands', () => {
      const t0 = '2026-01-01T10:00:00Z';
      const entries = [
        makeEntry({ ts: t0, cmd: 'orient', repo: 'r1' }),
        makeEntry({ ts: t0, cmd: 'complete', repo: 'r1' }),
        makeEntry({ ts: t0, cmd: 'complete', repo: 'r1' }),
      ];
      const ext = new MetricsExtractor(entries);
      expect(ext.sessions()[0].nodesCompleted).toBe(2);
    });
  });

  describe('nodeMetrics', () => {
    it('tracks nodes from position arrays', () => {
      const t0 = '2026-01-01T10:00:00Z';
      const t1 = '2026-01-01T10:05:00Z';
      const entries = [
        makeEntry({ ts: t0, position: ['node-a', 'node-b'], repo: 'r1' }),
        makeEntry({ ts: t1, position: ['node-a'], repo: 'r1' }),
      ];
      const ext = new MetricsExtractor(entries);
      const nodes = ext.nodeMetrics();
      const nodeA = nodes.find(n => n.nodeId === 'node-a');
      expect(nodeA).toBeDefined();
      expect(nodeA!.durationMs).toBe(5 * 60_000);
    });

    it('marks completed nodes', () => {
      const t0 = '2026-01-01T10:00:00Z';
      const entries = [
        makeEntry({ ts: t0, position: ['node-a'], repo: 'r1' }),
        makeEntry({ ts: t0, cmd: 'complete', nodeId: 'node-a', repo: 'r1' }),
      ];
      const ext = new MetricsExtractor(entries);
      const nodeA = ext.nodeMetrics().find(n => n.nodeId === 'node-a');
      expect(nodeA!.completed).toBe(true);
    });

    it('tracks nodes from nodeId field', () => {
      const t0 = '2026-01-01T10:00:00Z';
      const entries = [
        makeEntry({ ts: t0, cmd: 'complete', nodeId: 'node-x', repo: 'r1', position: undefined }),
      ];
      const ext = new MetricsExtractor(entries);
      const nodeX = ext.nodeMetrics().find(n => n.nodeId === 'node-x');
      expect(nodeX).toBeDefined();
    });
  });

  describe('batchMetrics', () => {
    it('groups by repo and level', () => {
      const t0 = '2026-01-01T10:00:00Z';
      const t1 = '2026-01-01T10:10:00Z';
      const entries = [
        makeEntry({ ts: t0, level: 1, position: ['a', 'b'], repo: 'r1' }),
        makeEntry({ ts: t1, level: 1, position: ['a'], repo: 'r1' }),
        makeEntry({ ts: t0, level: 2, position: ['c'], repo: 'r1' }),
      ];
      const ext = new MetricsExtractor(entries);
      const batches = ext.batchMetrics();
      expect(batches.length).toBe(2);
      const b1 = batches.find(b => b.level === 1);
      expect(b1!.nodeCount).toBe(2);
      expect(b1!.nodes.sort()).toEqual(['a', 'b']);
      expect(b1!.durationMs).toBe(10 * 60_000);
    });

    it('computes completion velocity', () => {
      const t0 = '2026-01-01T10:00:00Z';
      const t1 = '2026-01-01T11:00:00Z'; // 1 hour later
      const entries = [
        makeEntry({ ts: t0, level: 1, position: ['a', 'b', 'c'], repo: 'r1' }),
        makeEntry({ ts: t1, level: 1, position: ['a'], repo: 'r1' }),
      ];
      const ext = new MetricsExtractor(entries);
      const b = ext.batchMetrics()[0];
      expect(b.completionVelocity).toBe(3); // 3 nodes / 1 hour
    });
  });

  describe('successRate', () => {
    it('returns 1 when no completions or errors', () => {
      const ext = new MetricsExtractor([makeEntry({ cmd: 'orient' })]);
      expect(ext.successRate()).toBe(1);
    });

    it('computes rate from completes vs errors', () => {
      const entries = [
        makeEntry({ cmd: 'complete' }),
        makeEntry({ cmd: 'complete' }),
        makeEntry({ cmd: 'complete' }),
        makeEntry({ type: 'error', cmd: undefined }),
      ];
      const ext = new MetricsExtractor(entries);
      expect(ext.successRate()).toBe(0.75);
    });
  });

  describe('summary', () => {
    it('produces full summary with all metric types', () => {
      const t0 = '2026-01-01T10:00:00Z';
      const entries = [
        makeEntry({ ts: t0, cmd: 'orient', position: ['a'], level: 0, repo: 'r1' }),
        makeEntry({ ts: t0, cmd: 'complete', nodeId: 'a', position: ['a'], level: 0, repo: 'r1' }),
      ];
      const ext = new MetricsExtractor(entries);
      const s = ext.summary();
      expect(s.trailEntries).toBe(2);
      expect(s.repos).toEqual(['r1']);
      expect(s.sessions.length).toBeGreaterThan(0);
      expect(s.nodes.length).toBeGreaterThan(0);
      expect(s.batches.length).toBeGreaterThan(0);
      expect(s.commandCounts.orient).toBe(1);
      expect(s.commandCounts.complete).toBe(1);
    });
  });

  describe('edge cases', () => {
    it('handles empty input', () => {
      const ext = new MetricsExtractor([]);
      const s = ext.summary();
      expect(s.trailEntries).toBe(0);
      expect(s.sessions).toEqual([]);
      expect(s.nodes).toEqual([]);
      expect(s.batches).toEqual([]);
    });

    it('filters entries without timestamps', () => {
      const entries = [
        { cmd: 'orient' } as TrailEntry, // no ts
        makeEntry({ cmd: 'orient' }),
      ];
      const ext = new MetricsExtractor(entries);
      expect(ext.commandCounts().orient).toBe(1);
    });
  });
});
