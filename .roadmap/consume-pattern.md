# Roadmap Consumption Pattern

## Two-Clone Architecture

### Production Clone
**Location:** `/home/griffin/src/roadmap`

- **Main branch:** Locked, enforced, canonical
- **Gate 0:** Blocks all direct commits
- **gitsafe:** Enforces reads from main only
- **State:** Clean, minimal (421 files, 13 root entries)
- **Role:** Source of truth for all dependent repos

### Development Clone
**Location:** `~/src/.dev/roadmap`

- **All branches:** Feature branches, experiments, safe
- **Changes:** Isolated to this clone until PR'd to production
- **Role:** Active development environment
- **Sync:** `git fetch origin && git rebase origin/main`

### Consumer Repos
**Location:** `~/src/other-repo-a`, `~/src/other-repo-b`, etc.

- **Import:** From `/home/griffin/src/roadmap` only (via gitsafe)
- **Branch:** Always `main` (production)
- **gitsafe:** Blocks reads from `~/.dev/roadmap` (dev clone isolated)
- **Pattern:** `import { roadmap } from '../roadmap/src/protocol'`

## Workflow

### Develop a Feature
```bash
cd ~/src/.dev/roadmap
git checkout -b feat/new-feature
# ... make changes ...
git add . && git commit -m "feat: description"
```

### Merge to Production
```bash
# In dev clone
git push origin feat/new-feature

# On GitHub: Create PR, review, approve
# PR triggers gates (TypeScript, DAG integrity, enforce)
# Once approved, merge (Gate 0 allows merges from feat/*)

# Back in dev clone
git fetch origin
git checkout main && git rebase origin/main
```

### Consume in Other Repos
```bash
# In consumer repo (~/src/other-repo-a)
import { roadmap } from '../roadmap/src/protocol'
// gitsafe validates: reads from /home/griffin/src/roadmap#main ✓
```

## Enforcement

### gitsafe Denylist
- Blocks: `~/.dev/roadmap/**` (dev clone)
- Allows: `/home/griffin/src/roadmap/**` (production only)
- Prevents: Accidental imports from dev branches

### Pre-commit Gates
- Gate 0: Main is locked (merges allowed)
- Gate 1: DAG edits confined to feat/* branches
- Gate 2: gitsafe denylist compliance
- Gate 3: TypeScript compilation
- Gate 4: DAG structural integrity

### Branch Protection
- `main`: Immutable, PR-only
- `feat/*`: Unprotected, allows force pushes
- `enceinte`: Immutable snapshot (full pre-shake codebase)

## Safety Guarantees

1. **Production stability:** Changes never land on main without gates passing
2. **Isolation:** Dev work in `~/.dev/roadmap` doesn't affect `/home/griffin/src/roadmap`
3. **Consumer safety:** Other repos can only import from production main
4. **Auditability:** All merges recorded, gates logged to `enforcement-trail.jsonl`

## Recovery

If production clone corrupts:
```bash
rm -rf /home/griffin/src/roadmap
cd /home/griffin/src && git clone origin/roadmap roadmap
cd roadmap && git checkout main
# (Requires access to origin — GitHub, GitLab, etc.)
```

If dev clone corrupts:
```bash
rm -rf ~/src/.dev/roadmap
cd ~/src/.dev && git clone /home/griffin/src/roadmap roadmap
# Continue development on recovered clone
```
