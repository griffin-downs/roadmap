# Migration Playbook: Monolith → Châtelet Pack Structure

**Version**: 1.0
**Status**: Phase 5 (Châtelet Enrichment)
**Target audience**: Development teams migrating from monolith to Châtelet architecture

---

## Overview

Châtelet is a two-tier code organization pattern:

- **keep/** — Minimal core (CLI commands, foundational types, shared config)
- **packs/** — Discoverable modules on isolated branches (each pack is independent)

This playbook walks through migrating a monolith `src/` structure into Châtelet. The migration is **dry-run safe**, **idempotent**, and **fully reversible**.

### Time Estimate

- **Small project** (< 10k lines): 15 minutes
- **Medium project** (10k–50k lines): 30–45 minutes
- **Large project** (> 50k lines): 1–2 hours

### Prerequisites

- Git repository with clean working tree
- Latest `tool` CLI installed (`npm install -g roadmap`)
- Read access to repo (migrations are read-only until execute step)
- Backup of current state (git branch)

---

## Phase 1: Audit & Plan Generation

### Step 1.1: Understand Current Structure

List your current monolith modules:

```bash
cd /path/to/repo
ls -la src/
```

Expected output:
```
src/
├── lib/         (core utilities)
├── cli/         (CLI commands)
├── types/       (shared types)
└── utils/       (general utils)
```

Each top-level directory under `src/` becomes a **candidate pack**.

### Step 1.2: Generate Migration Plan (Dry-Run)

Run the plan generator in read-only mode:

```bash
tool chatelet migrate --plan-only --format json > MIGRATION_PLAN.json
```

Or for text output:

```bash
tool chatelet migrate --plan-only
```

**What this does:**
- Audits all `src/*/` modules
- Counts files and line-of-code
- Generates move operations (`src/X/Y.ts` → `packs/X/src/X/Y.ts`)
- Validates plan syntax and safety
- **Makes no changes to your repo**

**Output example** (JSON format):

```json
{
  "moves": [
    { "from": "src/lib/utils.ts", "to": "packs/utils/src/lib/utils.ts", "reason": "Migrate utils module" },
    { "from": "src/lib/types.ts", "to": "packs/lib/src/lib/types.ts", "reason": "Migrate lib module" },
    { "from": "src/cli/commands.ts", "to": "packs/cli/src/cli/commands.ts", "reason": "Migrate cli module" }
  ],
  "estimated_time": "45m",
  "safety": "dry-run-verified",
  "rollback": {
    "metadata": {
      "audit_timestamp": "2026-03-02T02:15:00.000Z",
      "module_count": 3,
      "file_count": 127,
      "line_count": 23400
    },
    "timestamp": "2026-03-02T02:15:10.000Z"
  }
}
```

### Step 1.3: Review the Plan

Examine the generated plan:

```bash
cat MIGRATION_PLAN.json | jq '.moves | length'
```

Expected checks:

| Check | Success | Failure |
|-------|---------|---------|
| **Moves count** | > 0 moves identified | 0 moves → empty monolith or config issue |
| **Line estimate** | Matches your count | Significantly off → check for large test files |
| **Safety status** | `"dry-run-verified"` | Any other value → plan has errors (see next section) |
| **Module split** | Logical modules detected | Suspicious groupings → may need manual adjustment |

### Step 1.4: Validate Plan Syntax

If `safety` status is not `"dry-run-verified"`, inspect validation errors:

```bash
tool chatelet migrate --plan-only --format json 2>&1 | grep -A5 "Migration plan validation failed"
```

Common errors and remediation:

| Error | Cause | Fix |
|-------|-------|-----|
| `PathTraversal: from: ".."` | Path traversal attempt | Check for `../` in `src/` structure (rare) |
| `DuplicateTarget: index 5 and 8` | Two files moving to same location | Verify no two modules have identical structures |
| `CircularDependency` | Circular file references | Check for circular imports; refactor before migration |
| `InvalidSyntax: 'from' must be non-empty` | Malformed plan | Likely a bug; file an issue |

---

## Phase 2: Understand the Target Structure

### Step 2.1: Review Châtelet Layout

After migration, your repo will have:

```
.
├── keep/
│   ├── CHATELET.json          (constraints + config)
│   ├── src/
│   │   └── cli/               (minimal CLI entry point)
│   └── tsconfig.json
├── packs/
│   ├── utils/
│   │   ├── PACK.json
│   │   ├── src/
│   │   │   └── lib/utils.ts
│   │   └── __tests__/
│   ├── lib/
│   │   ├── PACK.json
│   │   ├── src/
│   │   │   └── lib/types.ts
│   │   └── __tests__/
│   └── cli/
│       ├── PACK.json
│       ├── src/
│       │   └── cli/commands.ts
│       └── __tests__/
└── ...
```

Key differences:

| Aspect | Before (Monolith) | After (Châtelet) |
|--------|-------------------|------------------|
| **Layout** | `src/module/...` | `packs/module/src/module/...` |
| **Constraints** | Implicit (no limits) | Explicit (`CHATELET.json`) |
| **Isolation** | Files in shared tree | Packs on separate branches |
| **Dependencies** | Transitive imports | Explicit `PACK.json` |
| **Discovery** | Manual scanning | Automatic via `tool packs list` |

### Step 2.2: Check KeepBudget Constraints

The `CHATELET.json` file defines structural limits:

```json
{
  "version": "1.0",
  "keep": {
    "maxFiles": 20,
    "maxLineCount": 3000,
    "allowedDirs": ["src/cli"]
  },
  "packs": {
    "discoveryRoot": "packs/",
    "maxSize": 50000000
  },
  "gitsafe": {
    "denylist": [".env", ".ssh", "credentials/"],
    "maxBytes": 10485760
  }
}
```

**What this means:**
- `keep/` is minimal: ≤20 files, ≤3000 lines (only CLI commands live here)
- Each pack: ≤50 MB
- Sensitive paths are never exposed via git operations
- Bulk reads are bounded (10 MB max)

---

## Phase 3: Prepare for Execution

### Step 3.1: Create Backup Branch

Before executing any moves, create a backup:

```bash
git checkout -b backup/pre-migration-$(date +%s)
git push origin backup/pre-migration-$(date +%s)
git checkout master
```

### Step 3.2: Create Feature Branch for Migration

```bash
git checkout -b feat/migrate-to-chatelet
```

### Step 3.3: Verify Clean Working Tree

```bash
git status
```

Expected output:
```
On branch feat/migrate-to-chatelet
nothing to commit, working tree clean
```

If there are uncommitted changes, stash or commit them first:

```bash
git stash
```

---

## Phase 4: Execute Migration (Manual Approach)

The automated move executor is not yet implemented. This section documents the manual process.

### Step 4.1: Create Pack Directory Structure

For each module in your plan:

```bash
# For utils pack
mkdir -p packs/utils/src/lib
mkdir -p packs/utils/__tests__

