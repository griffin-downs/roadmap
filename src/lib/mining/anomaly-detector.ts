// @module mining
// @exports AnomalyDetector
// @types Anomaly, AnomalyReport, AnomalySeverity, AnomalyCategory

export type AnomalySeverity = 'critical' | 'high' | 'medium' | 'low';
export type AnomalyCategory =
  | 'latency-spike'
  | 'drift-spike'
  | 'protocol-violation'
  | 'stalled-work'
  | 'batch-instability'
  | 'performance-regression';

export interface Anomaly {
  severity: AnomalySeverity;
  category: AnomalyCategory;
  context: Record<string, unknown>;
  sessionId: string;
  timestamp: string;
}

export interface AnomalyReport {
  sessionId: string;
  timestamp: string;
  anomalies: Anomaly[];
  metadata: {
    samplesProcessed: number;
    metricsComputed: {
      meanLatency: number;
      stddevLatency: number;
      driftRate: number;
      stallThresholdMs: number;
    };
  };
}

interface TranscriptEntry {
  timestamp: string;
  sessionId: string;
  nodeId?: string;
  eventType: string;
  status: string;
  message: string;
  latencyMs?: number;
  startTime?: number;
  endTime?: number;
}

interface SessionMetrics {
  sessionId: string;
  startTime: number;
  endTime: number;
  eventCount: number;
  uniqueNodes: Set<string>;
  latencies: number[];
  driftEvents: number;
  breachEvents: number;
}

export class AnomalyDetector {
  private sessionMetrics: Map<string, SessionMetrics> = new Map();
  private globalStats = {
    meanLatency: 0,
    stddevLatency: 0,
    driftBaselinePerBatch: 5,
  };

  /**
   * Analyze transcript entries for anomalies.
   * Expects entries sorted by timestamp.
   */
  detect(entries: TranscriptEntry[]): AnomalyReport {
    const anomalies: Anomaly[] = [];

    if (entries.length === 0) {
      return {
        sessionId: 'unknown',
        timestamp: new Date().toISOString(),
        anomalies: [],
        metadata: {
          samplesProcessed: 0,
          metricsComputed: {
            meanLatency: 0,
            stddevLatency: 0,
            driftRate: 0,
            stallThresholdMs: 5 * 60 * 1000,
          },
        },
      };
    }

    // Compute global statistics
    this.computeGlobalStats(entries);

    // Group by session
    const bySessions = this.groupBySession(entries);

    // Detect anomalies per session
    for (const [sessionId, sessionEntries] of bySessions) {
      anomalies.push(...this.detectSessionAnomalies(sessionId, sessionEntries));
    }

    const mainSessionId = entries[entries.length - 1].sessionId || 'unknown';
    const reportTs = new Date().toISOString();

    return {
      sessionId: mainSessionId,
      timestamp: reportTs,
      anomalies,
      metadata: {
        samplesProcessed: entries.length,
        metricsComputed: {
          meanLatency: this.globalStats.meanLatency,
          stddevLatency: this.globalStats.stddevLatency,
          driftRate: this.globalStats.driftBaselinePerBatch,
          stallThresholdMs: 5 * 60 * 1000,
        },
      },
    };
  }

  private groupBySession(entries: TranscriptEntry[]): Map<string, TranscriptEntry[]> {
    const map = new Map<string, TranscriptEntry[]>();
    for (const entry of entries) {
      const sessionId = entry.sessionId || 'unknown';
      if (!map.has(sessionId)) {
        map.set(sessionId, []);
      }
      map.get(sessionId)!.push(entry);
    }
    return map;
  }

  private computeGlobalStats(entries: TranscriptEntry[]): void {
    const latencies: number[] = [];

    for (const entry of entries) {
      if (entry.latencyMs !== undefined && entry.latencyMs > 0) {
        latencies.push(entry.latencyMs);
      }
    }

    if (latencies.length === 0) {
      this.globalStats.meanLatency = 100;
      this.globalStats.stddevLatency = 10;
      return;
    }

    // Compute mean
    const sum = latencies.reduce((a, b) => a + b, 0);
    this.globalStats.meanLatency = sum / latencies.length;

    // Compute standard deviation
    const sqDiffs = latencies.map((l) => Math.pow(l - this.globalStats.meanLatency, 2));
    const sumSqDiffs = sqDiffs.reduce((a, b) => a + b, 0);
    this.globalStats.stddevLatency = Math.sqrt(sumSqDiffs / latencies.length);
  }

