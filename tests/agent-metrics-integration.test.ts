import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFileSync, readFileSync, unlinkSync, existsSync } from 'fs';
import { join } from 'path';
import {
  registerPreAgentMetricsHook,
  registerPostAgentMetricsHook,
  parseMetricsFile,
  analyzeMetrics,
  PreAgentMetrics,
  PostAgentMetrics,
} from '../src/hooks/agent-metrics-hooks';

const testMetricsPath = join(__dirname, '../.test-metrics.jsonl');

describe('Agent Metrics Integration', () => {
  beforeEach(() => {
    if (existsSync(testMetricsPath)) {
      unlinkSync(testMetricsPath);
    }
  });

  afterEach(() => {
    if (existsSync(testMetricsPath)) {
      unlinkSync(testMetricsPath);
    }
  });

  describe('Pre-agent hook integration', () => {
    it('captures brief spawn metrics before agent execution', () => {
      const preHook = registerPreAgentMetricsHook(testMetricsPath);

      const brief = {
        nodeId: 'test-node-1',
        agentId: 'agent-001',
        produces: ['output1.ts', 'output2.json'],
        consumes: ['input.ts'],
        description: 'Test node for metrics',
      };

      preHook(brief, 'agent-001', 'test-node-1', 2);

      const { pre, post } = parseMetricsFile(testMetricsPath);
      expect(pre).toHaveLength(1);
      expect(post).toHaveLength(0);

      const metric = pre[0];
      expect(metric.event).toBe('agent_spawn');
      expect(metric.agentId).toBe('agent-001');
      expect(metric.nodeId).toBe('test-node-1');
      expect(metric.briefSize).toBeGreaterThan(0);
      expect(metric.briefSchema).toBe('valid');
      expect(metric.depsCompleted).toBe(2);
      expect(metric.expectedProduces).toBe(2);
    });

    it('marks invalid brief schema', () => {
      const preHook = registerPreAgentMetricsHook(testMetricsPath);

      const incompleteBrief = {
        nodeId: 'test-node-2',
        // missing required fields: produces, consumes, description
      };

      preHook(incompleteBrief, 'agent-002', 'test-node-2', 1);

      const { pre } = parseMetricsFile(testMetricsPath);
      expect(pre[0].briefSchema).toBe('invalid');
    });

    it('handles multiple agent spawns in sequence', () => {
      const preHook = registerPreAgentMetricsHook(testMetricsPath);

      for (let i = 0; i < 5; i++) {
        const brief = {
          nodeId: `node-${i}`,
          produces: ['output.ts'],
          consumes: ['input.ts'],
          description: `Test node ${i}`,
        };
        preHook(brief, `agent-${String(i).padStart(3, '0')}`, `node-${i}`, i);
      }

      const { pre } = parseMetricsFile(testMetricsPath);
      expect(pre).toHaveLength(5);
      expect(pre.map(p => p.nodeId)).toEqual(['node-0', 'node-1', 'node-2', 'node-3', 'node-4']);
    });
  });

  describe('Post-agent hook integration', () => {
    it('captures execution metrics after agent completes', () => {
      const postHook = registerPostAgentMetricsHook(testMetricsPath);

      const result = {
        exitCode: 0,
        executionTimeMs: 1250,
        tokensUsed: 1500,
        toolCalls: [{ name: 'readFile' }, { name: 'writeFile' }, { name: 'gitCommit' }],
        validationResults: [
          { rule: 'artifact-exists', passed: true },
          { rule: 'build-produces', passed: true },
        ],
        handoffSize: 450,
      };

      postHook('agent-001', 'test-node-1', result);

      const { post } = parseMetricsFile(testMetricsPath);
      expect(post).toHaveLength(1);

      const metric = post[0];
      expect(metric.event).toBe('agent_complete');
      expect(metric.agentId).toBe('agent-001');
      expect(metric.nodeId).toBe('test-node-1');
      expect(metric.exitCode).toBe(0);
      expect(metric.executionTimeMs).toBe(1250);
      expect(metric.tokensUsed).toBe(1500);
      expect(metric.toolCallsCount).toBe(3);
      expect(metric.validationResults).toHaveLength(2);
      expect(metric.handoffSize).toBe(450);
    });

    it('handles agent failure metrics', () => {
      const postHook = registerPostAgentMetricsHook(testMetricsPath);

      const result = {
        exitCode: 1,
        executionTimeMs: 800,
        tokensUsed: 900,
        toolCalls: [{ name: 'readFile' }],
        validationResults: [{ rule: 'artifact-exists', passed: false }],
        handoffSize: 0,
      };

      postHook('agent-002', 'failed-node', result);

      const { post } = parseMetricsFile(testMetricsPath);
      expect(post[0].exitCode).toBe(1);
      expect(post[0].validationResults[0].passed).toBe(false);
    });

    it('handles partial result data gracefully', () => {
      const postHook = registerPostAgentMetricsHook(testMetricsPath);

      const sparseResult = {
        exitCode: 0,
        executionTimeMs: 500,
        // tokensUsed omitted
        // toolCalls omitted
        // validationResults omitted
        // handoffSize omitted
      };

      postHook('agent-003', 'minimal-node', sparseResult);

      const { post } = parseMetricsFile(testMetricsPath);
      expect(post[0].tokensUsed).toBe(0);
      expect(post[0].toolCallsCount).toBe(0);
      expect(post[0].validationResults).toEqual([]);
      expect(post[0].handoffSize).toBe(0);
    });
  });

  describe('Orchestrator integration flow', () => {
    it('captures spawn → init → ready → done transitions', () => {
      const preHook = registerPreAgentMetricsHook(testMetricsPath);
      const postHook = registerPostAgentMetricsHook(testMetricsPath);

      // Simulate orchestrator dispatch
      const batch = [
        { nodeId: 'node-a', produces: ['a.ts'], consumes: ['init.ts'] },
        { nodeId: 'node-b', produces: ['b.ts'], consumes: ['init.ts'] },
      ];

      // Pre-spawn: agent 1
      preHook(batch[0], 'agent-001', batch[0].nodeId, 1);

      // Pre-spawn: agent 2
      preHook(batch[1], 'agent-002', batch[1].nodeId, 1);

      // Agent 1 completes
      postHook('agent-001', batch[0].nodeId, {
        exitCode: 0,
        executionTimeMs: 1200,
        tokensUsed: 1400,
        toolCalls: [{ name: 'readFile' }, { name: 'writeFile' }],
        validationResults: [{ rule: 'artifact-exists', passed: true }],
        handoffSize: 350,
      });

      // Agent 2 completes
      postHook('agent-002', batch[1].nodeId, {
        exitCode: 0,
        executionTimeMs: 950,
        tokensUsed: 1100,
        toolCalls: [{ name: 'readFile' }],
        validationResults: [{ rule: 'artifact-exists', passed: true }],
        handoffSize: 280,
      });

      const { pre, post } = parseMetricsFile(testMetricsPath);
      expect(pre).toHaveLength(2);
      expect(post).toHaveLength(2);

      // Verify sequence
      expect(pre[0].timestamp <= pre[1].timestamp).toBe(true);
      expect(pre[1].timestamp <= post[0].timestamp).toBe(true);
      expect(post[0].timestamp <= post[1].timestamp).toBe(true);
    });
  });

  describe('Metrics analysis', () => {
    it('computes aggregate statistics from metrics file', () => {
      const preHook = registerPreAgentMetricsHook(testMetricsPath);
      const postHook = registerPostAgentMetricsHook(testMetricsPath);

      // Populate metrics
      for (let i = 0; i < 3; i++) {
        const brief = {
          nodeId: `node-${i}`,
          produces: ['out.ts'],
          consumes: ['in.ts'],
          description: `Node ${i}`,
        };
        preHook(brief, `agent-${i}`, `node-${i}`, 1);

        postHook(`agent-${i}`, `node-${i}`, {
          exitCode: i === 1 ? 1 : 0, // Agent 1 fails
          executionTimeMs: 1000 + i * 200,
          tokensUsed: 1000 + i * 100,
          toolCalls: Array(2 + i).fill({ name: 'tool' }),
          validationResults: [{ rule: 'test', passed: i !== 1 }],
          handoffSize: 300,
        });
      }

      const stats = analyzeMetrics(testMetricsPath);
      expect(stats.error).toBeUndefined();
      expect(stats.executionCount).toBe(3);
      expect(stats.avgExecutionTimeMs).toBeGreaterThan(0);
      expect(stats.avgTokensPerAgent).toBeGreaterThan(0);
      expect(stats.avgToolCallsPerAgent).toBeGreaterThan(0);
      expect(stats.avgBriefSizeBytes).toBeGreaterThan(0);
      expect(stats.successRate).toBe('66.7%');
      expect(stats.validationPassRate).toBe('66.7%');
      expect(stats.totalTokensUsed).toBeGreaterThan(0);
      expect(stats.totalExecutionTimeMs).toBeGreaterThan(0);
    });

    it('returns error when no completions recorded', () => {
      const stats = analyzeMetrics(testMetricsPath);
      expect(stats.error).toBe('No agent completions recorded');
    });
  });

  describe('JSONL format compliance', () => {
    it('produces valid JSONL output', () => {
      const preHook = registerPreAgentMetricsHook(testMetricsPath);
      const postHook = registerPostAgentMetricsHook(testMetricsPath);

      const brief = {
        nodeId: 'test',
        produces: [],
        consumes: [],
        description: 'test',
      };

      preHook(brief, 'agent-1', 'test', 0);
      postHook('agent-1', 'test', { exitCode: 0, executionTimeMs: 100 });

      const content = readFileSync(testMetricsPath, 'utf-8');
      const lines = content.split('\n').filter(l => l.trim());

      expect(lines).toHaveLength(2);
      for (const line of lines) {
        expect(() => JSON.parse(line)).not.toThrow();
      }
    });

    it('appends without overwriting', () => {
      const preHook = registerPreAgentMetricsHook(testMetricsPath);

      const brief = { nodeId: 'n', produces: [], consumes: [], description: 'd' };

      preHook(brief, 'a1', 'n', 0);
      preHook(brief, 'a2', 'n', 0);
      preHook(brief, 'a3', 'n', 0);

      const content = readFileSync(testMetricsPath, 'utf-8');
      const lines = content.split('\n').filter(l => l.trim());

      expect(lines).toHaveLength(3);
    });
  });
});