# For lib pack
mkdir -p packs/lib/src/lib
mkdir -p packs/lib/__tests__

# For cli pack
mkdir -p packs/cli/src/cli
mkdir -p packs/cli/__tests__
```

### Step 4.2: Copy Files to Packs

For each move operation in MIGRATION_PLAN.json:

```bash
# Example: move src/lib/utils.ts → packs/utils/src/lib/utils.ts
mkdir -p $(dirname packs/utils/src/lib/utils.ts)
cp src/lib/utils.ts packs/utils/src/lib/utils.ts
```

Script to automate bulk copy:

```bash
#!/bin/bash
# migrate.sh - copy all files from plan

PLAN_FILE="MIGRATION_PLAN.json"

jq -r '.moves[] | "\(.from)|\(.to)"' "$PLAN_FILE" | while IFS='|' read -r FROM TO; do
  TARGET_DIR=$(dirname "$TO")
  mkdir -p "$TARGET_DIR"
  cp "$FROM" "$TO"
  echo "Copied: $FROM → $TO"
done
```

Run it:

```bash
bash migrate.sh
```

### Step 4.3: Create PACK.json Manifests

For each pack, create `packs/{module}/PACK.json`:

```json
{
  "version": "1.0",
  "name": "utils",
  "description": "Utility functions and helpers",
  "modules": ["src/lib"],
  "entrypoint": "src/lib/index.ts",
  "dependencies": []
}
```

Example manifests for each pack:

**packs/utils/PACK.json:**
```json
{
  "version": "1.0",
  "name": "utils",
  "description": "Shared utilities and helpers",
  "modules": ["src/lib"],
  "entrypoint": "src/lib/index.ts",
  "dependencies": [],
  "maintainers": ["@team/platform"],
  "tags": ["utility", "core"]
}
```

**packs/lib/PACK.json:**
```json
{
  "version": "1.0",
  "name": "lib",
  "description": "Core types and shared modules",
  "modules": ["src/lib"],
  "entrypoint": "src/lib/index.ts",
  "dependencies": ["utils"],
  "maintainers": ["@team/platform"],
  "tags": ["core", "types"]
}
```

**packs/cli/PACK.json:**
```json
{
  "version": "1.0",
  "name": "cli",
  "description": "CLI command implementations",
  "modules": ["src/cli"],
  "entrypoint": "src/cli/index.ts",
  "dependencies": ["lib", "utils"],
  "maintainers": ["@team/platform"],
  "tags": ["cli", "commands"]
}
```

### Step 4.4: Create keep/ Directory for CLI

Create the minimal `keep/` directory with CLI entry point:

```bash
mkdir -p keep/src/cli
```

**keep/src/cli/index.ts** (example):
```typescript
// CLI entry point — minimal wrapper
export { cmdOriented, cmdChart, cmdShow } from './commands';
export type { OrientOptions, ChartOptions } from './types';
```

**keep/CHATELET.json:**
```json
{
  "version": "1.0",
  "keep": {
    "maxFiles": 20,
    "maxLineCount": 3000,
    "allowedDirs": ["src/cli"]
  },
  "packs": {
    "discoveryRoot": "packs/",
    "maxSize": 50000000
  },
  "gitsafe": {
    "denylist": [".env", ".ssh", "credentials/", "*.key", "*.pem"],
    "maxBytes": 10485760
  }
}
```

### Step 4.5: Verify File Counts

Ensure files are in the right place:

```bash
# Should match MIGRATION_PLAN.json move count
find packs/ -type f -name "*.ts" ! -name "*.test.ts" | wc -l

