import { describe, it, expect } from 'vitest';
import { AnomalyDetector, type Anomaly, type AnomalyReport } from '../src/lib/mining/anomaly-detector';

describe('AnomalyDetector', () => {
  const detector = new AnomalyDetector();

  describe('empty input', () => {
    it('returns empty report for empty entries', () => {
      const report = detector.detect([]);
      expect(report.anomalies).toHaveLength(0);
      expect(report.metadata.samplesProcessed).toBe(0);
    });
  });

  describe('latency spike detection', () => {
    it('detects single latency spike above 3σ', () => {
      const entries = [
        ...Array.from({ length: 20 }, (_, i) => ({
          timestamp: new Date(Date.now() + i * 1000).toISOString(),
          sessionId: 'test-session',
          eventType: 'complete',
          status: 'success',
          message: 'node completed',
          latencyMs: 100,
        })),
        {
          timestamp: new Date(Date.now() + 21000).toISOString(),
          sessionId: 'test-session',
          nodeId: 'heavy-node',
          eventType: 'complete',
          status: 'success',
          message: 'node completed',
          latencyMs: 500, // spike
        },
      ];

      const report = detector.detect(entries);
      const spikes = report.anomalies.filter((a) => a.category === 'latency-spike');
      expect(spikes.length).toBeGreaterThan(0);
      expect(spikes[0].severity).toBe('high');
    });

    it('ignores normal latency variance', () => {
      const entries = Array.from({ length: 30 }, (_, i) => ({
        timestamp: new Date(Date.now() + i * 1000).toISOString(),
        sessionId: 'test-session',
        eventType: 'complete',
        status: 'success',
        message: 'node completed',
        latencyMs: 100 + Math.random() * 20, // normal variance
      }));

      const report = detector.detect(entries);
      const spikes = report.anomalies.filter((a) => a.category === 'latency-spike');
      expect(spikes.length).toBe(0);
    });

    it('records context in latency spike anomalies', () => {
      const entries = [
        ...Array.from({ length: 15 }, (_, i) => ({
          timestamp: new Date(Date.now() + i * 1000).toISOString(),
          sessionId: 'test-session',
          eventType: 'complete',
          status: 'success',
          message: 'node completed',
          latencyMs: 100,
        })),
        {
          timestamp: new Date(Date.now() + 16000).toISOString(),
          sessionId: 'test-session',
          nodeId: 'spike-node',
          eventType: 'complete',
          status: 'success',
          message: 'node completed',
          latencyMs: 600,
        },
      ];

      const report = detector.detect(entries);
      const spike = report.anomalies.find((a) => a.category === 'latency-spike');
      expect(spike).toBeDefined();
      expect(spike?.context.nodeId).toBe('spike-node');
      expect(spike?.context.latencyMs).toBe(600);
      expect(spike?.context.sigmasAboveMean).toBeGreaterThan(3);
    });
  });

  describe('protocol violation detection', () => {
    it('detects brief schema mismatch', () => {
      const entries = [
        {
          timestamp: '2026-03-02T10:00:00Z',
          sessionId: 'test-session',
          nodeId: 'auth-node',
          eventType: 'orient',
          status: 'error',
          message: 'brief validation failed: schema mismatch',
        },
      ];

      const report = detector.detect(entries);
      const violations = report.anomalies.filter((a) => a.category === 'protocol-violation');
      expect(violations.length).toBeGreaterThan(0);
      expect(violations[0].severity).toBe('critical');
      expect(violations[0].context.violationType).toBe('brief-schema-mismatch');
    });

    it('detects hook bypass attempts', () => {
      const entries = [
        {
          timestamp: '2026-03-02T10:00:00Z',
          sessionId: 'test-session',
          nodeId: 'dangerous-node',
          eventType: 'execute',
          status: 'error',
          message: 'hook bypass attempted on validation',
        },
      ];

      const report = detector.detect(entries);
      const violations = report.anomalies.filter((a) => a.category === 'protocol-violation');
      expect(violations.length).toBeGreaterThan(0);
      expect(violations[0].context.violationType).toBe('hook-bypass-attempted');
    });

    it('detects validation skip events', () => {
      const entries = [
        {
          timestamp: '2026-03-02T10:00:00Z',
          sessionId: 'test-session',
          eventType: 'SKIP_TEST_CHECK',
          status: 'recorded',
          message: 'test check skipped',
        },
      ];

      const report = detector.detect(entries);
      const violations = report.anomalies.filter((a) => a.category === 'protocol-violation');
      expect(violations.length).toBeGreaterThan(0);
      expect(violations[0].severity).toBe('critical');
      expect(violations[0].context.violationType).toBe('validation-skip');
    });

    it('marks all protocol violations as critical', () => {
      const entries = [
        {
          timestamp: '2026-03-02T10:00:00Z',
          sessionId: 'test-session',
          eventType: 'SKIP_NODE_CHECK',
          status: 'recorded',
          message: 'validation skipped',
        },
      ];

      const report = detector.detect(entries);
      const violations = report.anomalies.filter((a) => a.category === 'protocol-violation');
      for (const v of violations) {
        expect(v.severity).toBe('critical');
      }
    });
  });

  describe('stalled work detection', () => {
    it('detects node in-progress for > 5 minutes', () => {
      const baseTime = Date.now();
      const entries = [
        {
          timestamp: new Date(baseTime).toISOString(),
          sessionId: 'test-session',
          nodeId: 'long-task',
          eventType: 'orient',
          status: 'in-progress',
          message: 'long-task — starting work',
        },
        {
          timestamp: new Date(baseTime + 6 * 60 * 1000).toISOString(), // 6 minutes later
          sessionId: 'test-session',
          nodeId: 'long-task',
          eventType: 'orient',
          status: 'in-progress',
          message: 'long-task — still running',
        },
      ];

      const report = detector.detect(entries);
      const stalled = report.anomalies.filter((a) => a.category === 'stalled-work');
      expect(stalled.length).toBeGreaterThan(0);
      expect(stalled[0].severity).toBe('high');
      expect(stalled[0].context.nodeId).toBe('long-task');
    });

    it('ignores completed nodes regardless of duration', () => {
      const baseTime = Date.now();
      const entries = [
        {
          timestamp: new Date(baseTime).toISOString(),
          sessionId: 'test-session',
          nodeId: 'quick-task',
          eventType: 'orient',
          status: 'in-progress',
          message: 'quick-task — starting',
        },
        {
          timestamp: new Date(baseTime + 10 * 60 * 1000).toISOString(),
          sessionId: 'test-session',
          nodeId: 'quick-task',
          eventType: 'complete',
          status: 'completed',
          message: 'quick-task — done',
        },
      ];

      const report = detector.detect(entries);
      const stalled = report.anomalies.filter((a) => a.category === 'stalled-work');
      expect(stalled).toHaveLength(0);
    });

    it('does not flag nodes in-progress < 5 minutes', () => {
      const baseTime = Date.now();
      const entries = [
        {
          timestamp: new Date(baseTime).toISOString(),
          sessionId: 'test-session',
          nodeId: 'fast-task',
          eventType: 'orient',
          status: 'in-progress',
          message: 'fast-task — starting',
        },
        {
          timestamp: new Date(baseTime + 3 * 60 * 1000).toISOString(), // 3 minutes
          sessionId: 'test-session',
          nodeId: 'fast-task',
          eventType: 'orient',
          status: 'in-progress',
          message: 'fast-task — still running',
        },
      ];

      const report = detector.detect(entries);
      const stalled = report.anomalies.filter((a) => a.category === 'stalled-work');
      expect(stalled).toHaveLength(0);
    });
  });

  describe('batch instability detection', () => {
    it('detects batch with > 2 re-syncs', () => {
      const entries = [
        {
          timestamp: '2026-03-02T10:00:00Z',
          sessionId: 'test-session',
          eventType: 'resync',
          status: 'success',
          message: 'head.json re-synced',
        },
        {
          timestamp: '2026-03-02T10:00:10Z',
          sessionId: 'test-session',
          eventType: 'resync',
          status: 'success',
          message: 'head.json re-synced',
        },
        {
          timestamp: '2026-03-02T10:00:20Z',
          sessionId: 'test-session',
          eventType: 'resync',
          status: 'success',
          message: 'head.json re-synced',
        },
        {
          timestamp: '2026-03-02T10:00:30Z',
          sessionId: 'test-session',
          eventType: 'orient',
          status: 'batch-advanced',
          message: 'batch advanced',
        },
      ];

      const report = detector.detect(entries);
      const instability = report.anomalies.filter((a) => a.category === 'batch-instability');
      expect(instability.length).toBeGreaterThan(0);
      expect(instability[0].severity).toBe('medium');
    });

    it('allows 2 re-syncs per batch', () => {
      const entries = [
        {
          timestamp: '2026-03-02T10:00:00Z',
          sessionId: 'test-session',
          eventType: 'resync',
          status: 'success',
          message: 'head.json re-synced',
        },
        {
          timestamp: '2026-03-02T10:00:10Z',
          sessionId: 'test-session',
          eventType: 'resync',
          status: 'success',
          message: 'head.json re-synced',
        },
        {
          timestamp: '2026-03-02T10:00:20Z',
          sessionId: 'test-session',
          eventType: 'orient',
          status: 'batch-advanced',
          message: 'batch advanced',
        },
      ];

      const report = detector.detect(entries);
      const instability = report.anomalies.filter((a) => a.category === 'batch-instability');
      expect(instability).toHaveLength(0);
    });
  });

  describe('drift spike detection', () => {
    it('detects drift > 5 per batch advancement', () => {
      const entries = [
        ...Array.from({ length: 6 }, (_, i) => ({
          timestamp: new Date(Date.now() + i * 1000).toISOString(),
          sessionId: 'test-session',
          eventType: 'resync',
          status: 'resynced',
          message: 'head.json resynced for consistency',
        })),
        {
          timestamp: new Date(Date.now() + 7000).toISOString(),
          sessionId: 'test-session',
          eventType: 'orient',
          status: 'batch-advanced',
          message: 'batch advanced',
        },
      ];

      const report = detector.detect(entries);
      const driftSpikes = report.anomalies.filter((a) => a.category === 'drift-spike');
      expect(driftSpikes.length).toBeGreaterThan(0);
      expect(driftSpikes[0].severity).toBe('high');
    });

    it('allows up to 5 drifts per batch', () => {
      const entries = [
        ...Array.from({ length: 5 }, (_, i) => ({
          timestamp: new Date(Date.now() + i * 1000).toISOString(),
          sessionId: 'test-session',
          eventType: 'resync',
          status: 'resynced',
          message: 'head.json resynced for consistency',
        })),
        {
          timestamp: new Date(Date.now() + 6000).toISOString(),
          sessionId: 'test-session',
          eventType: 'orient',
          status: 'batch-advanced',
          message: 'batch advanced',
        },
      ];

      const report = detector.detect(entries);
      const driftSpikes = report.anomalies.filter((a) => a.category === 'drift-spike');
      expect(driftSpikes).toHaveLength(0);
    });
  });

  describe('performance regression detection', () => {
    it('detects node latency 20%+ above baseline', () => {
      const entries = [
        ...Array.from({ length: 15 }, (_, i) => ({
          timestamp: new Date(Date.now() + i * 1000).toISOString(),
          sessionId: 'test-session',
          eventType: 'complete',
          status: 'success',
          message: 'baseline node',
          latencyMs: 100,
        })),
        ...Array.from({ length: 5 }, (_, i) => ({
          timestamp: new Date(Date.now() + (15 + i) * 1000).toISOString(),
          sessionId: 'test-session',
          nodeId: 'regressed-node',
          eventType: 'complete',
          status: 'success',
          message: 'slow node',
          latencyMs: 130, // 30% above baseline
        })),
      ];

      const report = detector.detect(entries);
      const regressions = report.anomalies.filter((a) => a.category === 'performance-regression');
      expect(regressions.length).toBeGreaterThan(0);
      expect(regressions[0].severity).toBe('medium');
      expect(regressions[0].context.nodeId).toBe('regressed-node');
    });

    it('ignores minor latency increases < 20%', () => {
      const entries = [
        ...Array.from({ length: 15 }, (_, i) => ({
          timestamp: new Date(Date.now() + i * 1000).toISOString(),
          sessionId: 'test-session',
          eventType: 'complete',
          status: 'success',
          message: 'baseline node',
          latencyMs: 100,
        })),
        ...Array.from({ length: 5 }, (_, i) => ({
          timestamp: new Date(Date.now() + (15 + i) * 1000).toISOString(),
          sessionId: 'test-session',
          nodeId: 'normal-node',
          eventType: 'complete',
          status: 'success',
          message: 'normal node',
          latencyMs: 110, // 10% above baseline
        })),
      ];

      const report = detector.detect(entries);
      const regressions = report.anomalies.filter((a) => a.category === 'performance-regression');
      expect(regressions).toHaveLength(0);
    });
  });

  describe('report metadata', () => {
    it('includes computed global statistics', () => {
      const entries = Array.from({ length: 20 }, (_, i) => ({
        timestamp: new Date(Date.now() + i * 1000).toISOString(),
        sessionId: 'test-session',
        eventType: 'complete',
        status: 'success',
        message: 'node completed',
        latencyMs: 100,
      }));

      const report = detector.detect(entries);
      expect(report.metadata.samplesProcessed).toBe(20);
      expect(report.metadata.metricsComputed.meanLatency).toBeDefined();
      expect(report.metadata.metricsComputed.stddevLatency).toBeDefined();
      expect(report.metadata.metricsComputed.stallThresholdMs).toBe(5 * 60 * 1000);
    });

    it('includes session ID in report', () => {
      const entries = [
        {
          timestamp: '2026-03-02T10:00:00Z',
          sessionId: 'my-session',
          eventType: 'orient',
          status: 'success',
          message: 'oriented',
        },
      ];

      const report = detector.detect(entries);
      expect(report.sessionId).toBe('my-session');
    });
  });

  describe('false positive rates', () => {
    it('produces no anomalies for clean, normal transcript', () => {
      const entries = Array.from({ length: 100 }, (_, i) => ({
        timestamp: new Date(Date.now() + i * 1000).toISOString(),
        sessionId: 'normal-session',
        nodeId: `node-${Math.floor(i / 10)}`,
        eventType: 'complete',
        status: 'success',
        message: 'node completed normally',
        latencyMs: 100 + Math.random() * 10,
      }));

      const report = detector.detect(entries);
      expect(report.anomalies).toHaveLength(0);
    });

    it('distinguishes between anomalies across multiple sessions', () => {
      const entries = [
        ...Array.from({ length: 10 }, (_, i) => ({
          timestamp: new Date(Date.now() + i * 1000).toISOString(),
          sessionId: 'session-1',
          eventType: 'complete',
          status: 'success',
          message: 'normal',
          latencyMs: 100,
        })),
        ...Array.from({ length: 10 }, (_, i) => ({
          timestamp: new Date(Date.now() + (10 + i) * 1000).toISOString(),
          sessionId: 'session-2',
          eventType: 'complete',
          status: 'success',
          message: 'spike',
          latencyMs: 100 + (i === 5 ? 400 : 0),
        })),
      ];

      const report = detector.detect(entries);
      expect(report.anomalies.length).toBeGreaterThan(0);
      const session2Anomalies = report.anomalies.filter((a) => a.sessionId === 'session-2');
      expect(session2Anomalies.length).toBeGreaterThan(0);
    });
  });
});
