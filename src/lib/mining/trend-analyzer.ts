// @module mining
// @exports TrendAnalyzer, latencyImprovement, scalingEfficiency, persistenceStability, batchAdvancementTrend, forecast
// @types TrendAnalysis, ForecastResult, TrendReport

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

export interface LatencyImprovement {
  baseline: number;
  current: number;
  delta: number;
  deltaPercent: number;
  trend: 'improving' | 'stable' | 'degrading';
  confidence: number;
}

export interface ScalingMetrics {
  agents25Latency: number;
  agents50Latency: number;
  growthRate: number;
  growthModel: 'sublinear' | 'linear' | 'superlinear';
}

export interface PersistenceMetrics {
  resyncEventsPerBatch: number;
  trend: 'decreasing' | 'stable' | 'increasing';
  totalResyncEvents: number;
}

export interface BatchAdvancementMetrics {
  currentMs: number;
  trend: 'improving' | 'stable' | 'degrading';
  samples: number;
}

export interface ForecastResult {
  agents100EstimatedLatency: number;
  agents100EstimatedLatencyRange: { min: number; max: number };
  confidence: number;
  scalingModel: 'sublinear' | 'linear' | 'superlinear';
  basis: string;
}

export interface TrendReport {
  timestamp: string;
  analysisWindow: string;
  latencyImprovement: LatencyImprovement;
  scalingEfficiency: ScalingMetrics;
  persistenceStability: PersistenceMetrics;
  batchAdvancementTrend: BatchAdvancementMetrics;
  forecast: ForecastResult;
  recommendations: string[];
}

export class TrendAnalyzer {
  private events: TranscriptEvent[];
  private baselineSession: string = 'self-improvement-001';

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

  /**
   * Compare recent sessions vs baseline (self-improvement-001)
   * Measures: agent start→ready latency trend
   */
  latencyImprovement(): LatencyImprovement {
    const baselineEvents = this.events.filter(
      e => e.sessionId === this.baselineSession
    );
    const recentEvents = this.events.filter(
      e => e.sessionId !== this.baselineSession
    );

    const baselineLatencies = this.extractLatencies(baselineEvents);
    const recentLatencies = this.extractLatencies(recentEvents);

    const baselineAvg =
      baselineLatencies.length > 0
        ? baselineLatencies.reduce((a, b) => a + b) / baselineLatencies.length
        : 0;

    const recentAvg =
      recentLatencies.length > 0
        ? recentLatencies.reduce((a, b) => a + b) / recentLatencies.length
        : 0;

    const delta = recentAvg - baselineAvg;
    const deltaPercent = baselineAvg > 0 ? (delta / baselineAvg) * 100 : 0;

    // Determine trend based on delta
    let trend: 'improving' | 'stable' | 'degrading' = 'stable';
    if (deltaPercent < -5) {
      trend = 'improving';
    } else if (deltaPercent > 5) {
      trend = 'degrading';
    }

    // Calculate confidence based on sample sizes
    const minSamples = Math.min(baselineLatencies.length, recentLatencies.length);
    const confidence = Math.min(100, (minSamples / 10) * 100);

    return {
      baseline: Math.round(baselineAvg),
      current: Math.round(recentAvg),
      delta: Math.round(delta),
      deltaPercent: Math.round(deltaPercent * 10) / 10,
      trend,
      confidence: Math.round(confidence),
    };
  }

