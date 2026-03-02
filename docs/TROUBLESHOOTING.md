# Troubleshooting KeepBudget Violations

KeepBudget enforces constraints on project artifact growth: file counts, line counts, directory structure, and file sizes. This guide covers common violations, their root causes, and actionable fixes.

## Violation Types

### 1. File Count Exceeded

**Error Message:**
```
keep/ has 150 files, exceeds limit of 100
```

**What It Means:**
The number of files in keep/ directories (matching `allowedDirs` patterns) exceeds `keep.maxFiles`.

**Why It Happens:**
- Generated code accumulates (test files, fixtures, compiled output)
- Incomplete cleanup of intermediate artifacts
- Test data or fixture files checked in
- Split files from refactoring not consolidated

**How to Fix:**

Option A: Remove excess files
```bash
# List files in keep/ by size or date
find keep/ -type f -mtime +30 | sort  # Files older than 30 days
find keep/ -type f -exec wc -l {} \; | sort -rn | head  # Largest files

# Delete unneeded files
rm keep/old-fixture-file.ts
rm keep/generated/temp-*.ts
```

Option B: Consolidate or split modules
```bash
# Combine small related files
cat keep/utils/helper1.ts keep/utils/helper2.ts > keep/utils/helpers.ts
rm keep/utils/helper1.ts keep/utils/helper2.ts

# Or move files to external packages
mv keep/massive-test-data/ ../test-fixtures/
```

Option C: Increase budget
Update `CHATELET.json`:
```json
{
  "keep": {
    "maxFiles": 150
  }
}
```

**Performance Tip:**
KeepBudget scans all files recursively. With 10,000+ files, this becomes slow. Keep your `keep/` directory lean. Typical healthy count: 50-200 files.

---

### 2. Line Count Exceeded

**Error Message:**
```
keep/ has 150,000 total lines, exceeds limit of 100,000
```

**What It Means:**
The total newline count across all files in allowed directories exceeds `keep.maxLineCount`.

**Why It Happens:**
- Large data files or test fixtures embedded
- Unminified or verbose generated code
- Monolithic modules that should be split
- Comments or documentation in source files without separate docs/

**How to Fix:**

Option A: Find and trim large files
```bash
# Count lines per file, sorted by size
find keep/ -type f -exec wc -l {} \; | sort -rn | head

# Trim or split large files
# If a file is 10,000 lines, split it:
split -l 5000 keep/monolith.ts keep/monolith-part

# Or remove unused code
grep -r "^// TODO: remove" keep/ | cut -d: -f1 | sort -u | xargs rm
```

Option B: Move data to external resources
```bash
# Move large test fixtures to separate directory
mv keep/fixtures/large-dataset.json ../test-data/
# Update imports: 'import data from "../test-data/..."'
```

