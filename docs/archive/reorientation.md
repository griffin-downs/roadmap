# Reorientation — Tracking Progress Through Phases

After completing work, find your new position.

## The Pattern

**Before work:**
```bash
roadmap orient --note "starting build phase"
# position: build
```

**Do work:**
- Write code
- Run tests
- Commit artifacts

**After work:**
```bash
roadmap orient --note "build complete, moving to test"
# position: test
```

## Why Not Just Remember?

Because:
- ✗ Memory is unreliable (which artifacts actually exist?)
- ✗ Parallel work (multiple agents might work simultaneously)
- ✗ Recovery (restart might have restored from checkpoint)
- ✓ Filesystem never lies — orient re-checks

## Example: Multi-Phase Session

```
10:00 AM: Session starts
  roadmap orient --note "session start — v1.1 release"
  position: bootstrap

11:00 AM: Compiled
  roadmap orient --note "compile done"
  position: build

12:00 PM: Tests pass
  roadmap orient --note "tests complete"
  position: test

1:00 PM: Release ready
  roadmap orient --note "ready for release"
  position: release
```

## In Regent-Coordinated Agents

Agents report progress:
1. Read brief (current node)
2. Do work
3. Checkpoint (save artifacts)
4. Agent 1 finishes → reports to regent
5. Regent orients both DAGs (local + any cross-repo dependencies)
6. Regent spawns Agent 2

```
Agent 1: build
  → produces dist/
  → checkpoints
  → reports to regent

Regent orients:
  position now: test
  Agent 2 can start

Agent 2: test
  → consumes dist/
  → ...
```

## Checkpoint-Restore Pattern

```bash
# Before major work
roadmap checkpoint --label "before-big-change"

# Do work...
# Fails? Revert:
roadmap restore --label "before-big-change"

# Reorient (position recalculated)
roadmap orient --note "restored from checkpoint"
```

## See Also

- `checkpoint.schema.ts` — Milestone structure
- `audit.ts` — Trail of all orientations
- `recovery.ts` — Checkpoint + restore logic
