// @module mining
// @exports QueryEngine, agentLatencyTrend, batchHealth, driftPatterns, protocolViolations, nodeCompletion, agentFailures
// @types LatencyStats, BatchHealthMetrics, DriftEvent, ProtocolViolation, NodeMetrics, FailureRecord

import * as fs from 'fs';

export interface TranscriptEvent {
  timestamp: string;
  sessionId: string;
  agentId?: string;
  nodeId?: string;
  eventType: string;
  status: string;
  duration?: number;
  message?: string;
}

export interface LatencyStats {
  agentId: string;
  avgLatency: number;
  stddev: number;
  sessionCount: number;
  samples: number;
}

export interface BatchHealthMetrics {
  sessionId: string;
  batchLevel?: number;
  completionCount: number;
  totalBatches: number;
  resyncFrequency: number;
  avgAdvancementTime: number;
}

export interface DriftEvent {
  sessionId: string;
  timestamp: string;
  divergenceCount: number;
  resyncTrigger: string;
}

export interface ProtocolViolation {
  sessionId: string;
  timestamp: string;
  violationType: string;
  details: string;
  count: number;
}

export interface NodeMetrics {
  nodeId: string;
  successRate: number;
  latencyP50: number;
  latencyP95: number;
  latencyP99: number;
  totalSessions: number;
}

export interface FailureRecord {
  agentId: string;
  errorCount: number;
  retryPatterns: Array<{ error: string; count: number }>;
  abortReasons: Array<{ reason: string; count: number }>;
}

export class QueryEngine {
  private events: TranscriptEvent[];

  constructor(transcriptIndexPath: string) {
    this.events = this.loadTranscriptIndex(transcriptIndexPath);
  }

  private loadTranscriptIndex(path: string): TranscriptEvent[] {
    const events: TranscriptEvent[] = [];

    if (!fs.existsSync(path)) {
      return events;
    }

    try {
      const data = fs.readFileSync(path, 'utf-8');
      const lines = data.split('\n').filter(line => line.trim());

      for (const line of lines) {
        try {
          const event = JSON.parse(line) as TranscriptEvent;
          events.push(event);
        } catch (e) {
          // Skip malformed lines
        }
      }
    } catch (e) {
      // Return empty if file cannot be read
    }

    return events;
  }

  agentLatencyTrend(agentId: string, sessions?: string[]): LatencyStats {
    const sessionFilter = sessions ? new Set(sessions) : null;
    const agentEvents = this.events.filter(e => {
      if (e.agentId !== agentId) return false;
      if (sessionFilter && !sessionFilter.has(e.sessionId)) return false;
      return true;
    });

    // Calculate latencies between consecutive event pairs (start → ready)
    const latencies: number[] = [];
    const sessionMap = new Map<string, TranscriptEvent[]>();

    for (const event of agentEvents) {
      if (!sessionMap.has(event.sessionId)) {
        sessionMap.set(event.sessionId, []);
      }
      sessionMap.get(event.sessionId)!.push(event);
    }

    for (const sessionEvents of sessionMap.values()) {
      sessionEvents.sort((a, b) =>
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      );

      for (let i = 0; i < sessionEvents.length - 1; i++) {
        const current = sessionEvents[i];
        const next = sessionEvents[i + 1];
        const latency =
          new Date(next.timestamp).getTime() - new Date(current.timestamp).getTime();
        latencies.push(latency);
      }
    }

    const avgLatency =
      latencies.length > 0 ? latencies.reduce((a, b) => a + b) / latencies.length : 0;

    const variance =
      latencies.length > 0
        ? latencies.reduce((sum, l) => sum + Math.pow(l - avgLatency, 2), 0) /
          latencies.length
        : 0;
    const stddev = Math.sqrt(variance);

    return {
      agentId,
      avgLatency,
      stddev,
      sessionCount: sessionMap.size,
      samples: latencies.length,
    };
  }

  batchHealth(sessionId: string, batchLevel?: number): BatchHealthMetrics {
    const sessionEvents = this.events.filter(e => e.sessionId === sessionId);

    if (batchLevel !== undefined) {
      // Filter by batch level if provided
    }

    // Count completions vs total batches
    const completions = sessionEvents.filter(e => e.status === 'complete').length;
    const totalBatches = Math.max(1, sessionEvents.length);

    // Resync frequency: count re-sync events
    const resyncCount = sessionEvents.filter(e => e.eventType === 'advance').length;

    // Average advancement time (gap between advance events)
    const advanceEvents = sessionEvents
      .filter(e => e.eventType === 'advance')
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    let advancementTimes: number[] = [];
    for (let i = 0; i < advanceEvents.length - 1; i++) {
      const gap =
        new Date(advanceEvents[i + 1].timestamp).getTime() -
        new Date(advanceEvents[i].timestamp).getTime();
      advancementTimes.push(gap);
    }

    const avgAdvancementTime =
      advancementTimes.length > 0
        ? advancementTimes.reduce((a, b) => a + b) / advancementTimes.length
        : 0;

    return {
      sessionId,
      batchLevel,
      completionCount: completions,
      totalBatches,
      resyncFrequency: resyncCount,
      avgAdvancementTime,
    };
  }

