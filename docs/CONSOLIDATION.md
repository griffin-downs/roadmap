# Roadmap DAG Consolidation

This document explains how the roadmap consolidation system works, how to use it, and how to troubleshoot common issues.

## Quick Start

### For Existing Projects

If you have multiple roadmap DAG files (e.g., `typescript-cleanup-001.json`, `dispatch-system-001.json`), consolidation happens automatically:

```bash
roadmap orient  # Discovers and merges all .roadmap/*.json files
roadmap chart   # Shows unified view
```

No manual DAG switching needed.

### First-Time Consolidation

If you're consolidating separate DAGs for the first time:

```bash
# Review what will be consolidated (dry-run)
npx tsx scripts/consolidate-existing-dags.ts --dry-run

# Perform consolidation with backup
npx tsx scripts/consolidate-existing-dags.ts --backup

# Commit the result
git add .roadmap/head.json .roadmap/head-index.json
git commit -m "consolidation: merge all DAGs into single head.json"
```

## How It Works

### Auto-Merge on Every Query

When you run any roadmap command (orient, chart, show, complete):

1. **Discovery** — Scans `.roadmap/` for all `*.json` files (excluding `head.json`, `head-index.json`, system files)
2. **Merge** — Detects inter-DAG connections (artifact overlap detection) and creates a unified graph
3. **Validation** — Checks cross-DAG dependencies, propagated constraints, and protocol conformance
4. **Indexing** — Extracts lightweight metadata for fast batch lookups
5. **Caching** — Results are cached in `head.json` and `head-index.json`

### Discovery & Filtering

Consolidation discovers:
- **Included**: `*.json` files in `.roadmap/` that have DAG schema (`id`, `desc`, `init`, `term`, `nodes`)
- **Excluded**: `head.json`, `head-index.json`, `git-state.json`, `hook-config.json`, system/temp files

Files are merged in **deterministic order** (sorted by filename) for reproducible results.

### Merge Algorithm

1. Load each DAG file into `Graph<string>` objects
2. For each pair of consecutive DAGs:
   - Check if first DAG's terminal node produces artifacts consumed by next DAG's initial node
   - If match: create cross-DAG dependency edge
   - If no match: still merge (allows modular independent DAGs)
3. Run protocol validation (`define()`, `verify()`, `check()`)
4. Return single unified graph with all nodes

### Cross-DAG Validation

When merging, consolidation checks:

- **Artifact Flow** — Consumes are satisfied by upstream produces
- **Phase Boundaries** — Dependencies respect phase ordering (no backward edges)
- **Propagated Rules** — `artifact-exists` rules derived from terminal nodes are preserved
- **Circular Dependencies** — Rejects cyclic DAGs (checked in each source + merged result)

If validation fails, consolidation stops with clear error messages and context.

### Index Extraction

After merging, a lightweight index is extracted:

```json
{
  "id": "merged-consolidated",
  "desc": "...",
  "sourceDAGs": ["typescript-cleanup-001.json", "dispatch-system-001.json"],
  "timestamp": "2026-03-02T...",
  "entries": [
    {
      "id": "node-a",
      "phase": "typescript-cleanup-001",
      "produces": ["artifact-x"],
      "consumes": ["artifact-x"],
      "deps": ["node-b"],
      "desc": "..."
    },
    ...
  ],
  "phaseMap": { "typescript-cleanup-001": ["node-a", "node-b"], ... },
  "nodeToPhase": { "node-a": "typescript-cleanup-001", ... }
}
```

This index enables:
- Fast producer/consumer lookups (no full DAG traversal)
- Phase-based filtering
- Critical path analysis
- Lazy loading of only current + next batch

### Lazy Loading Strategy

The `LazyGraphLoader` minimizes memory and token usage:

