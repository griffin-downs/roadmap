# Agent Dispatch System

Sealed brief orchestration for distributed roadmap execution.

## Overview

The agent dispatch system enables multi-agent execution of DAG nodes with zero DAG introspection. Agents receive sealed briefs: immutable work contracts containing only their assigned node's consumes/produces slice.

## Architecture

### Sealed Brief
A sealed brief is a work contract that specifies:
- Node ID and description
- Input artifacts (consumes)
- Expected output artifacts (produces)
- Validation rules
- Handoff chain for tracing results

Agents receive **only** their brief. No access to:
- Full DAG structure
- Other nodes' dependencies
- Predecessor/successor info
- Batch-level coordination

### Modules

| Module | Purpose |
|--------|---------|
| `brief-gate.ts` | Validates sealed brief contracts before dispatch |
| `dispatch-coordinator.ts` | Orchestrator side: batch → agent assignments → sealed briefs |
| `agent-executor.ts` | Agent side: reads brief, executes node, checkpoints progress, final handoff |
| `handoff-journal.ts` | Stores checkpoints, final handoffs, recovers chain for next agent |
| `orchestrator.ts` | Harness: reads dispatch plan, spawns agents, coordinates completions |

### Execution Flow

1. **Coordinator** reads DAG batch, computes parallel order
2. **Coordinator** assigns nodes to agents, generates sealed briefs
3. **Agents** spawn in isolation, read sealed brief (stdin or file)
4. **Agents** execute: read consumes, run implementation, write produces
5. **Agents** checkpoint progress, emit final handoff (stdout or file)
6. **Coordinator** collects handoffs, validates completions, advances batch
7. **Orchestrator** coordinates next batch

## Sealed Brief Types

```typescript
interface SealedBrief {
  id: string;              // Brief UUID
  nodeId: string;          // Assigned node
  nodeDesc: string;
  produces: string[];      // Expected outputs
  consumes: string[];      // Required inputs
  validate: ValidationRule[];
  handoffChain: FinalHandoff[]; // Results from predecessors
}

interface FinalHandoff {
  nodeId: string;
  summary: string;
  keyDecisions: string[];
  gotchas: string[];
  timestamp: string;
}
```

## Integration with Roadmap

The agent dispatch system integrates with `roadmap complete`:

1. Agent executes node per sealed brief
2. Agent writes produces artifacts
3. Agent calls `roadmap complete <node> --handoff <json>` with final handoff
4. Roadmap validates artifacts, records handoff, advances batch

## Development

See module headers for implementation status and test patterns.