  private detectSessionAnomalies(sessionId: string, entries: TranscriptEntry[]): Anomaly[] {
    const anomalies: Anomaly[] = [];

    // Detect latency spikes (3σ from mean)
    anomalies.push(...this.detectLatencySpikes(sessionId, entries));

    // Detect drift spikes (resyncs > 5 per batch advancement)
    anomalies.push(...this.detectDriftSpikes(sessionId, entries));

    // Detect protocol violations (brief schema mismatch or hook bypass)
    anomalies.push(...this.detectProtocolViolations(sessionId, entries));

    // Detect stalled work (node in-progress > 5min without completion)
    anomalies.push(...this.detectStalledWork(sessionId, entries));

    // Detect batch instability (>2 re-syncs for single batch advancement)
    anomalies.push(...this.detectBatchInstability(sessionId, entries));

    // Detect performance regression (agent latency 20%+ higher than baseline)
    anomalies.push(...this.detectPerformanceRegression(sessionId, entries));

    return anomalies;
  }

  private detectLatencySpikes(sessionId: string, entries: TranscriptEntry[]): Anomaly[] {
    const anomalies: Anomaly[] = [];
    const threshold = this.globalStats.meanLatency + 3 * this.globalStats.stddevLatency;

    for (const entry of entries) {
      if (entry.latencyMs !== undefined && entry.latencyMs > threshold) {
        anomalies.push({
          severity: 'high',
          category: 'latency-spike',
          context: {
            latencyMs: entry.latencyMs,
            meanLatencyMs: this.globalStats.meanLatency,
            thresholdMs: threshold,
            sigmasAboveMean:
              (entry.latencyMs - this.globalStats.meanLatency) /
              this.globalStats.stddevLatency,
            nodeId: entry.nodeId,
            eventType: entry.eventType,
          },
          sessionId,
          timestamp: entry.timestamp,
        });
      }
    }

    return anomalies;
  }

  private detectDriftSpikes(sessionId: string, entries: TranscriptEntry[]): Anomaly[] {
    const anomalies: Anomaly[] = [];
    const driftLimit = this.globalStats.driftBaselinePerBatch;

    // Group entries by batch advancement (look for batches with too many resyncs)
    let currentBatch: TranscriptEntry[] = [];
    let batchStartIdx = 0;

    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];