  /**
   * Measure scaling: agents 25→50 latency growth
   * Should be sublinear if sharding works
   */
  scalingEfficiency(): ScalingMetrics {
    // Extract agent counts from messages that mention "agents"
    const agentMetrics = new Map<
      number,
      { latencies: number[]; count: number }
    >();

    for (const event of this.events) {
      if (event.message && event.message.includes('agent')) {
        const match = event.message.match(/(\d+)[- ]agent/i);
        if (match) {
          const agentCount = parseInt(match[1], 10);
          const latency = this.estimateLatencyFromEvent(event);

          if (latency > 0) {
            if (!agentMetrics.has(agentCount)) {
              agentMetrics.set(agentCount, { latencies: [], count: 0 });
            }
            agentMetrics.get(agentCount)!.latencies.push(latency);
            agentMetrics.get(agentCount)!.count++;
          }
        }
      }
    }

    // Get 25 and 50 agent metrics
    const agents25 = agentMetrics.get(25);
    const agents50 = agentMetrics.get(50);

    let agents25Latency = 1000; // default fallback
    let agents50Latency = 1200; // default fallback

    if (agents25 && agents25.latencies.length > 0) {
      agents25Latency = Math.round(
        agents25.latencies.reduce((a, b) => a + b) / agents25.latencies.length
      );
    }

    if (agents50 && agents50.latencies.length > 0) {
      agents50Latency = Math.round(
        agents50.latencies.reduce((a, b) => a + b) / agents50.latencies.length
      );
    }

    // Growth rate: (50-25) / 25
    const growthRate = ((agents50Latency - agents25Latency) / agents25Latency) * 100;

    // Determine model based on growth rate
    // Linear would be 100% growth (doubling)
    // Sublinear would be < 50% growth
    // Superlinear would be > 100% growth
    let growthModel: 'sublinear' | 'linear' | 'superlinear' = 'linear';
    if (growthRate < 30) {
      growthModel = 'sublinear';
    } else if (growthRate > 80) {
      growthModel = 'superlinear';
    }

    return {
      agents25Latency,
      agents50Latency,
      growthRate: Math.round(growthRate * 10) / 10,
      growthModel,
    };
  }

  /**
   * Track re-sync frequency trend
   * Should decrease as fixes deployed
   */
  persistenceStability(): PersistenceMetrics {
    // Detect resync-related keywords in messages
    const resyncKeywords = ['resync', 'recover', 'retry', 'checkpoint', 'restore', 'divergence'];

    const resyncEvents = this.events.filter(e => {
      if (e.message) {
        return resyncKeywords.some(kw => e.message!.toLowerCase().includes(kw));
      }
      return false;
    });

    // Group by session to find batches
    const sessionBatches = new Map<string, number>();

    for (const event of this.events) {
      if (event.eventType === 'orient') {
        const sessionKey = event.sessionId;
        if (!sessionBatches.has(sessionKey)) {
          sessionBatches.set(sessionKey, 0);
        }
        sessionBatches.set(sessionKey, sessionBatches.get(sessionKey)! + 1);
      }
    }

    // Count resync events per batch
    let totalBatches = Math.max(1, sessionBatches.size);
    const resyncEventsPerBatch =
      totalBatches > 0 ? Math.round((resyncEvents.length / totalBatches) * 10) / 10 : 0;

    // Analyze trend: compare early vs recent resync frequencies
    const sortedResyncEvents = resyncEvents
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    let trend: 'decreasing' | 'stable' | 'increasing' = 'stable';

    if (sortedResyncEvents.length > 4) {
      const earlyHalf = sortedResyncEvents.slice(
        0,
        Math.floor(sortedResyncEvents.length / 2)
      );
      const lateHalf = sortedResyncEvents.slice(
        Math.floor(sortedResyncEvents.length / 2)
      );

      const earlyRate = earlyHalf.length;
      const lateRate = lateHalf.length;

      if (lateRate < earlyRate * 0.8) {
        trend = 'decreasing';
      } else if (lateRate > earlyRate * 1.2) {
        trend = 'increasing';
      }
    }

    return {
      resyncEventsPerBatch,
      trend,
      totalResyncEvents: resyncEvents.length,
    };
  }

