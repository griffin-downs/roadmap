# Agent Workflow

Pure integration via task system. No CLI commands.

## Lifecycle

```
TaskList --> TaskUpdate owner --> (worktree auto-created) --> work --> push --> TaskUpdate completed --> (worktree auto-cleaned)
```

### 1. Find Work

```
TaskList -> find task with status=pending, no owner, empty blockedBy
```

### 2. Claim (TaskUpdate)

```
TaskUpdate { taskId, owner: agent-id }
```

Integration layer (`onTaskOwnerSet`) auto-triggers:
- Git worktree created at `.claude/worktrees/<task-id>`
- Feature branch `feat/agent-<uuid>/<task-id>` from HEAD
- Brief JSON loaded from DAG (produces, consumes, description)

### 3. Work

Agent works inside the worktree. Rules:
- Edit only files listed in `produces`
- Read only files listed in `consumes`
- Commit message format: `<task-id>: <what was produced>`
- Pre-commit hook (husky) blocks head.json edits on non-feat branches

### 4. Push

```bash
git push origin feat/agent-<uuid>/<task-id>
```

Post-push hook auto-syncs production mirror (FF-only pull + SHA verify + gitsafe check).

### 5. Complete (TaskUpdate)

```
TaskUpdate { taskId, status: completed }
```

Integration layer (`onTaskCompleted`) auto-triggers:
- Verify all `produces` artifacts exist
- Remove worktree + delete local branch

## Post-Push Mirror Sync

Husky hook at `.husky/post-push`:
1. Pulls origin/main into production clone (FF-only)
2. Verifies SHA match between clones
3. Validates gitsafe enforcement.json
4. Logs to `.roadmap/mirror-sync-log.jsonl`

## Hooks (husky)

| Hook | Location | Purpose |
|------|----------|---------|
| pre-commit | `.husky/pre-commit` | 5 gates: branch guard, head.json discipline, gitsafe denylist, tsc, DAG integrity |
| commit-msg | `.husky/commit-msg` | Enforce node attribution in commit messages |
| post-commit | `.husky/post-commit` | Record git state for recovery |
| prepare-commit-msg | `.husky/prepare-commit-msg` | Auto-populate batch position |
| post-push | `.husky/post-push` | Mirror sync after push |

## Isolation Guarantees

| Concern | How it's handled |
|---------|-----------------|
| Branch conflicts | Each agent gets unique branch: `feat/agent-<uuid>/<task>` |
| File conflicts | `produces` scoping -- agents only touch their artifacts |
| DAG corruption | Husky pre-commit blocks head.json edits on non-feat branches |
| Mirror drift | Post-push hook auto-syncs production after dev push |

## Infrastructure

| File | Purpose |
|------|---------|
| `src/lib/agent-dispatch/task-worktree.ts` | onTaskOwnerSet / onTaskCompleted hooks |
| `src/lib/agent-dispatch/orchestrator.ts` | Batch execution coordinator |
| `src/lib/agent-dispatch/agent-executor.ts` | Sealed executor (consumes/produces boundaries) |
| `src/lib/agent-dispatch/brief-gate.ts` | Brief validation (DAG leakage detection) |
| `src/lib/brief.ts` | Sealed agent brief (position, produces, consumes) |
| `src/lib/handoff.ts` | Checkpoint + advance (progress tracking) |
| `src/index.agent.ts` | Agent entry point (sealed API surface) |
| `.husky/pre-commit` | Branch discipline + gitsafe + tsc + DAG gates |
| `.husky/post-push` | Mirror sync after push |
