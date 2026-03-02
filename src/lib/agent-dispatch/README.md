# agent-dispatch

Sealed brief orchestration for parallel roadmap execution.

## Concept
Agents receive ONLY what they need to execute:
- position: the nodeId
- produces: files to create
- consumes: files to read
- description: what to build
- pattern: how to build
- **NO access to full DAG**

## Modules
- dispatch-coordinator: compute batch + assign agents + validate briefs
- agent-executor: execute sealed brief → implement → handoff
- brief-gate: contract validation before dispatch
- handoff-journal: interim checkpoints + final handoffs + chain for next agent
- orchestrator: read dispatch plan + spawn sealed agents

## Workflow
```
Orchestrator: compute dispatch (batch → sealed briefs)
  ↓
Sealed Executor 1 ← Brief 1 (no DAG)
Sealed Executor 2 ← Brief 2 (no DAG)
  ↓
Each agent: read brief → execute → checkpoint → handoff
  ↓
Handoff journal: collect progress + decisions
  ↓
Advance batch → next agents receive prior handoffs
```

## Files
- `.dispatch/plan.json`: orchestrator's dispatch assignments (nodeId → brief)
- `.dispatch/{nodeId}/interim-N.json`: progress checkpoints (25%, 50%, 75%)
- `.dispatch/{nodeId}/handoff.json`: final summary + decisions + blockers for next agent