Option C: Compress or reference (don't embed)
```typescript
// ❌ DON'T: embed large data
const users = [
  { id: 1, name: '...', ... }, // 1000 entries × 50 lines each
];

// ✅ DO: reference external file or fetch at runtime
import users from '../test-data/users.json';
```

Option D: Increase budget
Update `CHATELET.json`:
```json
{
  "keep": {
    "maxLineCount": 200000
  }
}
```

**Performance Tip:**
Line counting is linear in file size. Reducing this limit to realistic values (50k-200k) keeps validators fast.

---

### 3. Forbidden Directory

**Error Message:**
```
File keep/scripts/deploy.ts is in keep/ but not in allowedDirs
```

**What It Means:**
A file exists under `keep/` but its directory is not listed in `keep.allowedDirs`.

**Why It Happens:**
- New file created in unlisted directory
- Refactoring moved files outside allowed structure
- Typo in `allowedDirs` pattern
- Accidental commit to wrong location

**How to Fix:**

Option A: Move file to allowed directory
```bash
# If allowedDirs includes "keep/core"
mv keep/scripts/deploy.ts keep/core/deploy.ts
```

Option B: Add directory to allowedDirs
Update `CHATELET.json`:
```json
{
  "keep": {
    "allowedDirs": [
      "keep/core",
      "keep/utils",
      "keep/scripts"  // Added
    ]
  }
}
```

Option C: Delete file
```bash
rm keep/scripts/deploy.ts
```

**Pattern Matching:**
`allowedDirs` uses startsWith() matching, not glob patterns:
```json
{
  "allowedDirs": [
    "keep/core",      // Matches: keep/core/*, keep/core/sub/*, etc.
    "keep/a/b/c"      // Matches: keep/a/b/c/*, keep/a/b/c/sub/*, etc.
  ]
}
```

---

### 4. Invalid Budget Schema

**Error Message:**
```
Invalid KeepBudget: keep.maxFiles must be positive
keep.maxLineCount must be a positive number
```

**What It Means:**
`CHATELET.json` structure is invalid or constraints are nonsensical.

**Why It Happens:**
- Negative or zero values for max constraints
- Missing required sections (keep, packs, gitsafe)
- Type mismatch (allowedDirs not an array)
- Invalid version string

**How to Fix:**

Validate structure against schema:
```typescript
interface KeepBudget {
  version: "1.0";                    // Must be exactly "1.0"
  keep: {
    maxFiles: number;                // Must be > 0
    maxLineCount: number;            // Must be > 0
    allowedDirs: string[];           // Must be array of strings
  };
  packs: {
    discoveryRoot: string;           // Must not be empty
    maxSize: number;                 // Must be > 0
  };
  gitsafe: {
    denylist: string[];              // Must be array
    maxBytes: number;                // Must be > 0
  };
}
```

Example fixes:

```json
{
  "version": "1.0",
  "keep": {
    "maxFiles": 100,           // ✅ Positive
    "maxLineCount": 50000,     // ✅ Positive
    "allowedDirs": ["keep/"]   // ✅ Array of strings
  },
  "packs": {
    "discoveryRoot": "packs/", // ✅ Non-empty string
    "maxSize": 10485760        // ✅ 10 MB, positive
  },
  "gitsafe": {
    "denylist": ["\\.env$", "secrets/"],  // ✅ Array of regex patterns
    "maxBytes": 1048576        // ✅ 1 MB, positive
  }
}
```

---

## Configuration Examples

### Conservative (Tight Constraints)
Useful for strict code discipline:
```json
{
  "version": "1.0",
  "keep": {
    "maxFiles": 50,
    "maxLineCount": 10000,
    "allowedDirs": ["keep/core", "keep/utils"]
  },
  "packs": {
    "discoveryRoot": "packs/",
    "maxSize": 5242880
  },
  "gitsafe": {
    "denylist": ["\\.env", "\\.secrets", "credentials/"],
    "maxBytes": 524288
  }
}
```

### Moderate (Typical Project)
```json
{
  "version": "1.0",
  "keep": {
    "maxFiles": 200,
    "maxLineCount": 100000,
    "allowedDirs": ["keep/"]
  },
  "packs": {
    "discoveryRoot": "packs/",
    "maxSize": 52428800
  },
  "gitsafe": {
    "denylist": ["\\.env$", "secrets/", "credentials/"],
    "maxBytes": 10485760
  }
}
```

### Generous (Large Monorepo)
```json
{
  "version": "1.0",
  "keep": {
    "maxFiles": 5000,
    "maxLineCount": 1000000,
    "allowedDirs": ["keep/core", "keep/lib", "keep/tests", "keep/fixtures"]
  },
  "packs": {
    "discoveryRoot": "packs/",
    "maxSize": 524288000
  },
  "gitsafe": {
    "denylist": ["\\.env", "\\.ssh", "secrets/", "credentials/"],
    "maxBytes": 104857600
  }
}
```

---

## Deny-List Patterns (GitSafe)

The `gitsafe.denylist` uses regex patterns to prevent dangerous files from being committed.

### Common Patterns

```json
{
  "denylist": [
    "\\.env$",               // .env file
    "\\.env\\.local$",       // .env.local
    "secrets/",              // Any file in secrets/ directory
    "credentials/",          // Any file in credentials/ directory
    "\\.(pem|key)$",         // Private key files
    "\\.ssh/",               // SSH directory
    "node_modules/",         // Dependency folders
    "dist/",                 // Build outputs (if not in keep/)
    "coverage/",             // Test coverage (if not in keep/)
    "\\.DS_Store$",          // macOS metadata
    "Thumbs\\.db$"           // Windows metadata
  ]
}
```

### Pattern Syntax

Patterns are JavaScript regex strings:
- `$` = end of path (anchors pattern to file/dir name)
- `/` = directory separator
- `\\.` = literal dot (escaped)
- `.*` = match anything

### Testing Your Patterns

```bash
# Check if a file would be denied
file="path/to/.env"
pattern="\\.env$"

# Manually test
node -e "console.log(new RegExp('$pattern').test('$file'))"

# Or check git hooks
git add .env  # Should be rejected by pre-commit hook if pattern is active
```

---

## Rollback Procedures

### If a Violation Blocks Your Work

**Scenario:** KeepBudget validation failed mid-development. You need to unblock.

**Option 1: Temporarily increase limits**
```bash
# Edit CHATELET.json
"maxFiles": 500  # Increase temporarily

# Commit your work
git add .
git commit -m "feat: add feature (budget increased)"

# Plan cleanup in next iteration
```

**Option 2: Move files to external location**
```bash
# Create separate directory outside keep/
mkdir -p ../overflow/
mv keep/large-dataset/ ../overflow/

# Update imports to reference external location
sed -i 's|keep/large-dataset|../overflow/large-dataset|g' src/**/*.ts

# Commit
git add .
git commit -m "refactor: move large files to external location"
```

**Option 3: Restore from previous commit**
```bash
# Find last passing commit
git log --oneline | head -20

# Show what changed
git diff <good-commit> HEAD -- keep/

# Revert to good state
git reset --hard <good-commit>
```

---

## Performance Bottlenecks

### Slow Validation

**Symptom:** `checkKeepBudget()` takes >5 seconds.

**Cause:** Large file counts or massive line counts.

**Mitigation:**
1. Reduce `keep/` directory size (see File Count Exceeded)
2. Move large data to external files
3. Consider splitting `allowedDirs` into smaller scopes
4. Cache results if running validator repeatedly

### Slow Git Hooks

**Symptom:** `git commit` hangs at KeepBudget check.

**Cause:** Validator runs on every commit with full directory scan.

**Mitigation:**
```bash
# Option 1: Cache file stats between commits
# (Not implemented yet, but planned)

# Option 2: Run validator only on keep/ changes
git diff --name-only HEAD | grep "^keep/" | wc -l
# If zero matches, skip validator
```

---

## Debugging Violations

### Enable Debug Logging

```typescript
import { checkKeepBudget } from 'roadmap/chatelet';

const violations = checkKeepBudget(repoRoot, budget);

violations.forEach(v => {
  console.log(`[${v.type}] ${v.message}`);
  console.log(`  Severity: ${v.severity}`);
  console.log(`  Fix: ${v.remediation}`);
  console.log(`  Details:`, v.details);
});
```

### Inspect Budget

```bash
# Print current budget
cat CHATELET.json | jq '.keep, .packs, .gitsafe'

# Count actual files and lines
find keep/ -type f | wc -l                    # File count
find keep/ -type f -exec wc -l {} + | tail -1  # Total lines
```

### Test Individual Violations

```bash
# Test file count only
ls keep/ | wc -l

# Test line count only
find keep/ -type f -exec wc -l {} + | awk '{sum += $1} END {print sum}'

# Test directory restrictions
find keep/ -type f | awk -F/ '{print $2}' | sort -u
# Compare against allowedDirs in CHATELET.json
```

---

## FAQ

**Q: Can I exclude files from KeepBudget?**
A: No. KeepBudget enforces all files under `allowedDirs`. If you need to exclude something, move it outside `keep/` or adjust `allowedDirs`.

**Q: Why can't I use glob patterns in allowedDirs?**
A: Simplicity and performance. Glob patterns are expensive at scale. Use directory-level organization instead.

**Q: What if I have multiple independent keep/ directories?**
A: Use multiple entries in `allowedDirs`:
```json
"allowedDirs": ["keep/core", "keep/utils", "keep/fixtures"]
```

**Q: How often does KeepBudget run?**
A: On every `git commit` (pre-commit hook). During active development, consider temporarily increasing limits.

**Q: Can I silence KeepBudget warnings?**
A: Warnings are info-only. Errors block commits. Fix errors; warnings are advisory.

**Q: What's the difference between file count and line count limits?**
A: File count prevents directory explosion (many small files). Line count prevents monolithic bloat (few giant files). Use both.

**Q: How do I find which files are causing violations?**
A: See "Debugging Violations" section above. Use `find` and `wc` to identify offenders.

---

## Related Documentation

- `CHATELET.json` schema — `/home/griffin/src/roadmap/src/lib/chatelet/types.ts`
- Validation implementation — `/home/griffin/src/roadmap/src/lib/chatelet/keepbudget.ts`
- Test cases — `/home/griffin/src/roadmap/src/lib/chatelet/__tests__/keepbudget.test.ts`
- Error guidance — `docs/decisions/error-guidance-design.md`
