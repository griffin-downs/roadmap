# Châtelet Architecture Guide

**Châtelet** is a modular, governance-enabled architecture for managing large codebases through constrained **keep** directories and feature-focused **packs**.

This guide covers the architecture principles, constraints, and typical workflows for operating within the Châtelet system.

---

## Architecture Overview

Châtelet enforces a **two-tier storage model** with safety boundaries:

### Keep: Lightweight, Shared State

The `keep/` directory holds minimal, shared artifacts—configuration, documentation, cross-pack contracts, or migration state.

**Constraints** (enforced via `CHATELET.json`):
- Hard limit on file count (e.g., 50 files)
- Hard limit on total line count (e.g., 5000 lines)
- Explicit allowlist of permitted directories
- Forbidden patterns rejected at validation time

**Typical contents**:
- `.specify/` — specification docs (read-only reference)
- `.roadmap/` — roadmap state and planning metadata
- `security/CHATELET.json` — governance config
- `docs/` — architecture and integration guides

**Rationale**: Keep is a pressure cooker. Hard limits force clarity: if you can't fit a contract in 100 lines, it's too complex. Move business logic to a pack.

### Packs: Feature-Focused Modules

Each **pack** is a self-contained git branch (`packs/<name>`) with its own file structure, tests, and exports.

**Pack structure** (example: `packs/core`):
```
packs/core/
  src/lib/core/
    types.ts              # Type definitions + interfaces
    protocol.ts           # Exported functions
    index.ts              # Re-exports for ergonomics
  __tests__/
    unit.test.ts
    integration.test.ts
  PACK.json              # Pack manifest (metadata, exports, dependencies)
```

**Manifest** (`PACK.json`):
```json
{
  "name": "core",
  "version": "1.0.0",
  "description": "Core Châtelet pack with baseline utilities",
  "exports": [
    "define",
    "verify",
    "orient",
    "merge",
    "branch"
  ],
  "dependencies": [],
  "testStatus": "✅ 23/23 passing"
}
```

**Constraints**:
- Size limit per pack (e.g., 500KB)
- All files must be under declared exports or internal modules
- Circular dependencies forbidden (validated on `packs list`)
- No cross-pack file references (packs compose, never interleave)

**Rationale**: Packs decouple features. If a pack grows too large, it should split. If logic belongs in `keep/`, it's shared state—move it. Packs encourage clean boundaries.

---

## KeepBudget: Governance Configuration

**Location**: `security/CHATELET.json`

**Schema**:
```typescript
interface KeepBudget {
  version: "1.0";
  keep: {
    maxFiles: number;           // Hard limit: file count in keep/
    maxLineCount: number;       // Hard limit: total lines across keep/
    allowedDirs: string[];      // Explicit directories: ".specify", ".roadmap", "docs"
  };
  packs: {
    discoveryRoot: string;      // Where to find pack metadata (default: "packs/")
    maxSize: number;            // Size limit per pack branch
  };
  gitsafe: {
    denylist: string[];         // Deny patterns: ".env", ".*\\.key$", "secret.*"
    maxBytes: number;           // Max bytes per single read operation
  };
}
```

**Example `CHATELET.json`**:
```json
{
  "version": "1.0",
  "keep": {
    "maxFiles": 50,
    "maxLineCount": 5000,
    "allowedDirs": [".specify", ".roadmap", "docs", "security"]
  },
  "packs": {
    "discoveryRoot": "packs/",
    "maxSize": 524288
  },
  "gitsafe": {
    "denylist": [
      "\\.env",
      "\\.ssh",
      "secrets/.*",
      ".*\\.key$",
      "credentials.*"
    ],
    "maxBytes": 1048576
  }
}
```

### Validation & Violations

**Validation runs on**:
- `tool chatelet status` — manual check
- Push to main — CI gate `gate-chatelet-keep`
- Pack operations — bounds checked before extract/list

**Violation types**:
- `file-count-exceeded` — keep/ has more files than `maxFiles`
- `line-count-exceeded` — keep/ exceeds `maxLineCount`
- `forbidden-directory` — file exists outside `allowedDirs`
- `oversized-file` — single file exceeds gitsafe `maxBytes`

