# Main Branch Immutability Contract

## Rule

`main` is **read-only**. No direct commits. No force pushes. No exceptions.

All changes reach `main` through:

```
feature branch -> CI gates -> pull request -> squash merge
```

## Why

1. **Reproducibility.** Every state of `main` is a reviewed, gated checkpoint. `git bisect` works. Rollback is trivial.
2. **DAG integrity.** `.roadmap/head.json` mutations on `main` bypass validation. The pre-commit hook blocks this, but the branch contract eliminates the vector entirely.
3. **Audit trail.** PR metadata (reviewer, checks, discussion) is the audit log. Direct commits have none.
4. **Coordination.** Multiple agents and humans work concurrently. Merging to `main` without review creates silent conflicts.

## Enforcement Layers

| Layer | Mechanism | Scope |
|-------|-----------|-------|
| Local | `scripts/hooks/pre-commit` | Blocks commits on `main`/`master` |
| Local | `scripts/hooks/pre-commit` | Blocks `head*.json` edits except on `feat/*`, `wip/*`, `develop` |
| Local | `scripts/hooks/pre-commit` | Gitsafe denylist (`.env`, `node_modules/`, `dist/`) |
| Remote | `.github/branch-protections.yml` | Require PR review, status checks, linear history |
| Remote | GitHub branch protection | `enforce_admins: true` — no bypass even for owners |

## Workflow

### Start work

```bash
git checkout main
git pull
git checkout -b feat/my-change
```

### Commit and push

```bash
git add <files>
git commit -m "feat/my-change: what was done"
git push -u origin feat/my-change
```

### Open PR

```bash
gh pr create --base main --title "my-change" --body "description"
```

### After merge

Branch auto-deletes (branch protection rule). Pull latest main:

```bash
git checkout main
git pull
```

### Roadmap-governed work

```bash
roadmap spawn --task <node-id>         # Creates worktree + feat/<node-id> branch
# ... work in worktree ...
git add <produces>
git commit -m "<node-id>: what"
roadmap complete <node-id>             # Validates, advances DAG
# PR from feat/<node-id> -> main
```

## Overrides

None. The `--no-verify` flag bypasses the local hook but does not bypass GitHub branch protection. The remote layer is the final gate.

If you believe main needs a direct commit, the answer is: it does not. Create a hotfix branch instead.