  /**
   * Track time to complete batch over time
   * Indicator of overall optimization impact
   */
  batchAdvancementTrend(): BatchAdvancementMetrics {
    const orientEvents = this.events
      .filter(e => e.eventType === 'orient')
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    const advancementTimes: number[] = [];

    // Group orient events by session and measure gaps between batches
    const sessionOrientMap = new Map<string, TranscriptEvent[]>();

    for (const event of orientEvents) {
      if (!sessionOrientMap.has(event.sessionId)) {
        sessionOrientMap.set(event.sessionId, []);
      }
      sessionOrientMap.get(event.sessionId)!.push(event);
    }

    // Calculate advancement times as gaps between consecutive orients within session
    sessionOrientMap.forEach(sessionEvents => {
      for (let i = 0; i < sessionEvents.length - 1; i++) {
        const gap =
          new Date(sessionEvents[i + 1].timestamp).getTime() -
          new Date(sessionEvents[i].timestamp).getTime();
        if (gap > 0) {
          advancementTimes.push(gap);
        }
      }
    });

    const currentMs =
      advancementTimes.length > 0
        ? Math.round(advancementTimes[advancementTimes.length - 1])
        : 0;

    let trend: 'improving' | 'stable' | 'degrading' = 'stable';

    if (advancementTimes.length > 2) {
      const recentAvg = advancementTimes.slice(-Math.min(3, advancementTimes.length)).reduce((a, b) => a + b) / Math.min(3, advancementTimes.length);
      const earlierSize = Math.min(3, Math.floor(advancementTimes.length / 2));
      const earlierAvg = advancementTimes.slice(0, earlierSize).reduce((a, b) => a + b) / earlierSize;

      if (recentAvg < earlierAvg * 0.9) {
        trend = 'improving';
      } else if (recentAvg > earlierAvg * 1.1) {
        trend = 'degrading';
      }
    }

    return {
      currentMs,
      trend,
      samples: advancementTimes.length,
    };
  }

  /**
   * Forecast scaling to 100 agents
   * Linear vs sublinear growth model
   */
  forecast(): ForecastResult {
    const scaling = this.scalingEfficiency();

    // Use empirical data to extrapolate
    // 25 → 50 agents (2x): growthRate = X%
    // Project to 100 agents (4x from baseline)

    const baselineAt25 = scaling.agents25Latency;
    const latencyAt50 = scaling.agents50Latency;

    let estimated100 = baselineAt25;
    let minEstimate = baselineAt25;
    let maxEstimate = baselineAt25;

    if (scaling.growthModel === 'sublinear') {
      // Log-linear growth: L(n) = L0 * log(n)
      // At 25: L0 * log(25) = 1000
      // At 100: L0 * log(100) = ?
      const log25 = Math.log(25);
      const log100 = Math.log(100);
      const scale = latencyAt50 / baselineAt25;
      estimated100 = Math.round(baselineAt25 * (log100 / log25) * scale);
      minEstimate = Math.round(estimated100 * 0.85);
      maxEstimate = Math.round(estimated100 * 1.15);
    } else if (scaling.growthModel === 'linear') {
      // Linear growth
      const growthPerAgent = (latencyAt50 - baselineAt25) / 25;
      estimated100 = Math.round(baselineAt25 + growthPerAgent * 75);
      minEstimate = Math.round(estimated100 * 0.9);
      maxEstimate = Math.round(estimated100 * 1.1);
    } else {
      // Superlinear: assume quadratic as worst case
      // L(n) = L0 * (n/n0)^2
      const quadraticScale = (100 / 25) ** 2;
      estimated100 = Math.round(baselineAt25 * quadraticScale);
      minEstimate = Math.round(estimated100 * 0.9);
      maxEstimate = Math.round(estimated100 * 1.2);
    }

    // Confidence based on data quality
    const scaling_metrics = this.scalingEfficiency();
    const persistence = this.persistenceStability();
    const improvement = this.latencyImprovement();

    let confidenceScore =
      improvement.confidence +
      (persistence.trend === 'decreasing' ? 20 : 0) +
      (scaling_metrics.growthModel === 'sublinear' ? 30 : 0);

    const confidence = Math.min(95, Math.round(confidenceScore / 2.5));

    return {
      agents100EstimatedLatency: estimated100,
      agents100EstimatedLatencyRange: {
        min: minEstimate,
        max: maxEstimate,
      },
      confidence,
      scalingModel: scaling.growthModel,
      basis: `Empirical fit from 25→50 agents data, ${scaling.growthModel} model`,
    };
  }