# Keep should be small
find keep/ -type f -name "*.ts" ! -name "*.test.ts" | wc -l
```

---

## Phase 5: Validation

### Step 5.1: Check Chatelet Status

Validate the new structure:

```bash
tool chatelet status
```

Expected output:
```
Keep: 5 files, 450 lines (under 3000 limit)
Packs: 3 discoverable (cli, lib, utils)
Violations: 0
Last audit: just now
```

If violations are reported:

| Violation | Meaning | Fix |
|-----------|---------|-----|
| `file-count-exceeded` | Keep has > 20 files | Move non-CLI files to packs |
| `line-count-exceeded` | Keep has > 3000 lines | Move utility modules to packs |
| `forbidden-directory` | Files in disallowed dirs | Update `allowedDirs` or move files |
| `oversized-file` | Single file > 1 MB | Consider breaking into smaller files |

### Step 5.2: List Discovered Packs

```bash
tool packs list
```

Expected output:
```
cli        5 files, 2.3KB
lib        12 files, 8.5KB
utils      10 files, 4.2KB
```

### Step 5.3: Inspect a Pack

```bash
tool packs show utils
```

Expected output:
```
Pack: utils
Branch: packs/utils
Modules: [src/lib]
Size: 4.2KB
Tests: ✅ 8/8 passing
```

### Step 5.4: Verify Imports

Check that all imports still resolve. Run your test suite:

```bash
npm test
```

Common issues and fixes:

| Issue | Cause | Fix |
|-------|-------|-----|
| `Cannot find module "utils"` | Import path outdated | Update import: `from '../../../packs/utils/src/lib'` → `from '@packs/utils'` (configure module aliases) |
| `ENOENT: no such file` | File not copied | Verify PACK.json modules match actual files |
| `Circular dependency` | Imports now circular | Refactor to break dependency cycle |

---

## Phase 6: Commit Changes

### Step 6.1: Stage Files

```bash
# Stage all new pack files
git add packs/
git add keep/

