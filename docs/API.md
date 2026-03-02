# Roadmap CLI Command Reference

Complete reference for Roadmap CLI commands. All commands are invoked as `tool <command>`.

---

## Table of Contents

1. [Pack Commands](#pack-commands)
   - [`tool packs list`](#tool-packs-list)
   - [`tool packs show`](#tool-packs-show)
   - [`tool packs extract`](#tool-packs-extract)
2. [Châtelet Commands](#châtelet-commands)
   - [`tool chatelet status`](#tool-chatelet-status)
   - [`tool chatelet migrate`](#tool-chatelet-migrate)
3. [Exit Codes](#exit-codes)
4. [Error Reference](#error-reference)

---

## Pack Commands

### `tool packs list`

List all discoverable packs in the repository.

**Usage**
```
tool packs list [OPTIONS]
```

**Description**

Discovers all pack branches (`packs/*`) in the repository and retrieves metadata for each. Packs are stored as git branches, allowing version control and distribution as reusable units.

**Options**

| Option | Description | Default |
|--------|-------------|---------|
| `--format json \| text` | Output format | `text` |

**Output Formats**

**Text format** (default):
```
core  23 modules, 45KB
utils  8 modules, 12KB
```

Each line shows: `<name>  <module-count> modules, <size>`

**JSON format**:
```json
{
  "packs": [
    {
      "name": "core",
      "modules": 23,
      "size": 46080
    },
    {
      "name": "utils",
      "modules": 8,
      "size": 12288
    }
  ]
}
```

**Examples**

List packs in human-readable format:
```bash
tool packs list
```

List packs as JSON:
```bash
tool packs list --format json
```

**Exit Codes**

| Code | Meaning |
|------|---------|
| `0` | Success, packs listed |
| `1` | Repository not found or git error |

**Notes**

- Pack discovery uses git branch enumeration (`refs/heads/packs/*`)
- Module count is determined by counting source files (`.ts`, `.tsx`, `.js`, `.jsx`)
- Size is calculated from git object sizes
- If no packs exist, output is `(no packs discovered)`

---

### `tool packs show`

Display detailed metadata for a specific pack.

**Usage**
```
tool packs show <name>
```

**Description**

Retrieves and displays the manifest for a named pack, including version, description, exported APIs, module list, size, branch reference, and test status.

**Arguments**

| Argument | Description |
|----------|-------------|
| `<name>` | Pack name (branch `packs/<name>` must exist) |

**Output**

```json
{
  "cmd": "packs.show",
  "name": "core",
  "manifest": {
    "name": "core",
    "version": "1.0.0",
    "description": "Core Chatelet pack with baseline utilities",
    "branch": "packs/core",
    "exports": ["define", "verify", "orient", "merge", "branch", "reconcile", "parallelOrder", "advanceBatch"],
    "modules": [
      "src/lib/gitsafe/index.ts",
      "src/lib/chatelet/keepbudget.ts",
      "roadmap.ts"
    ],
    "size": 45000,
    "testStatus": "✅ 23/23 passing"
  },
  "discoveryReady": true
}
```

**Examples**

Show the `core` pack:
```bash
tool packs show core
```

**Exit Codes**

| Code | Meaning |
|------|---------|
| `0` | Success, manifest retrieved |
| `1` | Pack not found or error |

**Notes**

- Manifests are defined in the pack's PACK.json file
- `exports` lists all public APIs provided by the pack
- `testStatus` indicates whether all pack tests pass
- Size is in bytes

---

### `tool packs extract`

Extract pack contents with bounds enforcement.

**Usage**
```
tool packs extract <name> [paths...] [OPTIONS]
```

**Description**

Extracts files from a pack with strict safety enforcement:
- Respects `maxBytes` limit from CHATELET.json gitsafe configuration
- Rejects paths matching denylist patterns (`.env`, secrets, credentials, etc.)
- Prevents path traversal (`../`) and absolute paths
- Validates individual file and cumulative sizes
- Rejects symlinks (unreadable files cause errors)

Extracted files are packaged as a `tar.gz` archive.

**Arguments**

| Argument | Description |
|----------|-------------|
| `<name>` | Pack name (branch `packs/<name>` must exist) |
| `[paths...]` | Specific files or directories to extract (optional; all if omitted) |

**Options**

| Option | Description | Default |
|--------|-------------|---------|
| `--format tar.gz \| stdout` | Output format | `tar.gz` |

**Output**

On success, returns a JSON response with extraction metadata:

```json
{
  "cmd": "packs.extract",
  "pack": "core",
  "extractedPaths": [
    "src/lib/gitsafe/index.ts",
    "src/lib/chatelet/keepbudget.ts"
  ],
  "totalSize": 45678,
  "outputFile": "/tmp/packs-extract-abc123/core.tar.gz",
  "success": true,
  "summary": "Extracted 2 files (45.7KB) from pack 'core'"
}
```

**Examples**

Extract entire pack:
```bash
tool packs extract core
```

Extract a single file:
```bash
tool packs extract core src/lib/gitsafe/index.ts
```

Extract multiple specific paths:
```bash
tool packs extract core src/lib/gitsafe/index.ts src/lib/chatelet/keepbudget.ts
```

Extract directory:
```bash
tool packs extract core src/lib/chatelet
```

**Exit Codes**

| Code | Meaning |
|------|---------|
| `0` | Success, archive created |
| `1` | Error (see stderr for details) |

**Error Codes**

Errors are reported as `ExtractError[CODE]` with context details:

| Code | Meaning | Resolution |
|------|---------|------------|
| `PACK_NOT_FOUND` | Branch `packs/<name>` does not exist | Verify pack name exists: `tool packs list` |
| `PATH_NOT_FOUND` | Requested path not found in pack or unreadable | Check path exists in pack; symlinks cause this |
| `DENIED` | Path matches gitsafe denylist | Path is blocked by security policy; check CHATELET.json denylist |
| `OVERSIZED` | Single file or cumulative size exceeds `maxBytes` | Reduce selection or increase limit in CHATELET.json |
| `TRAVERSAL_REJECTED` | Path contains `..` or starts with `/` | Use relative paths without traversal |
| `ARCHIVE_FAILED` | Failed to create tar.gz archive | Check git and disk space; see error details |
| `CHATELET_NOT_FOUND` | CHATELET.json not found | Ensure security/CHATELET.json exists |
| `CHATELET_LOAD_FAILED` | Failed to parse CHATELET.json | Fix JSON syntax in security/CHATELET.json |
| `INVALID_PACK_NAME` | Pack name is missing or invalid | Provide non-empty string as pack name |
| `PACK_LIST_FAILED` | Failed to enumerate pack contents | Check git access and permissions |

**Bounds Enforcement**

The extractor enforces limits defined in `security/CHATELET.json`:

```json
{
  "gitsafe": {
    "maxBytes": 10485760,
    "denylist": [
      "^\\.env",
      "secrets",
      ".*\\.key$",
      "credentials"
    ]
  }
}
```

- **`maxBytes`**: Maximum size in bytes for a single file or cumulative extraction
- **`denylist`**: Array of regex patterns (or literal strings) for paths to reject

**Notes**

- Symlinks are not dereferenced; unreadable files cause path errors or skipped during full-pack extraction
- Cumulative size includes all extracted files; large packs may require selective extraction
- Archive is created in a temporary directory; the `outputFile` path is valid until cleanup
- Path separators in archive match input (`src/lib/gitsafe/index.ts`)

---

## Châtelet Commands

### `tool chatelet status`

Show current Châtelet state including keep statistics, discoverable packs, and violations.

**Usage**
```
tool chatelet status [OPTIONS]
```

**Description**

Displays a comprehensive status report including:
- Current keep budget consumption (file count, line count)
- Configured keep budget limits
- Discoverable packs and their names
- Any KeepBudget constraint violations with remediation hints
- Timestamp of last audit

**Options**

| Option | Description |
|--------|-------------|
| `--check` | Exit with code 1 if any violations exist; 0 otherwise |
| `--format json \| text` | Output format (default: `text`) |

**Output Formats**

**Text format** (default):
```
Châtelet Status Report
======================
Keep: 156 files, 45230 lines (under 100000 limit)
Packs: 3 discoverable (core, utils, auth)
Violations: 0

Last audit: 2 minutes ago
```

**JSON format**:
```json
{
  "timestamp": "2026-03-02T10:30:45.123Z",
  "keep": {
    "fileCount": 156,
    "maxFiles": 500,
    "lineCount": 45230,
    "maxLineCount": 100000
  },
  "packs": {
    "discoverable": 3,
    "names": ["core", "utils", "auth"]
  },
  "violations": [
    {
      "type": "line_count_exceeded",
      "severity": "error",
      "message": "Line count 102000 exceeds limit 100000",
      "remediation": "Migrate module to new pack or increase maxLineCount"
    }
  ],
  "lastAudit": "2 minutes ago"
}
```

**Examples**

Show status in text format:
```bash
tool chatelet status
```

Show status and fail if violations exist (for CI):
```bash
tool chatelet status --check
```

Show status as JSON:
```bash
tool chatelet status --format json
```

**Exit Codes**

| Code | Meaning |
|------|---------|
| `0` | Status retrieved successfully; no violations (with `--check`) |
| `1` | Violations exist (with `--check`) or error occurred |

**Violations**

Violations indicate KeepBudget constraint breaches:

| Type | Severity | Remediation |
|------|----------|-------------|
| `line_count_exceeded` | error | Reduce line count or increase limit in CHATELET.json |
| `file_count_exceeded` | error | Move files to another pack or increase limit |
| `undiscoverable_pack` | warning | Ensure PACK.json exists in pack directory |
| `missing_manifest` | error | Create PACK.json in pack with required metadata |

**Notes**

- Status is computed live; no caching
- Packs are discovered from the `discoveryRoot` path specified in CHATELET.json
- Line count is accumulated from all `.ts` files (excluding tests)
- Violations include hints for resolution

---

### `tool chatelet migrate`

Generate a migration plan from monolith to Châtelet pack structure.

**Usage**
```
tool chatelet migrate [OPTIONS]
```

**Description**

Performs a dry-run analysis of the current monolith structure and generates a detailed migration plan without making changes. The plan includes:
- Module inventory (count of identified modules)
- File move operations (from → to paths)
- Estimated migration time
- Safety validation (syntax, uniqueness, idempotency)
- Rollback metadata (timestamps, file counts)

This is always a dry-run; no actual changes are applied.

**Options**

| Option | Description | Default |
|--------|-------------|---------|
| `--plan-only` | Output plan and exit (default: true) | `true` |
| `--format json \| text` | Output format | `text` |
| `--output <path>` | Write plan to file instead of stdout | stdout |

**Output Formats**

**Text format** (default):
```
Châtelet Migration Plan
=======================
Modules identified: 5
Files to move: 42
Estimated lines: 12450
Estimated time: 60m
Safety status: dry-run-verified

Modules:
  • gitsafe (8 files)
  • chatelet (15 files)
  • validation (9 files)
  • cli (7 files)
  • integration (3 files)

Sample moves (showing first 10):
  1. src/gitsafe/index.ts → packs/gitsafe/index.ts
  2. src/gitsafe/types.ts → packs/gitsafe/types.ts
  3. src/gitsafe/exec.ts → packs/gitsafe/exec.ts
  4. src/chatelet/types.ts → packs/chatelet/types.ts
  5. src/chatelet/keepbudget.ts → packs/chatelet/keepbudget.ts
  6. src/chatelet/migration-validator.ts → packs/chatelet/migration-validator.ts
  7. src/chatelet/index.ts → packs/chatelet/index.ts
  8. src/validation/index.ts → packs/validation/index.ts
  9. src/validation/rules.ts → packs/validation/rules.ts
  10. src/validation/errors.ts → packs/validation/errors.ts
  ... and 32 more moves

Dry-run: No actual changes were made.
To see full plan: tool chatelet migrate --plan-only --format json
```

**JSON format**:
```json
{
  "moves": [
    {
      "from": "src/gitsafe/index.ts",
      "to": "packs/gitsafe/index.ts",
      "reason": "Migrate gitsafe module to Châtelet pack structure"
    },
    {
      "from": "src/gitsafe/types.ts",
      "to": "packs/gitsafe/types.ts",
      "reason": "Migrate gitsafe module to Châtelet pack structure"
    }
  ],
  "estimated_time": "60m",
  "safety": "dry-run-verified",
  "rollback": {
    "metadata": {
      "audit_timestamp": "2026-03-02T10:30:45.123Z",
      "module_count": 5,
      "file_count": 42,
      "line_count": 12450
    },
    "timestamp": "2026-03-02T10:30:45.123Z"
  }
}
```

**Examples**

Generate plan and display in text format:
```bash
tool chatelet migrate --plan-only
```

Generate and output plan as JSON to stdout:
```bash
tool chatelet migrate --format json
```

Generate plan and save to file:
```bash
tool chatelet migrate --output MIGRATION_PLAN.json
```

**Exit Codes**

| Code | Meaning |
|------|---------|
| `0` | Plan generated successfully |
| `1` | Plan validation failed or error occurred |

**Validation**

The plan is validated for:

| Criterion | Check | Error |
|-----------|-------|-------|
| Syntax | All moves have `from` and `to` fields | MOVE_INVALID |
| Safety | No path traversal (`../`) or absolute paths | TRAVERSAL_REJECTED |
| Uniqueness | No duplicate or conflicting target paths | DUPLICATE_TARGET |
| Idempotency | Plan is deterministic and re-runnable | NON_DETERMINISTIC |
| Module discovery | At least one module identified | NO_MODULES_FOUND |

**Estimated Time Calculation**

Time estimates are computed as:
- Base: 15 minutes minimum
- Rate: ~5 minutes per 1000 lines of code
- Formula: `max(15, ceil(lineCount / 200)) minutes`

**Rollback Metadata**

The plan includes audit metadata for potential rollback:
- `audit_timestamp`: When the audit was performed
- `module_count`: Number of modules identified
- `file_count`: Total files in migration plan
- `line_count`: Estimated total lines of code

**Notes**

- This command performs analysis only; no changes are made
- Modules are discovered from `src/` directory structure
- Line count estimates are rough (actual may vary)
- Symlinks and unreadable files are skipped during audit
- Plans are deterministic and can be re-run to verify consistency

---

## Exit Codes

All commands follow standard exit code conventions:

| Code | Meaning |
|------|---------|
| `0` | Success |
| `1` | Error (invalid input, not found, validation failed, etc.) |

With `--check` flags:
- `0`: All checks passed (or no violations found)
- `1`: Check failed or violations detected

---

## Error Reference

### Error Response Format

Errors are reported with structured context:

```json
{
  "cmd": "command-name",
  "error": {
    "code": "ERROR_CODE",
    "context": {
      "field": "value",
      "hint": "What to do about it"
    }
  }
}
```

### Common Errors

#### `CHATELET_NOT_FOUND`
**Meaning**: CHATELET.json configuration file not found

**Resolution**:
1. Verify path: `security/CHATELET.json` relative to repo root
2. Create file from template if missing (see project setup docs)
3. Ensure correct permissions

#### `PACK_NOT_FOUND`
**Meaning**: Pack branch `packs/<name>` does not exist

**Resolution**:
1. List available packs: `tool packs list`
2. Verify pack name spelling
3. Create pack if needed: `git checkout -b packs/<name>`

#### `OVERSIZED`
**Meaning**: File or cumulative extraction exceeds `maxBytes` limit

**Resolution**:
1. Check current limit: grep `maxBytes` security/CHATELET.json
2. For extraction: select fewer paths or smaller files
3. To increase limit: edit CHATELET.json and raise `maxBytes` value
4. Verify intent (large extractions may indicate over-broad access)

#### `DENIED`
**Meaning**: Path matches gitsafe denylist (security policy)

**Resolution**:
1. Check why path is blocked: grep the pattern in security/CHATELET.json `denylist`
2. If legitimate, update denylist to unblock
3. If accessing secrets/credentials, use alternate path or request from maintainer
4. Never attempt to bypass via indirect paths

#### `TRAVERSAL_REJECTED`
**Meaning**: Path contains `../` or starts with `/`

**Resolution**:
1. Use relative paths: `src/lib/module.ts` (not `../lib/module.ts`)
2. Never use absolute paths: `/home/user/...` not allowed
3. Check path for typos

#### `ARCHIVE_FAILED`
**Meaning**: Failed to create tar.gz archive

**Resolution**:
1. Check disk space: `df -h /tmp`
2. Verify git access: `git status` in repo
3. Ensure pack branch exists: `git branch packs/<name>`
4. Check file permissions in pack
5. See stderr for git error details

#### `INVALID_PACK_NAME`
**Meaning**: Pack name is missing, empty, or not a string

**Resolution**:
1. Provide non-empty string: `tool packs extract core` (not empty string)
2. Use alphanumeric + hyphens: `core`, `my-pack`, `utils-v2`

#### `LINE_COUNT_EXCEEDED` (in status violations)
**Meaning**: Keep module has exceeded configured line count limit

**Resolution**:
1. Check current limit: `tool chatelet status --format json | grep maxLineCount`
2. Option A: Migrate module to new pack (preferred)
3. Option B: Increase limit in CHATELET.json `keep.maxLineCount`
4. Option C: Refactor to reduce lines (remove unused code, split functions)

#### `FILE_COUNT_EXCEEDED` (in status violations)
**Meaning**: Keep module has more files than configured limit

**Resolution**:
1. Check current limit: `tool chatelet status --format json | grep maxFiles`
2. Consolidate files or move to pack
3. Increase limit in CHATELET.json if justified
4. Review structure for over-fragmentation

---

## Configuration

### CHATELET.json Structure

All commands respect configuration in `security/CHATELET.json`:

```json
{
  "gitsafe": {
    "maxBytes": 10485760,
    "denylist": [
      "^\\.env",
      "secrets",
      ".*\\.key$",
      "credentials"
    ]
  },
  "keep": {
    "maxFiles": 500,
    "maxLineCount": 100000,
    "discoveryRoot": "packs"
  },
  "packs": {
    "branchPrefix": "packs/",
    "manifestPath": "PACK.json"
  }
}
```

| Field | Type | Purpose |
|-------|------|---------|
| `gitsafe.maxBytes` | number | Byte limit for extract operations |
| `gitsafe.denylist` | string[] | Regex patterns to reject in extraction |
| `keep.maxFiles` | number | Max file count in keep directory |
| `keep.maxLineCount` | number | Max line count in keep directory |
| `keep.discoveryRoot` | string | Root directory for pack discovery |
| `packs.branchPrefix` | string | Git branch prefix for packs |
| `packs.manifestPath` | string | Filename for pack manifests |

---

## Related Commands

- `roadmap orient` — Determine current task position
- `roadmap show <node>` — View node specification
- `roadmap complete <node>` — Submit completed work
- `roadmap chart` — Display progress visualization

See `/home/griffin/src/roadmap/bin/roadmap help` for roadmap infrastructure commands.
