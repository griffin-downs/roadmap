# Agent Dispatch System

Sealed brief orchestration for parallel agent execution. Agents receive only their work contract (consumes/produces), execute in isolation, and return final handoffs — no DAG introspection, no global state access.

## Architecture

**Core components:**
- **Brief** — sealed work contract: position, batch, produces/consumes, description
- **Dispatch coordinator** — computes batch from DAG, assigns agents, generates sealed briefs
- **Agent executor** — reads brief, executes work, checkpoints progress, produces final handoff
- **Handoff journal** — stores interim checkpoints, chains handoffs for next agent

## Sealed Brief Contract

Each agent receives:
```typescript
{
  position: string[];        // current batch (node IDs only)
  mode: 'plan' | 'execute';  // node execution mode
  produces: string[];        // artifacts to create
  consumes: string[];        // input artifacts (filenames only, no content)
  description: string;       // what this node does
  pattern?: string;          // implementation pattern (e.g., 'shell', 'git-ops')
  handoffs?: FinalHandoff[]; // prior agent handoffs (context chain)
}
```

**Sealed**: agents cannot introspect the DAG, see other nodes' contracts, or access global state. They receive only their slice of the graph.

## Execution Model

1. **Orchestrator** reads DAG, computes current batch
2. **Dispatch coordinator** assigns each batch node to an agent
3. Each agent receives a sealed brief (no DAG)
4. Agent executes: reads consumes, writes produces, checkpoints
5. Agent produces **final handoff** (summary + key decisions)
6. Orchestrator validates all agents complete, collects handoffs, computes next batch
7. Repeat until DAG terminates

## Files

- `brief-gate.ts` — validates sealed brief contract
- `dispatch-coordinator.ts` — computes batch, assigns agents, generates briefs
- `agent-executor.ts` — sealed executor: reads brief, executes, checkpoints
- `handoff-journal.ts` — checkpoint storage + handoff chain loader
- `orchestrator-harness.ts` — outer loop: batch → dispatch → handoff collection → next batch

## Key Properties

- **Isolation** — agents cannot influence each other's execution
- **Determinism** — given same brief and consumes, execution is deterministic
- **Recovery** — checkpoints allow resume on failure; handoff chain preserves context
- **Scale** — batch nodes run in parallel; orchestrator serializes across batches