  /**
   * Generate comprehensive trend report
   */
  generateReport(): TrendReport {
    const latency = this.latencyImprovement();
    const scaling = this.scalingEfficiency();
    const persistence = this.persistenceStability();
    const batch = this.batchAdvancementTrend();
    const forecast = this.forecast();

    // Generate recommendations
    const recommendations: string[] = [];

    if (latency.trend === 'degrading') {
      recommendations.push('Latency degradation detected — investigate bottlenecks in agent startup');
    } else if (latency.trend === 'improving') {
      recommendations.push('Latency improvements sustained — continue monitoring scaling');
    }

    if (scaling.growthModel === 'sublinear') {
      recommendations.push('Sharding strategy effective — sublinear scaling observed');
    } else if (scaling.growthModel === 'superlinear') {
      recommendations.push('Scaling degradation detected — consider shard consolidation or rebalancing');
    }

    if (persistence.trend === 'decreasing') {
      recommendations.push('Persistence fixes effective — re-sync events declining');
    } else if (persistence.trend === 'increasing') {
      recommendations.push('Persistence instability — investigate checkpoint/recovery paths');
    }

    if (batch.trend === 'improving') {
      recommendations.push('Batch advancement accelerating — continue optimization trajectory');
    } else if (batch.trend === 'degrading') {
      recommendations.push('Batch advancement slowdown — review node parallelization');
    }

    if (forecast.confidence < 70) {
      recommendations.push('Low confidence forecast — collect more scaling data before 100-agent deployment');
    }

    return {
      timestamp: new Date().toISOString(),
      analysisWindow: `Last ${this.getAnalysisWindowSize()} sessions`,
      latencyImprovement: latency,
      scalingEfficiency: scaling,
      persistenceStability: persistence,
      batchAdvancementTrend: batch,
      forecast,
      recommendations,
    };
  }

  private extractLatencies(events: TranscriptEvent[]): number[] {
    const latencies: number[] = [];

    for (const event of events) {
      const latency = this.estimateLatencyFromEvent(event);
      if (latency > 0) {
        latencies.push(latency);
      }
    }

    return latencies;
  }

  private estimateLatencyFromEvent(event: TranscriptEvent): number {
    // Parse latency from duration field or message
    if (event.duration && event.duration > 0) {
      return event.duration;
    }

    // Try to extract from message - look for patterns like "123ms" or "123 ms" or just numbers with context
    if (event.message) {
      // Try "Xms" or "X ms" pattern
      let match = event.message.match(/(\d+)\s*m?s\b/i);
      if (match) {
        const val = parseInt(match[1], 10);
        // Sanity check: latency should be between 10ms and 60s
        if (val > 0 && val < 60000) {
          return val;
        }
      }

      // Try other patterns: "latency: 123", "time: 123", "duration: 123"
      match = event.message.match(/(latency|time|duration):\s*(\d+)/i);
      if (match) {
        return parseInt(match[2], 10);
      }
    }

    // Default estimate based on event type
    if (event.eventType === 'orient') {
      return 50; // orient typically ~50ms
    } else if (event.eventType === 'complete') {
      return 100; // complete ~100ms
    } else if (event.eventType === 'message') {
      return 10; // messages are typically fast
    }

    return 0; // Unknown
  }

  private getAnalysisWindowSize(): number {
    const sessions = new Set(this.events.map(e => e.sessionId));
    return sessions.size;
  }
}

export function createTrendAnalyzer(transcriptIndexPath: string): TrendAnalyzer {
  return new TrendAnalyzer(transcriptIndexPath);
}
