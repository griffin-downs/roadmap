# Agent Execution Manifest

**Checklist and precondition validation for sealed agent spawning.**

---

## Pre-Spawn Validation

### Brief Schema
- [ ] `nodeId`: valid, matches head.json
- [ ] `produces`: non-empty array of valid paths
- [ ] `consumes`: paths point to predecessors' produces
- [ ] `description`: non-empty string
- [ ] `pattern`: one of [serial, parallel, map-reduce]
- [ ] `handoffs`: empty initially (filled on completion)
- [ ] **No DAG keys present** (define, nodes, init, term, verify, etc.)

### Execution Environment
- [ ] Agent has isolated process (not sharing parent context)
- [ ] Produces paths are writable (git checkout ready)
- [ ] No concurrent claims on same node (checked in claim store)
- [ ] Git SHA is recorded (for completion record)

### Dependencies
- [ ] All consumes artifacts exist (checked via completion records)
- [ ] All dep nodes are completed (checked in completion store)
- [ ] No retired nodes in position (checked in retirement registry)

---

## During Execution

### Agent Responsibilities
- [ ] Read brief (only)
- [ ] Understand task: nodeId + description + produces/consumes
- [ ] Execute work (isolated from other agents)
- [ ] Write produces to exact paths
- [ ] Prepare handoff: { summary, key_decisions, gotchas, timestamp }
- [ ] Signal completion (via roadmap complete or direct API)

### Isolation Guarantees
- [ ] Agent cannot call roadmap CLI (no DAG mutation)
- [ ] Agent cannot read .roadmap/head.json or completed.json
- [ ] Agent cannot spawn other agents (orchestrator only)
- [ ] Agent cannot inspect sibling nodes' work

---

## Post-Execution Validation

### Artifacts Check
- [ ] All produces paths exist
- [ ] All produces are readable and non-empty
- [ ] No unexpected files created outside produces
- [ ] No produces overwrite consumed inputs

### Completion Record
- [ ] gitSha is valid 40-char hex
- [ ] treeSha is valid 40-char hex
- [ ] checkpointId matches pattern cp-{14 digits}
- [ ] completedAt is valid ISO timestamp
- [ ] validationChecks is non-empty array
- [ ] All validation checks pass

### Validation Rules
- [ ] `artifact-exists`: all produces exist
- [ ] `shell`: command exits 0 (if configured)
- [ ] `spec-conformance`: acceptance scenario passes
- [ ] `artifact-schema`: produces match declared schema (if configured)
- [ ] All preconditions of validators satisfied

---

## Failure Modes & Recovery

| Failure | Trigger | Recovery |
|---------|---------|----------|
| Brief schema invalid | `brief-validator.ts` rejects | Reject spawn, log schema error |
| Produces missing | `artifact-exists` fails | Reject completion, re-run agent |
| Validation fails | Any rule fails | Reject completion, diagnose + retry |
| Handoff missing | Agent doesn't call complete() | Timeout, manual intervention |
| Concurrency conflict | Two agents claim same node | First wins, second blocked |

---

## Metrics Collection (Hooks)

### @pre-agent
```json
{
  "event": "agent_spawn",
  "timestamp": "ISO8601",
  "agentId": "uuid",
  "nodeId": "node-name",
  "briefSize": 1250,
  "briefSchema": "valid",
  "depsCompleted": 3,
  "expectedProduces": 2
}
```

### @post-agent
```json
{
  "event": "agent_complete",
  "timestamp": "ISO8601",
  "agentId": "uuid",
  "nodeId": "node-name",
  "exitCode": 0,
  "executionTimeMs": 3200,
  "tokensUsed": 4850,
  "toolCallsCount": 5,
  "validationResults": [
    {"rule": "artifact-exists", "passed": true},
    {"rule": "shell", "passed": true}
  ],
  "handoffSize": 2100
}
```

---

## Next Session Checklist

When resuming work on a DAG:

- [ ] Run `roadmap orient` (establishes position from filesystem)
- [ ] Check `roadmap chart` (visualize progress)
- [ ] Verify no uncommitted head.json changes (git status)
- [ ] Check for incomplete agents (abandoned worktrees)
- [ ] Validate completion records are in sync with artifacts
- [ ] Resume at current batch position (don't skip ahead)

---

## Enforcement Points

| Point | Enforcer | Action |
|-------|----------|--------|
| Brief schema | `brief-validator.ts` | Reject invalid briefs before spawn |
| Artifact existence | `artifact-exists` rule | Reject completion if files missing |
| Completion sync | `completion-enforcer.ts` | Warn if record diverges from files |
| Retirement | `assertRetirementConsistency()` | Block retired nodes from position |
| Git state | Pre-exit hook | Warn on uncommitted head.json |

---

## Success Criteria for Agent Execution

✅ Agent completes
✅ All produces exist
✅ All validations pass
✅ Completion record written atomically
✅ Handoff available for next agent
✅ No artifacts left behind outside produces
✅ No side effects on other nodes
