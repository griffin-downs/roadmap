// @module hooks/agent-metrics
// @exports registerPreAgentMetricsHook, registerPostAgentMetricsHook, metricsCollector

/**
 * Agent Metrics Collection Hooks
 *
 * These hooks capture execution metrics:
 * - Pre-agent: brief size, agent ID, node ID
 * - Post-agent: duration, token count, tool calls, validation results
 */

import { writeFileSync, appendFileSync } from 'fs';
import { join } from 'path';

export interface PreAgentMetrics {
  event: 'agent_spawn';
  timestamp: string;
  agentId: string;
  nodeId: string;
  briefSize: number;
  briefSchema: 'valid' | 'invalid';
  depsCompleted: number;
  expectedProduces: number;
}

export interface PostAgentMetrics {
  event: 'agent_complete';
  timestamp: string;
  agentId: string;
  nodeId: string;
  exitCode: number;
  executionTimeMs: number;
  tokensUsed: number;
  toolCallsCount: number;
  validationResults: Array<{ rule: string; passed: boolean }>;
  handoffSize: number;
}

/**
 * Register pre-agent hook: fires before spawning an agent
 * Captures brief size, expected outputs, dependencies
 */
export function registerPreAgentMetricsHook(metricsPath: string) {
  return (brief: any, agentId: string, nodeId: string, depsCount: number) => {
    const metric: PreAgentMetrics = {
      event: 'agent_spawn',
      timestamp: new Date().toISOString(),
      agentId,
      nodeId,
      briefSize: JSON.stringify(brief).length,
      briefSchema: validateBriefSchema(brief) ? 'valid' : 'invalid',
      depsCompleted: depsCount,
      expectedProduces: (brief.produces || []).length,
    };
    appendFileSync(metricsPath, JSON.stringify(metric) + '\n');
  };
}

/**
 * Register post-agent hook: fires after agent completes
 * Captures execution time, token usage, tool calls, validation results
 */
export function registerPostAgentMetricsHook(metricsPath: string) {
  return (agentId: string, nodeId: string, result: any) => {
    const metric: PostAgentMetrics = {
      event: 'agent_complete',
      timestamp: new Date().toISOString(),
      agentId,
      nodeId,
      exitCode: result.exitCode ?? 0,
      executionTimeMs: result.executionTimeMs ?? 0,
      tokensUsed: result.tokensUsed ?? 0,
      toolCallsCount: (result.toolCalls ?? []).length,
      validationResults: result.validationResults ?? [],
      handoffSize: result.handoffSize ?? 0,
    };
    appendFileSync(metricsPath, JSON.stringify(metric) + '\n');
  };
}

/**
 * Validate brief schema
 */
function validateBriefSchema(brief: any): boolean {
  const required = ['nodeId', 'produces', 'consumes', 'description'];
  return required.every(field => field in brief && brief[field] != null);
}

/**
 * Parse metrics from JSONL file
 */
export function parseMetricsFile(metricsPath: string): { pre: PreAgentMetrics[]; post: PostAgentMetrics[] } {
  const fs = require('fs');
  if (!fs.existsSync(metricsPath)) return { pre: [], post: [] };

  const lines = fs.readFileSync(metricsPath, 'utf-8').split('\n').filter((l: string) => l.trim());
  const pre: PreAgentMetrics[] = [];
  const post: PostAgentMetrics[] = [];

  for (const line of lines) {
    try {
      const metric = JSON.parse(line);
      if (metric.event === 'agent_spawn') pre.push(metric);
      else if (metric.event === 'agent_complete') post.push(metric);
    } catch (e) {
      // ignore parse errors
    }
  }

  return { pre, post };
}

/**
 * Analyze metrics: compute statistics
 */
export function analyzeMetrics(metricsPath: string) {
  const { pre, post } = parseMetricsFile(metricsPath);

  if (post.length === 0) return { error: 'No agent completions recorded' };

  const avgExecutionTime = post.reduce((a, b) => a + b.executionTimeMs, 0) / post.length;
  const avgTokens = post.reduce((a, b) => a + b.tokensUsed, 0) / post.length;
  const avgToolCalls = post.reduce((a, b) => a + b.toolCallsCount, 0) / post.length;
  const avgBriefSize = pre.reduce((a, b) => a + b.briefSize, 0) / pre.length || 0;

  const successRate = post.filter(p => p.exitCode === 0).length / post.length;
  const validationPassRate = post.reduce((sum, p) => {
    const passing = p.validationResults.filter(v => v.passed).length;
    return sum + (passing / p.validationResults.length);
  }, 0) / post.length;

  return {
    executionCount: post.length,
    avgExecutionTimeMs: Math.round(avgExecutionTime),
    avgTokensPerAgent: Math.round(avgTokens),
    avgToolCallsPerAgent: Math.round(avgToolCalls),
    avgBriefSizeBytes: Math.round(avgBriefSize),
    successRate: (successRate * 100).toFixed(1) + '%',
    validationPassRate: (validationPassRate * 100).toFixed(1) + '%',
    totalTokensUsed: post.reduce((a, b) => a + b.tokensUsed, 0),
    totalExecutionTimeMs: post.reduce((a, b) => a + b.executionTimeMs, 0),
  };
}
