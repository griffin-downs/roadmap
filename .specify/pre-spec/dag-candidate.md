# dag-candidate — Non-destructive import/expand

## Problem

`roadmap import` and `roadmap expand` both overwrite `.roadmap/head.json` in-place. The only recovery path is git history. No preview, no diff, no staging — the mutation is the commit.

Consequences:
- No way to review structural changes before they take effect on position/batch
- Expansion scripts that produce invalid DAGs corrupt head.json (validation catches this post-write, but the file is already mutated)
- Plan overlay (`plan-overlay.json`) invalidates on headSha change — an import/expand silently kills any active overlay
- In swarm scenarios, a rogue expand on one branch can propagate head.json changes that conflict with in-flight workers

## Current state

### Import flow (bin/roadmap.ts:4046)
1. Parse tasks.md → `tasksToDAG()` → Graph
2. `define()`, `verify()`, `check()` — validate structure
3. `writeFileSync(outPath, dagJson)` — **direct overwrite** of `.roadmap/head.json`
4. Write receipt to `.roadmap/receipts/import-*.json`
5. Git add + commit happens outside (caller responsibility)

### Expand flow (bin/roadmap.ts:1093)
1. Execute expansion script via `execSync` — script mutates head.json directly
2. Snapshot after: reload head.json, diff node counts
3. `check()`, `verify()`, `validateTerminalIntentGate()`, `batchConflicts()` — validate post-mutation
4. `git add .roadmap/head.json && git commit` — auto-commit
5. If validation fails, head.json is already mutated (no rollback)

### Plan overlay pattern (src/lib/plan-overlay.ts)
- Separate file: `.roadmap/plan-overlay.json`
- Carries `headSha` — sha256 of head.json content at build time
- `isOverlayValid()` compares current headSha to stored — detects staleness
- **This is the staging pattern to mirror for candidates.**

## Desired state

### Candidate file
- `import` and `expand` write to `.roadmap/head.candidate.json` instead of `head.json`
- Candidate carries `baseSha` (headSha at generation time) for stale detection
- Candidate file is a full Graph JSON — same format as head.json, plus metadata envelope

### Diff
- `roadmap dag diff` reads head.json + head.candidate.json, produces structural diff:
  - Nodes added / removed / changed (deps, produces, consumes, validate, mode)
  - Batch level shifts (which nodes move to different levels)
  - New batch conflicts introduced
  - Overlay invalidation warning if plan-overlay.json exists

### Accept
- `roadmap dag accept` — atomic promotion:
  1. Validate candidate still fresh (baseSha matches current headSha)
  2. Copy candidate content → head.json
  3. Delete head.candidate.json
  4. Invalidate plan-overlay.json if present
  5. Write accept receipt to `.roadmap/receipts/dag-accept-*.json`
  6. Git add + commit (head.json, deleted candidate, receipt)

### Reject
- `roadmap dag reject` — clean abort:
  1. Delete head.candidate.json
  2. Write reject receipt (captures what was rejected and why)
  3. No head.json change

### Stale detection
- If head.json changes while candidate sits (another import, manual edit, expand):
  - `dag diff` warns: "candidate is stale — baseSha mismatch"
  - `dag accept` refuses: "candidate baseSha X does not match current headSha Y — re-import or --force"
  - `dag reject` always succeeds (cleaning up stale candidate is fine)

## Constraints

- Must stay git-native: candidate file is a regular file, not a git stash or branch
- Candidate must be auto-cleaned on accept/reject (no orphan files)
- Existing `import` and `expand` flags (--allow-drift, --allow-conflicts, --skip-terminal-intent, --skip-audit-tail) must work with candidate flow
- Plan overlay invalidation must happen on accept, not on candidate creation
- Receipt format must be consistent with existing `.roadmap/receipts/` convention
- Expansion scripts that currently mutate head.json directly need a migration path (env var or wrapper)
