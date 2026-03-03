# Agent Workflow

Zero-git-management task execution for LLM agents.

## Lifecycle

```
claim --> work --> complete --> (next task)
```

### 1. Claim

```bash
roadmap agent claim <task-id> --agent-id <id>
```

Output:
```json
{
  "claimed": true,
  "taskId": "implement-auth",
  "agentId": "agent-1",
  "worktree": ".claude/worktrees/implement-auth",
  "branch": "feat/agent-a1b2c3d4/implement-auth",
  "cwd": "/absolute/path/to/worktree",
  "produces": ["src/auth.ts", "src/auth.test.ts"],
  "consumes": ["src/types.ts"],
  "claimExpiry": "2026-03-03T04:00:00Z"
}
```

What happens:
- Claim token written (4h TTL, conflict-checked)
- Git worktree created at `.claude/worktrees/<task-id>`
- Feature branch `feat/agent-<uuid>/<task-id>` from HEAD
- Brief JSON written into worktree for agent reference

### 2. Work

Agent works inside the worktree. Rules:
- Edit only files listed in `produces`
- Read only files listed in `consumes`
- Commit message format: `<task-id>: <what was produced>`
- No DAG edits (pre-commit hook blocks head.json changes)

### 3. Complete

```bash
roadmap agent complete <task-id> --message "implemented auth module"
```

What happens:
1. Verify all `produces` artifacts exist in worktree
2. `git add <produces>` + `git commit -m "<task-id>: <message>"`
3. `git push origin <branch>`
4. Remove worktree + delete local branch
5. Release claim token
6. Trail entry logged

Output:
```json
{
  "completed": true,
  "taskId": "implement-auth",
  "commit": "abc1234",
  "branch": "feat/agent-a1b2c3d4/implement-auth",
  "pushed": true,
  "cleaned": true
}
```

### 4. Status

```bash
roadmap agent status
```

Lists all active agent worktrees with their task IDs, branches, agents.

### 5. Cleanup (manual)

```bash
roadmap agent cleanup <task-id>
```

Force-removes worktree + branch + claim. Use when agent crashed mid-task.

## Post-Push Mirror Sync

When the development clone pushes to origin, the post-push hook:

1. Pulls origin/main into production clone (fast-forward only)
2. Verifies SHA match between clones
3. Validates gitsafe enforcement.json
4. Logs result to `.roadmap/mirror-sync-log.jsonl`

Install: `cp scripts/hooks/post-push ~/src/.dev/roadmap/.git/hooks/post-push`

## Isolation Guarantees

| Concern | How it's handled |
|---------|-----------------|
| Branch conflicts | Each agent gets unique branch: `feat/agent-<uuid>/<task>` |
| File conflicts | `produces` scoping — agents only touch their artifacts |
| DAG corruption | Pre-commit hook blocks head.json edits on non-feat branches |
| Stale claims | 4h TTL, auto-expires, `agent cleanup` for manual override |
| Mirror drift | Post-push hook auto-syncs production after dev push |
| Orphan worktrees | `agent status` lists all, `agent cleanup` removes stale |

## Agent Decision Tree

```
"I need to work on a task"
  --> roadmap agent claim <task-id>

"I finished my task"
  --> roadmap agent complete <task-id> --message "what I did"

"My task is stuck / I crashed"
  --> roadmap agent cleanup <task-id>
  --> roadmap agent claim <task-id>  (re-claim)

"What tasks are in progress?"
  --> roadmap agent status

"Where am I? Can I push from here?"
  --> roadmap topology where
  --> roadmap topology enforce --op push
```

## Full Swarm Pattern

```bash
# Orchestrator
roadmap orient --note "dispatch batch"
BATCH=$(roadmap orient --note "get batch" | jq -r '.data.position[]')

for TASK in $BATCH; do
  # Each agent (in parallel)
  roadmap agent claim "$TASK" --agent-id "agent-$TASK"
  cd .claude/worktrees/$TASK
  # ... do work ...
  roadmap agent complete "$TASK" --message "done"
done

roadmap advance --note "batch complete"
```