  driftPatterns(sessionId: string): DriftEvent[] {
    const sessionEvents = this.events.filter(e => e.sessionId === sessionId);
    const driftEvents: DriftEvent[] = [];

    // Detect divergence by tracking changes in position/level
    const divergenceMap = new Map<string, number>();

    for (const event of sessionEvents) {
      if (event.eventType === 'orient' && event.nodeId) {
        const key = event.nodeId;
        divergenceMap.set(key, (divergenceMap.get(key) || 0) + 1);
      }
    }

    // Find re-sync triggers
    let lastNodeId = '';
    for (const event of sessionEvents) {
      if (event.eventType === 'advance' || event.eventType === 'recover') {
        const divergenceCount = divergenceMap.size;
        const resyncTrigger = event.eventType;

        if (lastNodeId !== event.nodeId) {
          driftEvents.push({
            sessionId,
            timestamp: event.timestamp,
            divergenceCount,
            resyncTrigger,
          });
          lastNodeId = event.nodeId || '';
        }
      }
    }

    return driftEvents;
  }

  protocolViolations(sessionId: string): ProtocolViolation[] {
    const sessionEvents = this.events.filter(e => e.sessionId === sessionId);
    const violations: ProtocolViolation[] = [];
    const violationMap = new Map<string, { count: number; first: string }>();

    for (const event of sessionEvents) {
      // Check for brief schema mismatches (incomplete required fields)
      if (event.eventType === 'orient' && !event.nodeId) {
        const key = 'brief-missing-nodeid';
        if (!violationMap.has(key)) {
          violationMap.set(key, { count: 0, first: event.timestamp });
        }
        violationMap.get(key)!.count++;
      }

      // Check for hook bypasses
      if (event.eventType.includes('SKIP_')) {
        const key = `hook-bypass-${event.eventType}`;
        if (!violationMap.has(key)) {
          violationMap.set(key, { count: 0, first: event.timestamp });
        }
        violationMap.get(key)!.count++;
      }

      // Check for missing agent context
      if (event.eventType === 'complete' && !event.agentId) {
        const key = 'missing-agent-context';
        if (!violationMap.has(key)) {
          violationMap.set(key, { count: 0, first: event.timestamp });
        }
        violationMap.get(key)!.count++;
      }
    }

    for (const [violationType, data] of violationMap) {
      violations.push({
        sessionId,
        timestamp: data.first,
        violationType,
        details: `Detected ${data.count} instances`,
        count: data.count,
      });
    }

    return violations;
  }

  nodeCompletion(nodeId: string): NodeMetrics {
    const nodeEvents = this.events.filter(e => e.nodeId === nodeId);

    if (nodeEvents.length === 0) {
      return {
        nodeId,
        successRate: 0,
        latencyP50: 0,
        latencyP95: 0,
        latencyP99: 0,
        totalSessions: 0,
      };
    }

    // Success rate
    const completions = nodeEvents.filter(e => e.status === 'complete').length;
    const successRate = completions / nodeEvents.length;

    // Collect latencies
    const latencies: number[] = [];
    const sessionMap = new Map<string, TranscriptEvent[]>();

    for (const event of nodeEvents) {
      if (!sessionMap.has(event.sessionId)) {
        sessionMap.set(event.sessionId, []);
      }
      sessionMap.get(event.sessionId)!.push(event);
    }

    for (const sessionEvents of sessionMap.values()) {
      sessionEvents.sort((a, b) =>
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      );

      if (sessionEvents.length >= 2) {
        const latency =
          new Date(sessionEvents[sessionEvents.length - 1].timestamp).getTime() -
          new Date(sessionEvents[0].timestamp).getTime();
        latencies.push(latency);
      }
    }

    latencies.sort((a, b) => a - b);

    const p50 = latencies[Math.floor(latencies.length * 0.5)] || 0;
    const p95 = latencies[Math.floor(latencies.length * 0.95)] || 0;
    const p99 = latencies[Math.floor(latencies.length * 0.99)] || 0;

    return {
      nodeId,
      successRate,
      latencyP50: p50,
      latencyP95: p95,
      latencyP99: p99,
      totalSessions: sessionMap.size,
    };
  }

  agentFailures(agentId: string): FailureRecord {
    const agentEvents = this.events.filter(e => e.agentId === agentId);

    const errorMap = new Map<string, number>();
    const abortReasonMap = new Map<string, number>();
    let totalErrors = 0;

    for (const event of agentEvents) {
      // Count errors based on status
      if (event.status === 'error' || event.status === 'failed') {
        totalErrors++;
        const errorMsg = event.message || 'unknown-error';
        errorMap.set(errorMsg, (errorMap.get(errorMsg) || 0) + 1);
      }

      // Track abort reasons
      if (event.eventType === 'abort' && event.message) {
        abortReasonMap.set(event.message, (abortReasonMap.get(event.message) || 0) + 1);
      }

      // Check for retry patterns in messages
      if (event.message && event.message.includes('retry')) {
        const retryMsg = event.message;
        errorMap.set(`retry-${retryMsg}`, (errorMap.get(`retry-${retryMsg}`) || 0) + 1);
      }
    }

    const retryPatterns = Array.from(errorMap.entries())
      .filter(([key]) => key.startsWith('retry-'))
      .map(([key, count]) => ({
        error: key.replace(/^retry-/, ''),
        count,
      }));

    const abortReasons = Array.from(abortReasonMap.entries()).map(([reason, count]) => ({
      reason,
      count,
    }));

    return {
      agentId,
      errorCount: totalErrors,
      retryPatterns,
      abortReasons,
    };
  }
}

export function createQueryEngine(transcriptIndexPath: string): QueryEngine {
  return new QueryEngine(transcriptIndexPath);
}
