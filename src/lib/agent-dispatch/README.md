# agent-dispatch

Sealed brief orchestration for parallel roadmap execution.

## Sealed brief model

Each agent receives only its contract:
- **position**: nodeId to execute
- **produces**: files to create
- **consumes**: files available from predecessors
- **description**: what to build
- **pattern**: how to build

No DAG introspection. No access to other nodes.

## Modules

| Module | Responsibility |
|--------|---------------|
| dispatch-coordinator | Compute batch + assign agents |
| agent-executor | Execute sealed brief, produce handoff |
| brief-gate | Validate contract before/after execution |
| handoff-journal | Track progress + decisions across agents |

## Runtime files

- `.dispatch/plan.json` — orchestrator's dispatch assignments
- `.dispatch/{nodeId}/interim-N.json` — progress checkpoints
- `.dispatch/{nodeId}/handoff.json` — final decisions + blockers