**Remediation included**:
```
Error: keep/ has 62 files, exceeds limit of 50
Fix: Remove 12 files or increase keep.maxFiles
Which files to remove:
  docs/archive/old-proposal-1.md (820 lines)
  docs/archive/old-proposal-2.md (650 lines)
  ...
```

---

## GitSafe: Read-Only Bounded Access

**Module**: `src/lib/gitsafe/index.ts`

GitSafe provides safe, read-only access to git refs with deny-list enforcement and size bounds.

### API

```typescript
interface GitSafeConfig {
  denylist: string[];    // Regex patterns to reject
  maxBytes: number;      // Max read size per operation
  maxDepth?: number;     // Optional: max tree traversal depth
}

async function listRefs(repo: string, config: GitSafeConfig): Promise<string[]>
async function readBlob(repo: string, ref: string, path: string, config: GitSafeConfig): Promise<Buffer>
async function readJson<T>(repo: string, ref: string, path: string, config: GitSafeConfig): Promise<T>
async function lsTree(repo: string, ref: string, config: GitSafeConfig): Promise<TreeEntry[]>
async function diffPaths(repo: string, refA: string, refB: string, config: GitSafeConfig): Promise<string[]>
```

### Usage Example

```typescript
import { readJson, GitSafeConfig } from 'roadmap/gitsafe';

const config: GitSafeConfig = {
  denylist: ['\\.env', 'secret.*', 'credentials/.*'],
  maxBytes: 1024 * 1024,  // 1 MB
};

// Read pack manifest from a branch
const manifest = await readJson(
  '/home/user/repo',
  'packs/core',
  'PACK.json',
  config
);

console.log(manifest.name, manifest.exports);
```

### Guarantees

1. **Deny-list enforcement**: All patterns checked before any read
2. **Size bounds**: Oversized reads rejected before buffering
3. **No path traversal**: `../` and absolute paths rejected
4. **No symlinks**: Unreadable (symlink) files fail with diagnostic
5. **Errors diagnostic**: All errors include `GitSafeError` with code + context

---

## Typical Workflows

### Workflow 1: Check Status

```bash
# See current keep/ usage and pack list
tool chatelet status

# Output:
#   Keep: 8 files, 2400 lines (under 3000 limit)
#   Packs: 3 discoverable (core, utils, config)
#   Violations: 0
#   Last audit: 2 minutes ago
```

**Use when**: Starting a session, before pushing, or after large changes.

### Workflow 2: List All Packs

```bash
# Discover all available packs with metadata
tool packs list

# Output (text):
#   core      3 modules, 45KB
#   utils     2 modules, 12KB
#   config    1 module, 2KB

# Or JSON for scripting
tool packs list --format json
```

**Use when**: Planning features, checking available exports, or CI scanning.

### Workflow 3: Inspect a Pack

```bash
# View pack contents and exports
tool packs show core

# Output:
#   Pack: core
#   Branch: packs/core
#   Version: 1.0.0
#   Description: Core Châtelet pack with baseline utilities
#   Exports: [define, verify, orient, merge, branch, ...]
#   Modules: [src/lib/core/types.ts, ...]
#   Size: 45KB
#   Tests: ✅ 23/23 passing
```

**Use when**: Learning pack API, verifying exports, checking test status.

### Workflow 4: Extract Pack Contents

```bash
# Extract entire pack as tar.gz
tool packs extract core

# Extract specific files
tool packs extract core src/lib/core/types.ts src/lib/core/protocol.ts

# Output:
#   Extracted 5 files (32KB) from pack 'core'
#   Archive: /tmp/packs-extract-abc123/core.tar.gz
```

**Use when**: Integrating pack into another project, sharing with external team, or archiving.

**Bounds enforcement**:
- Each file checked against `gitsafe.maxBytes`
- Total extraction checked against `gitsafe.maxBytes`
- Denylist patterns rejected (e.g., `.env`, `credentials/`)
- Symlinks skipped or rejected per policy

### Workflow 5: Plan Migration (Monolith → Châtelet)