# Verify staging
git status
```

Expected output:
```
On branch feat/migrate-to-chatelet
Changes to be committed:
  new file:   packs/cli/PACK.json
  new file:   packs/cli/src/cli/...
  new file:   packs/lib/PACK.json
  ...
```

### Step 6.2: Commit with Roadmap

```bash
git commit -m "migration-planner-impl: migrate monolith to Châtelet pack structure"
```

Or if using roadmap:

```bash
roadmap complete docs-migration
```

This validates that `docs/MIGRATION.md` exists, then records completion.

### Step 6.3: Cleanup Original `src/` (Optional)

Once tests pass and validation succeeds, optionally remove original files:

```bash
# Verify nothing else depends on src/
git grep -l "from.*src/" -- '*.ts'

# If safe, remove
rm -rf src/lib src/utils src/cli
git add -A
git commit -m "cleanup: remove migrated monolith modules"
```

**Caution:** Only do this after:
1. All tests pass
2. Imports have been updated to pack paths
3. Backup branch exists (`backup/pre-migration-*`)

---

## Phase 7: Rollback Procedures

### Scenario A: Migration Incomplete (Before Commit)

If something goes wrong before committing:

```bash
# Discard all changes
git checkout -- .
git clean -fd

# Restore from backup branch
git reset --hard backup/pre-migration-<timestamp>
```

### Scenario B: Post-Commit Issues

If problems are discovered after committing:

```bash
# Option 1: Revert the commit
git revert HEAD
git push origin feat/migrate-to-chatelet

# Option 2: Hard reset to backup (destructive)
git reset --hard backup/pre-migration-<timestamp>
git push --force origin feat/migrate-to-chatelet
```

### Scenario C: Partial Rollback (Specific Packs)

To rollback only certain packs:

```bash
# Restore specific pack from backup
git checkout backup/pre-migration-<timestamp> -- packs/utils/
git commit -m "rollback: restore utils pack from backup"
```

---

## Phase 8: Post-Migration Workflow

### Step 8.1: Update Module Resolution

Configure your TypeScript `tsconfig.json` for pack aliases:

```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@packs/utils": ["packs/utils/src/lib"],
      "@packs/lib": ["packs/lib/src/lib"],
      "@packs/cli": ["packs/cli/src/cli"]
    }
  }
}
```

Update imports:

```typescript
// Before
import { parseConfig } from '../../../src/lib/config';

// After
import { parseConfig } from '@packs/lib/config';
```

### Step 8.2: Add CI Gates

Add enforcement to your CI pipeline (e.g., GitHub Actions):

```yaml
# .github/workflows/chatelet-gate.yml
name: Châtelet Validation

on: [push, pull_request]

jobs:
  chatelet-check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm install
      - run: tool chatelet status --check
      - run: tool packs list --validate
```

### Step 8.3: Monitor Pack Discovery

Track pack health:

```bash
# Daily
tool chatelet status

# Weekly
tool packs list
tool packs show <name> --verbose
```

---

## Real-World Examples

### Example 1: Small Project (Auth Library)

**Before:**
```
src/
├── auth/
│   ├── jwt.ts
│   ├── oauth.ts
│   ├── types.ts
│   └── __tests__/
└── types/
    └── common.ts
