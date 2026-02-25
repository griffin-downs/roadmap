# git-state.json: Pre-computed git state for O(1) agent orientation

## Problem

Current `orient()` execution for large repos:
```
$ time node orient-demo.ts
git status                ~100ms
git log --oneline -1      ~50ms
git diff HEAD^...HEAD     ~100ms
git show <hash>:file.ts   ~100ms (per file)
TOTAL: 350ms–500ms (or 1–2s on large histories)
```

For agents spawning per node (potentially 10–100 times per roadmap execution):
- At 5 spawns × 500ms = 2.5s wasted on every execution
- Blocks autonomous agent scaling

## Solution: Pre-computed cache

Write `.regent/git-state.json` at POST-COMMIT time. Agent reads once at boot.

Cost model:
- Commit happens anyway: +0ms (subsumed in git cost)
- Agent orientation: 5ms (file read) vs 500ms (git ops)
- **90% latency reduction**

## Schema design (git-state.schema.ts)

Key fields:

| Field | Purpose | Who sets it |
|-------|---------|------------|
| `timestamp` | Cache freshness check | post-commit hook |
| `branch` | Parallel development tracking | post-commit hook |
| `head.{hash, subject, phase, checkpoint}` | Current commit position + roadmap context | post-commit hook (phase field set by agent) |
| `clean` | Is working tree dirty? | post-commit hook |
| `dirty[]` | Which files, in which phase? | post-commit hook (phase field set by agent via heuristics) |
| `roadmapPosition` | Current orient() position | Agent sets after first orient() |
| `dirtyCommits` | How many commits since checkpoint? | post-commit hook |

### Key insight: phase annotation

The `phase` field on each dirty file answers: "What roadmap work is this file for?"

Example:
```json
{
  "dirty": [
    {"status": "M", "path": "src/git-state.schema.ts", "phase": "git-state-spec", "note": "WIP schema"},
    {"status": "M", "path": "package.json", "phase": null, "note": "dependencies?"}
  ]
}
```

Agent reads this and IMMEDIATELY knows:
- One file belongs to `git-state-spec` node
- One file has unknown phase (needs investigation)
- Can skip the "what is this work for?" question

**Phase annotation strategy**:
1. Post-commit hook computes phase heuristically from git diff context (which files changed in predecessor commits)
2. Agent can override with `.git/config user.phase` if needed
3. Falls back to null if uncertain

## Freshness strategy

Post-commit hook writes cache immediately after commit. Agent checks `isFresh()` at boot:
- If <10s old: use cache (high confidence)
- If >10s old: fall back to live `git status` (user may have made uncommitted changes)
- If doesn't exist: compute synchronously (first boot, or pre-commit state)

This keeps agents fast while respecting "uncommitted work exists" scenarios.

## Integration points

### Post-commit hook
- Runs after every commit
- Computes git state, maps dirty files to roadmap nodes
- Writes `.regent/git-state.json`
- Runs in <50ms (subsumed in git cost)

### orient() function (protocol.ts)
- NEW: Try to read `.regent/git-state.json` (if <10s old)
- NEW: If cache exists, skip `git status` and file probing
- FALLBACK: If cache missing/stale, run live git ops (backward compatible)
- Returns same `OrientResult` as before (agents don't care about cache)

### Agent bootstrap
- Call `readGitState()` at boot
- Check `roadmapPosition` (if set by previous session)
- If stale: call `orient()` (which checks freshness internally)
- If fresh: jump directly to next work

## Testing strategy

Adversarial tests (git-state-caching.test.ts):

| Scenario | Test | Expectation |
|----------|------|------------|
| Cache hit (fresh) | Write state, read immediately | No git ops, returns cached value |
| Cache miss (deleted) | Read without cache | Falls back to live git status |
| Cache stale (>10s old) | Modify repo, wait, read | Triggers fresh compute |
| Phase annotation | Commit to 'git-state-impl' node | Dirty files tagged with phase |
| Parallel session | Two agents read cache simultaneously | Both get same state |
| Dirty files | Modify file after commit | Cache still valid, agent detects new dirty |

## Deployment

1. Write `.regent/git-state.json` at post-commit time
2. Agent checks cache on boot
3. No user action required
4. Backward compatible: live git ops still work if cache missing

## Next: implement hooks and orient() integration

See git-state-impl, git-state-orient nodes in roadmap.ts.
