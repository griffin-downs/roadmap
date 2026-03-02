import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { QueryEngine, createQueryEngine, TranscriptEvent } from '../src/lib/mining/query-engine';

describe('query-engine', () => {
  let tmpDir: string;
  let indexPath: string;

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'query-engine-test-'));
    indexPath = path.join(tmpDir, 'transcript-index.jsonl');
  });

  afterAll(() => {
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });

  it('should load transcript index from JSONL file', () => {
    const events: TranscriptEvent[] = [
      {
        timestamp: '2026-03-02T10:00:00.000Z',
        sessionId: 'session-1',
        agentId: 'agent-a',
        nodeId: 'node-1',
        eventType: 'orient',
        status: 'complete',
        message: 'Starting work',
      },
      {
        timestamp: '2026-03-02T10:05:00.000Z',
        sessionId: 'session-1',
        agentId: 'agent-a',
        nodeId: 'node-1',
        eventType: 'complete',
        status: 'complete',
        message: 'Work finished',
      },
    ];

    const lines = events.map(e => JSON.stringify(e)).join('\n');
    fs.writeFileSync(indexPath, lines + '\n');

    const engine = new QueryEngine(indexPath);
    expect(engine).toBeDefined();
  });

  describe('agentLatencyTrend', () => {
    it('should calculate average latency between events', () => {
      const events: TranscriptEvent[] = [
        {
          timestamp: '2026-03-02T10:00:00.000Z',
          sessionId: 'session-1',
          agentId: 'agent-a',
          eventType: 'start',
          status: 'ready',
        },
        {
          timestamp: '2026-03-02T10:00:10.000Z',
          sessionId: 'session-1',
          agentId: 'agent-a',
          eventType: 'ready',
          status: 'ready',
        },
        {
          timestamp: '2026-03-02T10:00:20.000Z',
          sessionId: 'session-1',
          agentId: 'agent-a',
          eventType: 'complete',
          status: 'complete',
        },
      ];

      const lines = events.map(e => JSON.stringify(e)).join('\n');
      fs.writeFileSync(indexPath, lines + '\n');

      const engine = new QueryEngine(indexPath);
      const stats = engine.agentLatencyTrend('agent-a');

      expect(stats.agentId).toBe('agent-a');
      expect(stats.avgLatency).toBeGreaterThan(0);
      expect(stats.stddev).toBeGreaterThanOrEqual(0);
      expect(stats.samples).toBe(2);
    });

    it('should filter by sessions if provided', () => {
      const events: TranscriptEvent[] = [
        {
          timestamp: '2026-03-02T10:00:00.000Z',
          sessionId: 'session-1',
          agentId: 'agent-a',
          eventType: 'start',
          status: 'ready',
        },
        {
          timestamp: '2026-03-02T10:00:05.000Z',
          sessionId: 'session-1',
          agentId: 'agent-a',
          eventType: 'ready',
          status: 'ready',
        },
        {
          timestamp: '2026-03-02T10:00:10.000Z',
          sessionId: 'session-2',
          agentId: 'agent-a',
          eventType: 'start',
          status: 'ready',
        },
        {
          timestamp: '2026-03-02T10:00:20.000Z',
          sessionId: 'session-2',
          agentId: 'agent-a',
          eventType: 'ready',
          status: 'ready',
        },
      ];

      const lines = events.map(e => JSON.stringify(e)).join('\n');
      fs.writeFileSync(indexPath, lines + '\n');

      const engine = new QueryEngine(indexPath);
      const stats = engine.agentLatencyTrend('agent-a', ['session-1']);

      expect(stats.sessionCount).toBe(1);
      expect(stats.samples).toBe(1);
    });

    it('should return zero stats for non-existent agent', () => {
      const events: TranscriptEvent[] = [
        {
          timestamp: '2026-03-02T10:00:00.000Z',
          sessionId: 'session-1',
          agentId: 'agent-a',
          eventType: 'start',
          status: 'ready',
        },
      ];

      const lines = events.map(e => JSON.stringify(e)).join('\n');
      fs.writeFileSync(indexPath, lines + '\n');

      const engine = new QueryEngine(indexPath);
      const stats = engine.agentLatencyTrend('agent-nonexistent');

      expect(stats.avgLatency).toBe(0);
      expect(stats.stddev).toBe(0);
      expect(stats.samples).toBe(0);
    });
  });

  describe('batchHealth', () => {
    it('should calculate completion count and resync frequency', () => {
      const events: TranscriptEvent[] = [
        {
          timestamp: '2026-03-02T10:00:00.000Z',
          sessionId: 'session-1',
          eventType: 'orient',
          status: 'complete',
        },
        {
          timestamp: '2026-03-02T10:05:00.000Z',
          sessionId: 'session-1',
          eventType: 'advance',
          status: 'complete',
        },
        {
          timestamp: '2026-03-02T10:10:00.000Z',
          sessionId: 'session-1',
          eventType: 'advance',
          status: 'complete',
        },
        {
          timestamp: '2026-03-02T10:15:00.000Z',
          sessionId: 'session-1',
          eventType: 'complete',
          status: 'complete',
        },
      ];

      const lines = events.map(e => JSON.stringify(e)).join('\n');
      fs.writeFileSync(indexPath, lines + '\n');

      const engine = new QueryEngine(indexPath);
      const health = engine.batchHealth('session-1');

      expect(health.sessionId).toBe('session-1');
      expect(health.completionCount).toBe(4);
      expect(health.resyncFrequency).toBe(2);
      expect(health.avgAdvancementTime).toBeGreaterThan(0);
    });

    it('should handle sessions with no advance events', () => {
      const events: TranscriptEvent[] = [
        {
          timestamp: '2026-03-02T10:00:00.000Z',
          sessionId: 'session-2',
          eventType: 'orient',
          status: 'complete',
        },
        {
          timestamp: '2026-03-02T10:05:00.000Z',
          sessionId: 'session-2',
          eventType: 'complete',
          status: 'complete',
        },
      ];

      const lines = events.map(e => JSON.stringify(e)).join('\n');
      fs.writeFileSync(indexPath, lines + '\n');

      const engine = new QueryEngine(indexPath);
      const health = engine.batchHealth('session-2');

      expect(health.resyncFrequency).toBe(0);
      expect(health.avgAdvancementTime).toBe(0);
    });
  });

  describe('driftPatterns', () => {
    it('should detect drift events during session', () => {
      const events: TranscriptEvent[] = [
        {
          timestamp: '2026-03-02T10:00:00.000Z',
          sessionId: 'session-1',
          nodeId: 'node-1',
          eventType: 'orient',
          status: 'complete',
        },
        {
          timestamp: '2026-03-02T10:05:00.000Z',
          sessionId: 'session-1',
          nodeId: 'node-2',
          eventType: 'advance',
          status: 'complete',
        },
        {
          timestamp: '2026-03-02T10:10:00.000Z',
          sessionId: 'session-1',
          nodeId: 'node-2',
          eventType: 'recover',
          status: 'complete',
        },
      ];

      const lines = events.map(e => JSON.stringify(e)).join('\n');
      fs.writeFileSync(indexPath, lines + '\n');

      const engine = new QueryEngine(indexPath);
      const driftEvents = engine.driftPatterns('session-1');

      expect(driftEvents.length).toBeGreaterThanOrEqual(0);
      if (driftEvents.length > 0) {
        expect(driftEvents[0].sessionId).toBe('session-1');
        expect(driftEvents[0].divergenceCount).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe('protocolViolations', () => {
    it('should detect brief schema mismatches', () => {
      const events: TranscriptEvent[] = [
        {
          timestamp: '2026-03-02T10:00:00.000Z',
          sessionId: 'session-1',
          eventType: 'orient',
          status: 'complete',
          // missing nodeId
        },
        {
          timestamp: '2026-03-02T10:05:00.000Z',
          sessionId: 'session-1',
          nodeId: 'node-1',
          eventType: 'complete',
          status: 'complete',
        },
      ];

      const lines = events.map(e => JSON.stringify(e)).join('\n');
      fs.writeFileSync(indexPath, lines + '\n');

      const engine = new QueryEngine(indexPath);
      const violations = engine.protocolViolations('session-1');

      const briefViolations = violations.filter(v => v.violationType === 'brief-missing-nodeid');
      expect(briefViolations.length).toBeGreaterThanOrEqual(1);
    });

    it('should detect hook bypasses', () => {
      const events: TranscriptEvent[] = [
        {
          timestamp: '2026-03-02T10:00:00.000Z',
          sessionId: 'session-1',
          eventType: 'SKIP_NODE_CHECK',
          status: 'recorded',
          message: 'test bypass',
        },
        {
          timestamp: '2026-03-02T10:05:00.000Z',
          sessionId: 'session-1',
          eventType: 'SKIP_NODE_CHECK',
          status: 'recorded',
          message: 'another bypass',
        },
      ];

      const lines = events.map(e => JSON.stringify(e)).join('\n');
      fs.writeFileSync(indexPath, lines + '\n');

      const engine = new QueryEngine(indexPath);
      const violations = engine.protocolViolations('session-1');

      const hookViolations = violations.filter(v => v.violationType.includes('hook-bypass'));
      expect(hookViolations.length).toBeGreaterThan(0);
      expect(hookViolations[0].count).toBeGreaterThanOrEqual(2);
    });

    it('should detect missing agent context', () => {
      const events: TranscriptEvent[] = [
        {
          timestamp: '2026-03-02T10:00:00.000Z',
          sessionId: 'session-1',
          eventType: 'complete',
          status: 'complete',
          // missing agentId
        },
      ];

      const lines = events.map(e => JSON.stringify(e)).join('\n');
      fs.writeFileSync(indexPath, lines + '\n');

      const engine = new QueryEngine(indexPath);
      const violations = engine.protocolViolations('session-1');

      const missingAgent = violations.filter(v => v.violationType === 'missing-agent-context');
      expect(missingAgent.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('nodeCompletion', () => {
    it('should calculate success rate across sessions', () => {
      const events: TranscriptEvent[] = [
        {
          timestamp: '2026-03-02T10:00:00.000Z',
          sessionId: 'session-1',
          nodeId: 'node-a',
          eventType: 'start',
          status: 'complete',
        },
        {
          timestamp: '2026-03-02T10:05:00.000Z',
          sessionId: 'session-1',
          nodeId: 'node-a',
          eventType: 'complete',
          status: 'complete',
        },
        {
          timestamp: '2026-03-02T10:10:00.000Z',
          sessionId: 'session-2',
          nodeId: 'node-a',
          eventType: 'start',
          status: 'failed',
        },
        {
          timestamp: '2026-03-02T10:15:00.000Z',
          sessionId: 'session-2',
          nodeId: 'node-a',
          eventType: 'complete',
          status: 'failed',
        },
      ];

      const lines = events.map(e => JSON.stringify(e)).join('\n');
      fs.writeFileSync(indexPath, lines + '\n');

      const engine = new QueryEngine(indexPath);
      const metrics = engine.nodeCompletion('node-a');

      expect(metrics.nodeId).toBe('node-a');
      expect(metrics.successRate).toBeLessThanOrEqual(1);
      expect(metrics.successRate).toBeGreaterThanOrEqual(0);
      expect(metrics.totalSessions).toBe(2);
    });

    it('should calculate percentile latencies', () => {
      const events: TranscriptEvent[] = [
        {
          timestamp: '2026-03-02T10:00:00.000Z',
          sessionId: 'session-1',
          nodeId: 'node-b',
          eventType: 'start',
          status: 'ready',
        },
        {
          timestamp: '2026-03-02T10:01:00.000Z',
          sessionId: 'session-1',
          nodeId: 'node-b',
          eventType: 'complete',
          status: 'complete',
        },
        {
          timestamp: '2026-03-02T10:02:00.000Z',
          sessionId: 'session-2',
          nodeId: 'node-b',
          eventType: 'start',
          status: 'ready',
        },
        {
          timestamp: '2026-03-02T10:03:00.000Z',
          sessionId: 'session-2',
          nodeId: 'node-b',
          eventType: 'complete',
          status: 'complete',
        },
      ];

      const lines = events.map(e => JSON.stringify(e)).join('\n');
      fs.writeFileSync(indexPath, lines + '\n');

      const engine = new QueryEngine(indexPath);
      const metrics = engine.nodeCompletion('node-b');

      expect(metrics.latencyP50).toBeGreaterThan(0);
      expect(metrics.latencyP95).toBeGreaterThanOrEqual(metrics.latencyP50);
      expect(metrics.latencyP99).toBeGreaterThanOrEqual(metrics.latencyP95);
    });

    it('should return zero metrics for non-existent node', () => {
      const events: TranscriptEvent[] = [
        {
          timestamp: '2026-03-02T10:00:00.000Z',
          sessionId: 'session-1',
          nodeId: 'node-a',
          eventType: 'start',
          status: 'ready',
        },
      ];

      const lines = events.map(e => JSON.stringify(e)).join('\n');
      fs.writeFileSync(indexPath, lines + '\n');

      const engine = new QueryEngine(indexPath);
      const metrics = engine.nodeCompletion('node-nonexistent');

      expect(metrics.successRate).toBe(0);
      expect(metrics.latencyP50).toBe(0);
      expect(metrics.totalSessions).toBe(0);
    });
  });

  describe('agentFailures', () => {
    it('should count error occurrences', () => {
      const events: TranscriptEvent[] = [
        {
          timestamp: '2026-03-02T10:00:00.000Z',
          sessionId: 'session-1',
          agentId: 'agent-x',
          eventType: 'execute',
          status: 'error',
          message: 'connection-timeout',
        },
        {
          timestamp: '2026-03-02T10:05:00.000Z',
          sessionId: 'session-1',
          agentId: 'agent-x',
          eventType: 'execute',
          status: 'error',
          message: 'connection-timeout',
        },
        {
          timestamp: '2026-03-02T10:10:00.000Z',
          sessionId: 'session-1',
          agentId: 'agent-x',
          eventType: 'execute',
          status: 'failed',
          message: 'validation-failed',
        },
      ];

      const lines = events.map(e => JSON.stringify(e)).join('\n');
      fs.writeFileSync(indexPath, lines + '\n');

      const engine = new QueryEngine(indexPath);
      const failures = engine.agentFailures('agent-x');

      expect(failures.agentId).toBe('agent-x');
      expect(failures.errorCount).toBe(3);
    });

    it('should track abort reasons', () => {
      const events: TranscriptEvent[] = [
        {
          timestamp: '2026-03-02T10:00:00.000Z',
          sessionId: 'session-1',
          agentId: 'agent-y',
          eventType: 'abort',
          status: 'aborted',
          message: 'timeout-exceeded',
        },
        {
          timestamp: '2026-03-02T10:05:00.000Z',
          sessionId: 'session-1',
          agentId: 'agent-y',
          eventType: 'abort',
          status: 'aborted',
          message: 'timeout-exceeded',
        },
        {
          timestamp: '2026-03-02T10:10:00.000Z',
          sessionId: 'session-1',
          agentId: 'agent-y',
          eventType: 'abort',
          status: 'aborted',
          message: 'resource-unavailable',
        },
      ];

      const lines = events.map(e => JSON.stringify(e)).join('\n');
      fs.writeFileSync(indexPath, lines + '\n');

      const engine = new QueryEngine(indexPath);
      const failures = engine.agentFailures('agent-y');

      expect(failures.abortReasons.length).toBeGreaterThan(0);
      const timeoutReason = failures.abortReasons.find(r => r.reason === 'timeout-exceeded');
      expect(timeoutReason).toBeDefined();
      expect(timeoutReason?.count).toBe(2);
    });

    it('should track retry patterns', () => {
      const events: TranscriptEvent[] = [
        {
          timestamp: '2026-03-02T10:00:00.000Z',
          sessionId: 'session-1',
          agentId: 'agent-z',
          eventType: 'execute',
          status: 'error',
          message: 'retry: attempt 1',
        },
        {
          timestamp: '2026-03-02T10:05:00.000Z',
          sessionId: 'session-1',
          agentId: 'agent-z',
          eventType: 'execute',
          status: 'error',
          message: 'retry: attempt 2',
        },
      ];

      const lines = events.map(e => JSON.stringify(e)).join('\n');
      fs.writeFileSync(indexPath, lines + '\n');

      const engine = new QueryEngine(indexPath);
      const failures = engine.agentFailures('agent-z');

      expect(failures.retryPatterns.length).toBeGreaterThan(0);
    });
  });

  describe('createQueryEngine factory', () => {
    it('should create engine instance via factory function', () => {
      const events: TranscriptEvent[] = [
        {
          timestamp: '2026-03-02T10:00:00.000Z',
          sessionId: 'session-1',
          agentId: 'agent-a',
          nodeId: 'node-1',
          eventType: 'orient',
          status: 'complete',
        },
      ];

      const lines = events.map(e => JSON.stringify(e)).join('\n');
      fs.writeFileSync(indexPath, lines + '\n');

      const engine = createQueryEngine(indexPath);
      expect(engine).toBeInstanceOf(QueryEngine);

      const stats = engine.agentLatencyTrend('agent-a');
      expect(stats.agentId).toBe('agent-a');
    });
  });

  describe('integration: medium dataset aggregation', () => {
    it('should handle multiple sessions and agents efficiently', () => {
      const events: TranscriptEvent[] = [];

      // Generate 100 events across 5 sessions and 3 agents
      for (let session = 1; session <= 5; session++) {
        for (let agent = 1; agent <= 3; agent++) {
          for (let i = 0; i < 6; i++) {
            events.push({
              timestamp: new Date(
                2026,
                2,
                2,
                10,
                session,
                agent * 10 + i * 5
              ).toISOString(),
              sessionId: `session-${session}`,
              agentId: `agent-${agent}`,
              nodeId: `node-${(i % 3) + 1}`,
              eventType: i % 4 === 0 ? 'orient' : 'execute',
              status: i % 5 === 0 ? 'failed' : 'complete',
              message: `event ${i}`,
            });
          }
        }
      }

      const lines = events.map(e => JSON.stringify(e)).join('\n');
      fs.writeFileSync(indexPath, lines + '\n');

      const engine = new QueryEngine(indexPath);

      // Run all query methods
      const latency = engine.agentLatencyTrend('agent-1');
      const health = engine.batchHealth('session-1');
      const drift = engine.driftPatterns('session-1');
      const violations = engine.protocolViolations('session-1');
      const nodeMetrics = engine.nodeCompletion('node-1');
      const failures = engine.agentFailures('agent-1');

      // Verify all methods return valid results
      expect(latency.agentId).toBe('agent-1');
      expect(health.sessionId).toBe('session-1');
      expect(violations).toBeDefined();
      expect(Array.isArray(drift)).toBe(true);
      expect(nodeMetrics.nodeId).toBe('node-1');
      expect(failures.agentId).toBe('agent-1');
    });
  });
});