- **Always load**: Index (lightweight metadata)
- **On demand**: Full graph specs based on strategy:
  - `minimal` — Index only (for queries that don't need full DAG)
  - `current-batch` — Current batch + upstream dependencies
  - `current-plus-next` — Current + next batch (default for CLI)
  - `full` — Entire merged DAG

CLI commands use `current-plus-next` for zero-latency lookups.

### Pre-Commit Hook Validation

When you commit changes to `.roadmap/` files, the pre-commit hook:

1. Validates `head.json` JSON structure
2. Runs protocol `define()` check (rejects cycles, missing init/term)
3. If DAG files changed: regenerates and stages `head-index.json`
4. Ensures no stale state commits

Bypass with: `SKIP_ROADMAP_CHECK='reason' git commit` (not recommended)

## Adding New DAGs

### Step 1: Create New DAG File

Add your DAG to `.roadmap/<name>.json`:

```json
{
  "id": "my-feature-001",
  "desc": "My feature implementation plan",
  "init": "setup",
  "term": "complete",
  "nodes": {
    "setup": { ... },
    "complete": { ... }
  }
}
```

### Step 2: Verify Merge

The next `roadmap orient` will auto-discover and merge:

```bash
roadmap orient
roadmap chart  # View merged result
```

### Step 3: Fix Any Validation Errors

If consolidation fails, check:
- **Unresolved consumes**: Artifacts consumed but not produced by any predecessor
- **Dangling deps**: Node dependencies that don't exist in merged graph
- **Phase barrier violations**: Backward dependencies across phases
- **Circular deps**: Nodes that depend on their own descendants

Examples:

```
❌ Unresolved consume: node-a consumes "src/index.ts" but no producer found
   → Add "src/index.ts" to some node's produces array

❌ Phase barrier violation: node-b (phase-2) depends on node-c (phase-2)
   → Phase ordering is same; fine if it's within-phase. Check DAG structure.

❌ Dangling dep: node-x depends on "missing-node"
   → Node "missing-node" doesn't exist. Fix the dependency.
```

### Step 4: Commit

```bash
git add .roadmap/<name>.json
git commit -m "roadmap: add <name> DAG"
# Hook will auto-regenerate head-index.json
```

## Troubleshooting

### Q: "No DAGs found" error

**Cause**: No `.roadmap/*.json` files discovered (or all filtered as system files)

**Fix**:
```bash
ls -la .roadmap/*.json
# Verify you have at least one custom DAG file
# Check it's not in the excluded list (head.json, head-index.json, etc.)
```

### Q: "head.json is invalid" from pre-commit hook

**Cause**: `head.json` has JSON syntax error or protocol violation

**Fix**:
```bash
# Check JSON validity
jq . .roadmap/head.json

# Check protocol conformance
npx tsx -e "
  import { define } from './src/protocol.ts';
  const g = JSON.parse(require('fs').readFileSync('.roadmap/head.json', 'utf-8'));
  try { define(g); console.log('✅ Valid'); } catch(e) { console.error(e.message); }
"
```

### Q: Index out of sync with head.json

**Cause**: `head.json` was edited manually without regenerating index

**Fix**:
```bash
# Regenerate index
npx tsx scripts/consolidate-existing-dags.ts

# Or let the hook do it:
git add .roadmap/head.json
git commit  # Hook will regenerate and auto-stage head-index.json
```

### Q: "Validation failed: unresolved consume" after merge

**Cause**: New DAG's initial node consumes something no predecessor produces

**Fix**:
1. Identify the missing artifact from error message
2. Check which node should produce it
3. Add artifact to that node's `produces` array
4. Rerun consolidation

Example:
```json
// DAG1 (final node)
"term-node": {
  "produces": ["output-artifact"],  // ← Add this if missing
  ...
}

// DAG2 (initial node)
"init-node": {
  "consumes": ["output-artifact"],
  ...
}
```

### Q: Slow `roadmap orient` after adding many DAGs

**Cause**: Full DAG merge and validation on every query

**Fix**: This is expected for very large DAGs (100+ nodes). Consolidation is still faster than manual switching. If critical:
- Use lazy loading: `LazyGraphLoader` with `current-batch` strategy
- Split DAGs into smaller, more focused ones
- Cache the merged result (consolidation already does this)

### Q: "baseSha not found" or version mismatch

**Cause**: `baseSha` field was lost during consolidation

**Fix**: `baseSha` is preserved from existing `head.json` if present. If lost:
```bash
# Set it manually (check git history for original value)
jq '.baseSha = "abc123def456"' .roadmap/head.json | sponge .roadmap/head.json
git add .roadmap/head.json
git commit -m "fix: restore baseSha"
```

## API Reference

### Core Functions

#### `loadDAGWithAutoMerge(roadmapRoot, strategy?)`

Loads and merges all DAGs transparently. Returns the consolidated graph.

```typescript
const result = await loadDAGWithAutoMerge(process.cwd(), 'current-plus-next');
console.log(result.graph);  // Unified Graph<string>
console.log(result.isMerged);  // true if multiple DAGs merged
```

#### `discoverDAGFiles(roadmapRoot)`

Discovers all DAG files in `.roadmap/`.

```typescript
const dagFiles = await discoverDAGFiles(process.cwd());
dagFiles.forEach(f => console.log(f.name, f.content.id));
```

#### `mergeMultiWay(dagFiles)`

Merges multiple DAG files into one.

```typescript
const result = mergeMultiWay(dagFiles);
console.log(result.merged);      // Consolidated Graph<string>
console.log(result.phases);      // { "dag1": [...nodeIds], "dag2": [...] }
console.log(result.connections); // Inter-DAG edges
```

#### `extractMetadataIndex(mergeResult)`

Extracts lightweight index from merged result.

```typescript
const index = extractMetadataIndex(mergeResult);
const producers = index.entries.filter(e => e.produces.includes('artifact-x'));
```

#### `LazyGraphLoader`

Lazy-loads graph with caching and load strategies.

```typescript
const loader = new LazyGraphLoader(process.cwd());
const index = await loader.loadIndex();  // Always lightweight
const graph = await loader.loadGraph('current-plus-next');  // On demand
```

#### `validateCrossDAGDependencies(mergeResult)`

Validates inter-DAG dependencies.

```typescript
const result = validateCrossDAGDependencies(mergeResult);
if (!result.valid) {
  result.issues.forEach(issue => console.error(issue.message));
}
```

### CLI Commands

```bash
# Auto-merge and show current position
roadmap orient

# Migrate existing DAGs (one-time)
npx tsx scripts/consolidate-existing-dags.ts --dry-run

# Validate roadmap state (used by pre-commit hook)
npx tsx scripts/validate-roadmap-state.ts
```

## Performance Notes

- **Discovery**: O(N) where N = files in `.roadmap/`
- **Merge**: O(N × M log M) where M = nodes per DAG
- **Validation**: O(M²) in worst case (all-to-all dependency check)
- **Indexing**: O(M) single pass

Typical performance:
- 5 DAGs × 20 nodes each: **<100ms** (including validation)
- 10 DAGs × 50 nodes each: **<500ms**
- Cached result reuse: **<10ms** (if no source DAGs changed)

## See Also

- `CONSOLIDATION-DESIGN.md` — Detailed architecture decisions
- `scripts/consolidate-existing-dags.ts` — Migration script
- `scripts/validate-roadmap-state.ts` — Pre-commit hook validator
- `src/lib/roadmap/` — Implementation modules
