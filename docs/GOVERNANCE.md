# Roadmap Governance Hardening

This document explains the governance improvements added to the roadmap system: auto-propagate, pre-commit gates, and main branch protection.

## Quick Start for Developers

### 1. Install the Pre-Commit Hook (First Time Only)

```bash
./scripts/setup-hooks.sh
```

This configures git to run validation gates before every commit.

### 2. Commit as Usual

```bash
git add <files>
git commit -m "your message"
```

The pre-commit hook will run:
- TypeScript compilation check (`npm run check`)
- DAG structural validation (`npm run check:dag:define`)

If either gate fails, the commit is rejected. Fix the errors and try again.

### 3. Emergency Override

If you absolutely must bypass the hook (governance exception):

```bash
git commit --no-verify -m "your message"
```

⚠️ **Warning**: This bypasses governance enforcement. Use only for emergencies and document in the commit message why.

---

## What Each Gate Does

### Pre-Commit Hook: `scripts/hooks/pre-commit`

Runs **locally** on every `git commit` before pushing to CI.

| Gate | Purpose | Command |
|------|---------|---------|
| TypeScript | Catch type errors, missing exports, invalid references | `npm run check` (tsc) |
| DAG Integrity | Catch missing nodes, cycles, disconnected components | `npm run check:dag:define` |

**Why pre-commit?**
- **Fail fast**: Developers see errors immediately (5s, not 60s in CI)
- **Save CI time**: No broken code pushed
- **Cheap feedback loop**: Errors are caught before pushing

**What it doesn't check** (those run in CI):
- Full test suite (too slow for pre-commit)
- Integration tests
- Spec conformance

---

## Auto-Propagate: Always-On Validation Derivation

When you expand a plan node or merge DAGs, validation rules are **automatically derived** from downstream nodes.

### Example: DAG Expansion

**Before (manual propagate):**
```bash
roadmap expand scripts/expand-*.ts --note "reason"
# Developer must remember:
roadmap propagate
# Otherwise: DAG has incomplete validation
```

**After (auto-propagate):**
```bash
roadmap expand scripts/expand-*.ts --note "reason"
# Automatically runs propagation
# Fully-validated DAG is ready for review
```

### What Auto-Propagate Does

1. **Expands** the plan node into child execute nodes
2. **Automatically propagates** validation rules backward
3. **Back-derives** `artifact-exists` rules from terminal nodes to producers
4. **Re-validates** to ensure propagation didn't introduce errors
5. **Presents** the fully-validated DAG for review

### Example: Back-Derivation

```
Terminal node: dispatch-system-tests
├─ validate: [{ type: 'shell', cmd: 'npx vitest run tests/dispatch-system' }]
└─ This test needs: src/lib/agent-dispatch/index.ts to exist

Auto-propagate traces backward:
└─ Finds: dispatch-coordinator-impl produces src/lib/agent-dispatch/index.ts
└─ Adds: artifact-exists rule to dispatch-coordinator-impl
└─ Result: DAG is fully validated without manual bookkeeping
```

---

## Main Branch Protection

Main branch has **enforcement rules** that prevent merging until:

1. ✅ **All CI gates pass** (typecheck, DAG verify, tests, ledger)
2. ✅ **1 PR review** (human gate)
3. ✅ **Promotion ledger** (governance evidence artifact)
4. ❌ **No force push** (history is immutable)
5. ❌ **No direct push** (must go through PR)

**Rationale:**
- Protects main branch from broken code
- Ensures human review happens
- Maintains audit trail (all commits are recorded)
- Prevents accidental deletion

---

## Governance Checklist

Before pushing to main, ensure:

- [ ] Pre-commit hook passes locally (`git commit` succeeds)
- [ ] CI passes on your PR (all green checks)
- [ ] Promotion ledger is generated (artifact uploaded)
- [ ] At least 1 approval from another developer
- [ ] No force push to main (branch protection prevents this)

---

## Troubleshooting

### Pre-Commit Hook Keeps Failing

**Symptom:** `git commit` fails with TypeScript errors

**Solution:**
```bash
npm run check  # See which errors
# Fix them
npm run check  # Verify fixed
git add <fixed-files>
git commit
```

### Pre-Commit Hook Not Running

**Symptom:** Hook not firing even though file changed

**Solution:**
```bash
# Reinstall hooks
./scripts/setup-hooks.sh

# Verify git config
git config core.hooksPath
# Should print: scripts/hooks
```

### Need to Bypass Hook (Emergency)

**For governance exceptions only:**
```bash
git commit --no-verify -m "emergency: reason why safety was disabled"
```

Document in commit message why the override was necessary.

### DAG Validation Fails Before Merge

**Symptom:** `CI/dag-verify` gate fails on PR

**Solution:**
1. Check the error: `npm run check:dag:define`
2. Fix the DAG issue locally
3. Commit and push
4. CI will re-run

---

## Architecture

```
Commit Flow
└─ Pre-Commit Hook (local, ~5s)
   ├─ TypeScript check (tsc --noEmit)
   └─ DAG integrity check (check:dag:define)
      ├─ If fail: commit blocked, developer fixes locally
      └─ If pass: commit succeeds, code pushed

Push to PR
└─ GitHub CI (parallel, ~60s)
   ├─ Typecheck
   ├─ DAG verify
   ├─ Tests
   ├─ Plan gate
   ├─ Spec origin gate
   ├─ Promotion ledger generation
   └─ Surface guard

Merge to Main
└─ Branch Protection Rules
   ├─ All CI checks must pass
   ├─ 1 approval required
   ├─ Promotion ledger artifact must exist
   ├─ No force push allowed
   └─ No deletion allowed
```

---

## For Maintainers: Applying Branch Protection

To enable branch protection on main (requires GitHub permissions):

**Option 1: GitHub UI**
1. Go to repo > Settings > Branches
2. Click "Add Rule"
3. Apply the rules from `governance/branch-protection.json`

**Option 2: GitHub CLI**
```bash
# (Requires gh CLI and admin permissions)
gh repo edit --enable-required-status-checks --required-status-checks-strict
```

---

## FAQ

**Q: Can I commit without the pre-commit hook?**
A: Yes, with `git commit --no-verify`, but this is a governance override and should be rare.

**Q: What if I need to push a quick fix to main?**
A: Still must go through PR. Create a PR, wait for CI, get 1 approval. Branch protection prevents direct push.

**Q: Does auto-propagate change my expanded DAG?**
A: Yes, it adds validation rules. You see the changes before accepting. If unexpected, you can reject and investigate.

**Q: Can I revert a merge to main?**
A: Yes, via normal git revert (creates a new commit). Force push is blocked by branch protection.

**Q: What if CI has a false positive?**
A: A maintainer can temporarily disable that check via GitHub, then re-enable it. Document why in the PR comment.

---

## Related Documentation

- `GOVERNANCE-DESIGN.md` — Architecture and design decisions
- `governance/branch-protection.json` — Exact branch protection rules
- `.github/workflows/ci.yml` — CI gate definitions
- `scripts/hooks/pre-commit` — Hook script source

