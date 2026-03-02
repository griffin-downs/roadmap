import * as fs from 'fs';
import * as path from 'path';
import {
  TrendAnalyzer,
  TranscriptEvent,
  createTrendAnalyzer,
} from '../src/lib/mining/trend-analyzer';

describe('TrendAnalyzer', () => {
  let testDataPath: string;
  let analyzer: TrendAnalyzer;

  beforeAll(() => {
    // Create synthetic transcript data
    testDataPath = path.join(__dirname, 'synthetic-transcript.jsonl');

    const syntheticEvents: TranscriptEvent[] = [
      // Baseline session (self-improvement-001)
      {
        timestamp: '2026-03-02T10:00:00Z',
        sessionId: 'self-improvement-001',
        eventType: 'orient',
        status: 'complete',
        message: '25-agent load test',
        duration: 1000,
      },
      {
        timestamp: '2026-03-02T10:05:00Z',
        sessionId: 'self-improvement-001',
        eventType: 'advance',
        status: 'complete',
        message: 'Batch completed',
        duration: 1050,
      },
      {
        timestamp: '2026-03-02T10:10:00Z',
        sessionId: 'self-improvement-001',
        eventType: 'orient',
        status: 'complete',
        message: '50-agent load test',
        duration: 1200,
      },
      {
        timestamp: '2026-03-02T10:15:00Z',
        sessionId: 'self-improvement-001',
        eventType: 'recover',
        status: 'complete',
        message: 'Resync triggered',
      },
      {
        timestamp: '2026-03-02T10:20:00Z',
        sessionId: 'self-improvement-001',
        eventType: 'advance',
        status: 'complete',
        message: 'Batch completed',
        duration: 1100,
      },
      // Recent session with improvements
      {
        timestamp: '2026-03-02T11:00:00Z',
        sessionId: 'transcript-mining-001',
        eventType: 'orient',
        status: 'complete',
        message: '25-agent scaling test',
        duration: 900,
      },
      {
        timestamp: '2026-03-02T11:05:00Z',
        sessionId: 'transcript-mining-001',
        eventType: 'advance',
        status: 'complete',
        message: 'Batch completed',
        duration: 950,
      },
      {
        timestamp: '2026-03-02T11:10:00Z',
        sessionId: 'transcript-mining-001',
        eventType: 'orient',
        status: 'complete',
        message: '50-agent scaling test',
        duration: 1100,
      },
      {
        timestamp: '2026-03-02T11:15:00Z',
        sessionId: 'transcript-mining-001',
        eventType: 'advance',
        status: 'complete',
        message: 'Batch completed',
        duration: 1050,
      },
      // Another session
      {
        timestamp: '2026-03-02T12:00:00Z',
        sessionId: 'scaling-optimization-001',
        eventType: 'orient',
        status: 'complete',
        message: '25-agent load test',
        duration: 850,
      },
      {
        timestamp: '2026-03-02T12:05:00Z',
        sessionId: 'scaling-optimization-001',
        eventType: 'advance',
        status: 'complete',
        message: 'Batch completed',
        duration: 900,
      },
      {
        timestamp: '2026-03-02T12:10:00Z',
        sessionId: 'scaling-optimization-001',
        eventType: 'orient',
        status: 'complete',
        message: '50-agent load test',
        duration: 1050,
      },
      {
        timestamp: '2026-03-02T12:15:00Z',
        sessionId: 'scaling-optimization-001',
        eventType: 'advance',
        status: 'complete',
        message: 'Batch completed',
        duration: 980,
      },
    ];

    // Write synthetic data
    const lines = syntheticEvents.map(e => JSON.stringify(e));
    fs.writeFileSync(testDataPath, lines.join('\n') + '\n');

    // Create analyzer
    analyzer = createTrendAnalyzer(testDataPath);
  });

  afterAll(() => {
    // Cleanup
    if (fs.existsSync(testDataPath)) {
      fs.unlinkSync(testDataPath);
    }
  });

  describe('latencyImprovement', () => {
    it('should detect latency improvements', () => {
      const result = analyzer.latencyImprovement();

      expect(result).toBeDefined();
      expect(result.baseline).toBeGreaterThan(0);
      expect(result.current).toBeGreaterThan(0);
      expect(typeof result.deltaPercent).toBe('number');
      expect(['improving', 'stable', 'degrading']).toContain(result.trend);
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(100);
    });

    it('should calculate delta correctly', () => {
      const result = analyzer.latencyImprovement();
      const expectedDelta = result.current - result.baseline;
      expect(result.delta).toBe(expectedDelta);
    });
  });

  describe('scalingEfficiency', () => {
    it('should detect scaling characteristics', () => {
      const result = analyzer.scalingEfficiency();

      expect(result).toBeDefined();
      expect(result.agents25Latency).toBeGreaterThan(0);
      expect(result.agents50Latency).toBeGreaterThan(0);
      expect(typeof result.growthRate).toBe('number');
      expect(['sublinear', 'linear', 'superlinear']).toContain(result.growthModel);
    });

    it('should calculate growth rate correctly', () => {
      const result = analyzer.scalingEfficiency();
      const expectedGrowthRate =
        ((result.agents50Latency - result.agents25Latency) / result.agents25Latency) * 100;
      expect(Math.abs(result.growthRate - expectedGrowthRate)).toBeLessThan(1);
    });
  });

  describe('persistenceStability', () => {
    it('should track resync frequency', () => {
      const result = analyzer.persistenceStability();

      expect(result).toBeDefined();
      expect(result.resyncEventsPerBatch).toBeGreaterThanOrEqual(0);
      expect(['decreasing', 'stable', 'increasing']).toContain(result.trend);
      expect(result.totalResyncEvents).toBeGreaterThanOrEqual(0);
    });
  });

  describe('batchAdvancementTrend', () => {
    it('should measure batch advancement time', () => {
      const result = analyzer.batchAdvancementTrend();

      expect(result).toBeDefined();
      expect(result.currentMs).toBeGreaterThanOrEqual(0);
      expect(['improving', 'stable', 'degrading']).toContain(result.trend);
      expect(result.samples).toBeGreaterThanOrEqual(0);
    });
  });

  describe('forecast', () => {
    it('should forecast scaling to 100 agents', () => {
      const result = analyzer.forecast();

      expect(result).toBeDefined();
      expect(result.agents100EstimatedLatency).toBeGreaterThan(0);
      expect(result.agents100EstimatedLatencyRange).toBeDefined();
      expect(result.agents100EstimatedLatencyRange.min).toBeGreaterThan(0);
      expect(result.agents100EstimatedLatencyRange.max).toBeGreaterThanOrEqual(
        result.agents100EstimatedLatencyRange.min
      );
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(100);
      expect(['sublinear', 'linear', 'superlinear']).toContain(result.scalingModel);
    });

    it('should have reasonable forecast bounds', () => {
      const result = analyzer.forecast();
      const estimated = result.agents100EstimatedLatency;
      const range = result.agents100EstimatedLatencyRange;

      expect(range.min).toBeLessThanOrEqual(estimated);
      expect(range.max).toBeGreaterThanOrEqual(estimated);
      expect(range.max - range.min).toBeLessThan(estimated * 0.5);
    });
  });

  describe('generateReport', () => {
    it('should generate comprehensive report', () => {
      const report = analyzer.generateReport();

      expect(report).toBeDefined();
      expect(report.timestamp).toBeDefined();
      expect(report.analysisWindow).toBeDefined();
      expect(report.latencyImprovement).toBeDefined();
      expect(report.scalingEfficiency).toBeDefined();
      expect(report.persistenceStability).toBeDefined();
      expect(report.batchAdvancementTrend).toBeDefined();
      expect(report.forecast).toBeDefined();
      expect(Array.isArray(report.recommendations)).toBe(true);
      expect(report.recommendations.length).toBeGreaterThan(0);
    });

    it('should generate actionable recommendations', () => {
      const report = analyzer.generateReport();

      // All recommendations should be non-empty strings
      for (const rec of report.recommendations) {
        expect(typeof rec).toBe('string');
        expect(rec.length).toBeGreaterThan(0);
      }
    });

    it('should have valid analysis window description', () => {
      const report = analyzer.generateReport();
      expect(report.analysisWindow).toMatch(/\d+\s+session/i);
    });
  });
});
