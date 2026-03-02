# Roadmap Persistence Enforcement Strategy

## Problem Statement

The "orient-then-forget" gap: developers may update the prospective roadmap (via orient, show, evaluate) without committing head.json, losing work on context clear.

**Observed risk:** LOW (0% in 24h window)
**Theoretical risk:** 5-10% of sessions may lose edits
**Current mitigation:** Atomic commits per node + explicit roadmap protocol

## Enforcement Layers

### Layer 1: Pre-Context-Clear Checkpoint
Add warning hook on session termination:
```bash
# Before context ends, check for uncommitted head.json changes
if git diff --quiet .roadmap/head.json; then
  # OK, no changes
else
  echo "⚠️ WARNING: Uncommitted roadmap changes. Commit or discard?"
  # Offer: git add .roadmap/head.json OR git checkout .roadmap/head.json
fi
```

### Layer 2: Atomic DAG Operations
Ensure roadmap mutations only happen via commit:
- `roadmap complete <node>` → updates head.json → commit atomically
- `roadmap expand` → generates DAG → commit atomically
- No in-memory prospective DAG without checkpoint

### Layer 3: Git Hook Enforcement
```bash
# .git/hooks/post-commit: verify head.json is in sync with completion records
git hook: if .roadmap/completed.json was updated, head.json must also be updated
```

### Layer 4: Session Drift Detection
On `roadmap orient`:
```bash
# After orient, store {headSha, completedSha, timestamp}
# On next orient in new session: if headSha diverged from committed, warn
```

## Implementation Checklist

- [ ] Add pre-exit hook to warn on uncommitted head.json
- [ ] Add post-commit hook to verify head.json/completed.json sync
- [ ] Add drift detector to orient (warn if session state diverged from committed)
- [ ] Document in CLAUDE.md: "Always commit head.json after DAG changes"
- [ ] Add to CI/CD: enforce that DAG changes are committed (not just edited)

## Recommendations

**Short-term (P0):**
- Add pre-exit warning hook
- Document in roadmap protocol: "Commit head.json changes immediately"

**Medium-term (P1):**
- Implement post-commit hook to verify consistency
- Add drift detection to orient

**Long-term (P2):**
- Consider automatic DAG snapshots (periodic backups of head.json)
- Implement time-travel recovery (restore from git history if lost)