```bash
# Generate migration plan without executing
tool chatelet migrate --plan-only

# Output: MIGRATION_PLAN.json
{
  "moves": [
    {
      "from": "src/lib/utils.ts",
      "to": "packs/utils/src/lib/utils.ts",
      "dependents": ["src/cli/main.ts", "src/commands/status.ts"],
      "safety": "safe-to-move"
    },
    ...
  ],
  "estimated_time": "2h",
  "safety": "dry-run-verified"
}

# Review the plan, then execute (when available)
tool chatelet migrate --execute
```

**Use when**: Refactoring monolith into packs, or planning pack reorganization.

---

## Real-World Examples

### Example 1: Adding a New Utility to an Existing Pack

**Goal**: Add a new helper function to `packs/utils`.

```bash
# 1. Check current status
tool chatelet status

# 2. Inspect utils pack
tool packs show utils
#   Exports: [formatBytes, toHex, parseUrl, ...]
#   Size: 12KB

# 3. Edit packs/utils/src/lib/utils.ts, add function
# 4. Update PACK.json to include new export
# 5. Run tests
npm test packs/utils

# 6. Check status again (size increased)
tool chatelet status
#   Packs: 3 discoverable (core, utils, config)

# 7. Commit to packs/utils branch
git commit -m "utils: add parseQuery helper"
git push origin packs/utils
```

### Example 2: Extracting a Pack for External Use

**Goal**: Share `packs/core` with a partner team via secure archive.

```bash
# 1. Verify pack is stable
tool packs show core
tool packs list

# 2. Extract entire pack
tool packs extract core

# 3. Verify contents
tar -tzf /tmp/packs-extract-xyz/core.tar.gz | head -20

# 4. Scan for denylist violations (should be clean)
# (gitsafe automatically rejects denied patterns)

# 5. Send archive to partner
# Includes: source code, PACK.json, tests, README
# Excludes: .env, secrets/, any credentials
```

### Example 3: Checking if Code Violates Keep Budget

**Goal**: Determine why CI is failing.

```bash
# 1. Check status with violations
tool chatelet status --check
# Exit code 1: violations exist

# 2. See what's wrong
tool chatelet status

# Output:
#   Violations:
#     • [error] file-count-exceeded: keep/ has 62 files, exceeds limit of 50
#       → Remove 12 files or increase keep.maxFiles
#       → Candidates: docs/archive/*.md (7 files, 3.2KB total)

# 3. Move excess files to a pack or delete archive
rm docs/archive/proposal-v1.md
rm docs/archive/proposal-v2.md
# ... etc

# 4. Verify
tool chatelet status --check
# Exit code 0: success
```

### Example 4: Integrating a Pack into Keep Docs

**Goal**: Reference pack APIs in `keep/docs`.

```bash
# 1. Extract pack manifest for documentation
tool packs extract core PACK.json

# 2. Read manifest
tar -xzf core.tar.gz PACK.json
cat PACK.json

# 3. Add to docs/API.md
cat >> docs/API.md << 'EOF'
## Core Pack API

**Version**: 1.0.0
**Exports**: define, verify, orient, merge, branch, reconcile, ...

See PACK.json in packs/core for full reference.
EOF

# 4. Check keep/ still under budget
tool chatelet status
```

---

## Error Handling & Recovery

### Common Error: Oversized Read

```
Error: GitSafeError[OVERSIZED]
  path: src/lib/large-generated.ts
  size: 2097152 (2MB)
  maxBytes: 1048576 (1MB)

Fix: Request smaller chunk, or increase maxBytes in CHATELET.json
```

**Recovery**:
1. Extract specific file instead of entire pack
2. Or increase `gitsafe.maxBytes` in `CHATELET.json` (if justified)
3. Or compress source (split into modules)

### Common Error: Denied Pattern

```
Error: GitSafeError[DENIED]
  path: .env.local
  denylist: [\.env, \.ssh, credentials/.*]

Fix: Remove .env.local from pack, use environment variables
```

**Recovery**:
1. Never commit secrets to git (pack or keep)
2. Use `.gitignore` to prevent accidental commits
3. Use GitHub Secrets or similar for CI