```

**Plan:**
```json
{
  "moves": [
    { "from": "src/auth/jwt.ts", "to": "packs/auth/src/auth/jwt.ts" },
    { "from": "src/auth/oauth.ts", "to": "packs/auth/src/auth/oauth.ts" },
    { "from": "src/auth/types.ts", "to": "packs/auth/src/auth/types.ts" },
    { "from": "src/types/common.ts", "to": "packs/lib/src/types/common.ts" }
  ],
  "estimated_time": "15m"
}
```

**After:**
```
packs/
├── auth/
│   ├── PACK.json
│   ├── src/auth/
│   └── __tests__/
└── lib/
    ├── PACK.json
    └── src/types/

keep/
└── CHATELET.json
```

### Example 2: Large Project (Full Stack)

**Before:**
```
src/
├── api/         (30 files, 8000 lines)
├── db/          (20 files, 5000 lines)
├── cli/         (15 files, 3000 lines)
├── utils/       (25 files, 4000 lines)
└── types/       (10 files, 1500 lines)
```

**Migration time:** ~45 minutes (estimated)

**After:**
```
packs/
├── api/    (packs/api/PACK.json)
├── db/     (packs/db/PACK.json)
├── utils/  (packs/utils/PACK.json)
├── types/  (packs/types/PACK.json)
└── cli/    (minimal wrapper, mostly in keep/)

keep/
├── src/cli/    (entry point)
└── CHATELET.json
```

**Dependencies in PACK.json:**
- api: depends on db, types, utils
- db: depends on types, utils
- cli: depends on api, db, types, utils
- types: no dependencies
- utils: no dependencies

---

## Troubleshooting

### Q: "Plan validation failed: CircularDependency"

**A:** Your monolith has circular imports. Before migrating:

```bash
# Find cycles
npm install --save-dev @madge/core
npx madge --circular src/
```

Refactor to break cycles:
1. Move common code to a `types/` or `utils/` pack
2. Have both cycles import from the shared pack
3. Re-run plan generator

### Q: "Move not found: src/lib/index.ts"

**A:** The plan was generated but files have changed. Re-generate:

```bash
rm MIGRATION_PLAN.json
tool chatelet migrate --plan-only --output MIGRATION_PLAN.json
```

### Q: "Cannot find module '@packs/utils' after migration"

**A:** Module alias not configured. Check `tsconfig.json`:

```bash
cat tsconfig.json | grep -A5 paths
```

If missing, add:
```json
"paths": {
  "@packs/*": ["packs/*/src/*"]
}
```

### Q: Keep budget violated after moving files

**A:** Move more files to packs. Check violations:

```bash
tool chatelet status
```

Then either:
- Move additional files to packs, OR
- Increase limits in `CHATELET.json` (not recommended)

### Q: Tests fail after migration

**A:** Import paths or file locations changed. Verify:

```bash
# Check what tests are importing
grep -r "import.*src/" tests/

# Update to pack paths
sed -i 's|from.*src/lib|from @packs/lib|g' tests/**/*.ts
```

---

## Validation Checklist

Before marking migration complete:

- [ ] `tool chatelet migrate --plan-only` produces valid plan
- [ ] All files from plan are copied to packs/
- [ ] PACK.json exists for each pack
- [ ] CHATELET.json exists in keep/
- [ ] `tool chatelet status` shows 0 violations
- [ ] `tool packs list` discovers all packs
- [ ] `npm test` passes (all tests green)
- [ ] No remaining imports from `src/` in code
- [ ] Backup branch created and pushed
- [ ] Feature branch committed and ready for PR
- [ ] tsconfig.json paths configured
- [ ] CI gates configured in `.github/workflows/`

---

## Next Steps

After migration completes:

1. **Open Pull Request** — Describe changes, note migration date
2. **Code Review** — Have team review pack structure and dependencies
3. **Merge to Main** — Gate on Châtelet validation passing
4. **Monitor** — Track pack health with `tool packs list`
5. **Iterate** — Move more code to packs as modules stabilize

---

## See Also

- `docs/CHATELET.md` — Architecture overview
- `docs/API.md` — `tool` command reference
- `docs/TROUBLESHOOTING.md` — Common issues and solutions
- `.specify/specs/fr-chatelet-001/` — Detailed acceptance scenarios