      // Detect batch advancement (orient event with advancement)
      if (entry.eventType === 'orient' && entry.status === 'batch-advanced') {
        const driftCount = currentBatch.filter(
          (e) =>
            e.message && e.message.includes('head.json') && e.status === 'resynced',
        ).length;

        if (driftCount > driftLimit) {
          anomalies.push({
            severity: 'high',
            category: 'drift-spike',
            context: {
              driftCount,
              driftLimit,
              batchStartIdx,
              batchEndIdx: i,
              entries: currentBatch.length,
            },
            sessionId,
            timestamp: entry.timestamp,
          });
        }

        currentBatch = [];
        batchStartIdx = i;
      } else {
        currentBatch.push(entry);
      }
    }

    return anomalies;
  }

  private detectProtocolViolations(sessionId: string, entries: TranscriptEntry[]): Anomaly[] {
    const anomalies: Anomaly[] = [];

    for (const entry of entries) {
      // Check for brief schema mismatches
      if (
        entry.message &&
        (entry.message.includes('schema mismatch') ||
          entry.message.includes('brief validation failed'))
      ) {
        anomalies.push({
          severity: 'critical',
          category: 'protocol-violation',
          context: {
            violationType: 'brief-schema-mismatch',
            message: entry.message,
            nodeId: entry.nodeId,
          },
          sessionId,
          timestamp: entry.timestamp,
        });
      }

      // Check for hook bypass attempts
      if (entry.message && entry.message.includes('hook bypass')) {
        anomalies.push({
          severity: 'critical',
          category: 'protocol-violation',
          context: {
            violationType: 'hook-bypass-attempted',
            message: entry.message,
            nodeId: entry.nodeId,
          },
          sessionId,
          timestamp: entry.timestamp,
        });
      }

      // Check for skip events (potential protocol evasion)
      if (entry.eventType && entry.eventType.includes('SKIP')) {
        anomalies.push({
          severity: 'critical',
          category: 'protocol-violation',
          context: {
            violationType: 'validation-skip',
            eventType: entry.eventType,
            message: entry.message,
            nodeId: entry.nodeId,
          },
          sessionId,
          timestamp: entry.timestamp,
        });
      }
    }

    return anomalies;
  }

  private detectStalledWork(sessionId: string, entries: TranscriptEntry[]): Anomaly[] {
    const anomalies: Anomaly[] = [];
    const stallThreshold = 5 * 60 * 1000; // 5 minutes in ms

    // Track node start and end times
    const nodeTimings = new Map<
      string,
      { startIdx: number; startTime: number; lastUpdate: number }
    >();

    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      const timestamp = new Date(entry.timestamp).getTime();

      if (entry.nodeId) {
        if (entry.status === 'in-progress' && !nodeTimings.has(entry.nodeId)) {
          nodeTimings.set(entry.nodeId, {
            startIdx: i,
            startTime: timestamp,
            lastUpdate: timestamp,
          });
        } else if (entry.status !== 'in-progress' && nodeTimings.has(entry.nodeId)) {
          nodeTimings.delete(entry.nodeId);
        } else if (nodeTimings.has(entry.nodeId)) {
          const timing = nodeTimings.get(entry.nodeId)!;
          timing.lastUpdate = timestamp;
        }
      }
    }

    // Check for nodes that are still in-progress at end of entries
    const lastTimestamp = new Date(entries[entries.length - 1].timestamp).getTime();

    for (const [nodeId, timing] of nodeTimings) {
      const duration = lastTimestamp - timing.startTime;

      if (duration > stallThreshold) {
        anomalies.push({
          severity: 'high',
          category: 'stalled-work',
          context: {
            nodeId,
            durationMs: duration,
            stallThresholdMs: stallThreshold,
            startIdx: timing.startIdx,
            lastUpdateIdx: entries.findIndex((e) => e.nodeId === nodeId),
          },
          sessionId,
          timestamp: entries[entries.length - 1].timestamp,
        });
      }
    }

    return anomalies;
  }

  private detectBatchInstability(sessionId: string, entries: TranscriptEntry[]): Anomaly[] {
    const anomalies: Anomaly[] = [];

    // Track batches and their re-sync count
    const batches: Array<{ startIdx: number; resyncCount: number; endIdx?: number }> = [];
    let currentBatch = { startIdx: 0, resyncCount: 0 };

    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];

      // Count re-sync events (head.json updates)
      if (entry.message && entry.message.includes('head.json')) {
        currentBatch.resyncCount++;
      }

      // Detect batch advancement
      if (
        entry.eventType === 'orient' &&
        (entry.status === 'batch-advanced' || entry.status === 'next-batch')
      ) {
        currentBatch.endIdx = i;
        batches.push(currentBatch);
        currentBatch = { startIdx: i + 1, resyncCount: 0 };
      }
    }

    // Check batches with >2 re-syncs
    for (const batch of batches) {
      if (batch.resyncCount > 2) {
        anomalies.push({
          severity: 'medium',
          category: 'batch-instability',
          context: {
            resyncCount: batch.resyncCount,
            threshold: 2,
            batchStartIdx: batch.startIdx,
            batchEndIdx: batch.endIdx,
          },
          sessionId,
          timestamp:
            entries[batch.endIdx ?? batch.startIdx]?.timestamp ||
            new Date().toISOString(),
        });
      }
    }

    return anomalies;
  }

  private detectPerformanceRegression(sessionId: string, entries: TranscriptEntry[]): Anomaly[] {
    const anomalies: Anomaly[] = [];
    const regressionThreshold = 1.2; // 20% higher than baseline

    // Collect per-node latencies
    const nodeLatencies = new Map<string, number[]>();

    for (const entry of entries) {
      if (entry.nodeId && entry.latencyMs !== undefined && entry.latencyMs > 0) {
        if (!nodeLatencies.has(entry.nodeId)) {
          nodeLatencies.set(entry.nodeId, []);
        }
        nodeLatencies.get(entry.nodeId)!.push(entry.latencyMs);
      }
    }

    // Check each node's mean latency against global baseline
    for (const [nodeId, latencies] of nodeLatencies) {
      if (latencies.length > 0) {
        const nodeMean = latencies.reduce((a, b) => a + b, 0) / latencies.length;

        if (nodeMean > this.globalStats.meanLatency * regressionThreshold) {
          anomalies.push({
            severity: 'medium',
            category: 'performance-regression',
            context: {
              nodeId,
              nodeMeanLatencyMs: nodeMean,
              globalMeanLatencyMs: this.globalStats.meanLatency,
              regressionRatio: nodeMean / this.globalStats.meanLatency,
              threshold: regressionThreshold,
              samples: latencies.length,
            },
            sessionId,
            timestamp: entries[entries.length - 1].timestamp,
          });
        }
      }
    }

    return anomalies;
  }
}
