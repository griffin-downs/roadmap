# Next Context Entry Point

**Date:** 2026-03-03
**Status:** Ready for parallel execution
**Tasks Created:** 6 (3 Phase 1 + 2 Phase 2 + 1 Phase 3)

## Quick Start

### 1. Read Agent Guide
```
.claude/CLAUDE.md → AGENT_GUIDE section
```
This orients you on system architecture, gaps, and existing resources.

### 2. Check Task List
```bash
# See all tasks
TaskList  # Shows pending tasks

# Or view specific task
TaskGet <task-id>
```

## Current State

**DAG:** `self-compounding-001` (consolidated with hardening-001)

**Phase 0:** ✅ COMPLETE
- CLAUDE.md enriched with AGENT_GUIDE

**Phase 1:** 🔥 READY (3 parallel independent tasks)
- Task #1: integrate-checkpoint-manager (2-3 days)
- Task #2: extract-metrics-from-trail (1-2 days)
- Task #3: extend-gitsafe-multirepo (1-2 days)

**Phase 2:** ⏳ READY (2 sequential after Phase 1)
- Task #4: implement-spec-conformance-validator (3-4 days)
- Task #5: integrate-llm-feedback-loop (2 days)

**Phase 3:** ⏳ READY (after Phase 2)
- Task #6: implement-distributed-dag (3-4 days)

## Execution Path

### Option A: Parallel (with discovery of gaps)
1. Spawn 3 agents on Phase 1 tasks (using worktrees + feat branches)
2. Let them work in isolation
3. Discover what breaks (no orchestrator, merge coordination, etc)
4. Those become next iteration improvements

### Option B: Sequential (safer, builds foundation)
1. Complete Phase 1 tasks one at a time
2. Merge each feature branch
3. Move to Phase 2
4. Parallel swarm infrastructure comes later

## Key Files

| File | Purpose |
|------|---------|
| `.roadmap/head.json` | DAG definition (25 nodes, 4 phases) |
| `.claude/CLAUDE.md` | Agent guide + system architecture |
| `BRANCH_INTENT_GAPS.txt` | Detailed gap analysis |
| `ROADMAP_TOPOLOGY.txt` | Branch history & what each built |
| `.roadmap/completed.json` | Completion tracker |
| `.roadmap/trail.jsonl` | Session invocation log |

## To Start Work

```bash
# Option 1: See current batch
./bin/roadmap orient --note "next context: ready for phase 1"

# Option 2: Spawn worktree for a task
./bin/roadmap spawn --task integrate-checkpoint-manager --agent

# Option 3: Claim a task directly
TaskUpdate <task-id> --status in_progress --owner <agent-name>
```

## What Roadmap Provides

- ✓ Isolated worktrees per task (no conflicts)
- ✓ Feature branches + merge consolidation
- ✓ Pre-commit gates (type checks, DAG validation)
- ✓ Trail recording (all work logged)
- ✓ Task coordination via task list

## What's Still Missing (discovered by doing)

- 🔴 Active orchestrator (monitor progress across agents)
- 🔴 Heartbeat/status sync (detect stalled agents)
- 🔴 Automatic merge (manual merge-batch currently)
- 🔴 Dependency resolution (Phase 2 waits for all Phase 1)

These gaps are the **next iteration** improvements to Layer 4.

## Next Context Checklist

- [ ] Read .claude/CLAUDE.md AGENT_GUIDE section
- [ ] Review task list (TaskList command)
- [ ] Decide: parallel or sequential?
- [ ] Claim Task #1, #2, #3 (or spawn agents)
- [ ] Execute Phase 1
- [ ] Commit results (feature branches auto-merge via DAG)
- [ ] Move to Phase 2

---

**Ready to go.** Everything is on the roadmap. Agents can self-orient from CLAUDE.md and claim work immediately.