### Common Error: Forbidden Directory

```
Error: keep/ has file outside allowedDirs
  file: docs/archive/old-notes.md
  allowedDirs: [.specify, .roadmap, docs, security]

Fix: Move docs/archive/old-notes.md or add 'docs/archive' to allowedDirs
```

**Recovery**:
1. Move file to allowed dir, or
2. Delete file (archive elsewhere), or
3. Create new pack for archived content

---

## Performance Characteristics

| Operation | Target P50 | Notes |
|-----------|-----------|-------|
| `tool chatelet status` | <200ms | Reads CHATELET.json, scans keep/, discovers packs |
| `tool packs list` | <300ms | Enumerates branches, reads metadata |
| `tool packs show <name>` | <100ms | Single pack lookup |
| `tool packs extract <name>` | <2s | Depends on pack size; tar.gz creation |
| GitSafe `readBlob` | <100ms | Single file read on 10k-file repo |
| GitSafe `lsTree` | <200ms | Full tree traversal with denylist filtering |

**Optimization**:
- Cache pack metadata in CI (re-use previous list)
- Use `--format json` for scripting (smaller output)
- Extract specific files instead of full pack when possible
- Keep KeepBudget limits reasonable (50 files, 5000 lines)

---

## CI Integration

### Gate: `gate-chatelet-keep`

Blocks pushes if KeepBudget violations exist.

```yaml
name: Châtelet KeepBudget Check
on: [push]
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - run: tool chatelet status --check
        # Fails if violations present, succeeds if clean
```

### Gate: `gate-pack-manifests`

Validates all pack manifests.

```yaml
name: Pack Manifests
on: [push]
jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - run: tool packs list --validate
        # Fails if any pack missing PACK.json or has circular deps
```

---

## Constraints Summary

| Constraint | Default | Rationale |
|-----------|---------|-----------|
| `keep.maxFiles` | 50 | Keeps shared state minimal and auditable |
| `keep.maxLineCount` | 5000 | Encourages clarity; large contracts move to packs |
| `packs.maxSize` | 500KB | Packs should be focused; oversized packs split |
| `gitsafe.maxBytes` | 1MB | Prevents accidental binary/large-file inclusion |
| Denylist | `.env`, `.ssh`, `credentials/`, `*.key` | Security: no secrets in git |
| Pack circular deps | Forbidden | Enforces DAG structure; easier to reason about |
| Cross-pack files | Forbidden | Packs are modules; no interleaving |

**When to adjust**:
- Increase `keep.maxFiles` if you have stable, minimal shared state (rare)
- Increase `gitsafe.maxBytes` if you deliberately store generated assets (document why)
- Widen denylist if you discover new secret patterns in repos
- Reduce `packs.maxSize` if packs grow uncontrollably

---

## See Also

- **[MIGRATION.md](./MIGRATION.md)** — Step-by-step pack migration guide
- **[API.md](./API.md)** — Complete command reference and exit codes
- **[TROUBLESHOOTING.md](./TROUBLESHOOTING.md)** — Common issues and fixes
- **[FR-CHATELET-001 Spec](../.specify/specs/fr-chatelet-001/spec.md)** — Full technical specification

---

## Glossary

| Term | Definition |
|------|-----------|
| **Keep** | Minimal shared state directory (keep/); hard limits on size |
| **Pack** | Self-contained feature branch (packs/<name>); exports + tests |
| **KeepBudget** | Configuration (CHATELET.json) enforcing constraints |
| **GitSafe** | Read-only, bounded git access with deny-list enforcement |
| **Manifest** | Pack metadata file (PACK.json) with exports and dependencies |
| **Violation** | Breach of KeepBudget constraint (file-count, line-count, etc.) |
| **Denylist** | Regex patterns rejecting dangerous paths (.env, secrets/, etc.) |
| **Bounds** | Size limits (maxBytes, maxFiles, maxLineCount) on operations |

---

**Last updated**: 2026-03-02
**Specification**: FR-CHATELET-001 v1.0
**Status**: Architecture formalization phase (Phase 5)
