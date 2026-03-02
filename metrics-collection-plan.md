# Metrics Collection Implementation Plan

## Overview
Instrument agent execution to measure token usage, latency, and tool call counts. Compare briefed vs. full-context agents empirically.

## Hook Integration Points

### 1. Pre-Agent Hook (orchestrator.ts)
**Fires when:** Agent about to be spawned
**Data collected:**
- Brief size (bytes)
- Agent ID
- Node ID
- Dependencies completed count
- Expected produces count

**Location:** Before `spawn(agent, brief)`

### 2. Post-Agent Hook (orchestrator.ts)
**Fires when:** Agent completes
**Data collected:**
- Execution time (ms)
- Token count (from API instrumentation)
- Tool calls made (count)
- Validation results
- Handoff size

**Location:** After agent process exits

## Data Pipeline

```
@pre-agent hook → metrics.jsonl
                 ↓
@post-agent hook → metrics.jsonl (append)
                 ↓
analysis script → statistics summary
                 ↓
comparison report (briefed vs. unbriefed cohorts)
```

## Instrumentation Checklist

- [ ] Add @pre-agent hook call in orchestrator spawn
- [ ] Add @post-agent hook call in orchestrator completion handler
- [ ] Wire token counter to API calls
- [ ] Wire tool counter to orchestrator dispatch
- [ ] Create metrics.jsonl file on agent batch start
- [ ] Append metrics on each agent event
- [ ] Create analysis script to parse JSONL and compute stats
- [ ] Run 50+ agent executions to collect baseline

## Expected Outputs

**metrics-sample.jsonl** (lines):
```json
{"event":"agent_spawn","timestamp":"2026-03-02T11:30:00Z","agentId":"w1","nodeId":"audit-protocol","briefSize":1250,"depsCompleted":1,"expectedProduces":1}
{"event":"agent_complete","timestamp":"2026-03-02T11:35:00Z","agentId":"w1","nodeId":"audit-protocol","exitCode":0,"executionTimeMs":5000,"tokensUsed":4850,"toolCallsCount":5,"validationResults":[{"rule":"artifact-exists","passed":true}],"handoffSize":2100}
...
```

**metrics-analysis.json**:
```json
{
  "executionCount": 50,
  "avgExecutionTimeMs": 2850,
  "avgTokensPerAgent": 4200,
  "avgToolCallsPerAgent": 4,
  "avgBriefSizeBytes": 1200,
  "successRate": "98%",
  "validationPassRate": "100%",
  "totalTokensUsed": 210000,
  "totalExecutionTimeMs": 142500
}
```

## Comparison: Briefed vs. Unbriefed

Once baseline collected, measure:
- Token ratio: unbriefed / briefed
- Latency ratio: unbriefed / briefed
- Tool call ratio: unbriefed / briefed

Expected:
- Token savings: 70-80% (brief is ~1/5 size)
- Latency savings: 60-70% (focused execution)
- Tool call savings: 50-70% (no exploration)

## Success Criteria

- [ ] 50+ agent executions captured
- [ ] All metrics present (no nulls)
- [ ] Token count > 0 for all agents
- [ ] Execution time > 0 for all agents
- [ ] Tool calls >= 0 for all agents
- [ ] Success rate >= 95%
