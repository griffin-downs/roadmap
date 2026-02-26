# Module Map — Roadmap Library Structure

Complete index of all modules and their exports.

## Hierarchy

```
roadmap/
├── protocol          Core DAG operations
├── recovery          Checkpoint + audit trail
├── predicates        Artifact detection
├── validation        Contract checking
├── versioning        Migration + loading
├── agent             Sealed API (no DAG introspection)
└── (root)            Full API (backward compat)
```

## By Module

### protocol — src/protocol.ts
Core DAG operations. **Always start here.**

```typescript
export {
  define,           // Validate structure
  verify,           // Validate contracts
  check,            // Validate termination
  order,            // Linear topo sort
  parallelOrder,    // Batched topo sort
  orient,           // Find position
  reconcile,        // Merge gaps
  branch,           // Extract subgraph
  merge,            // Combine DAGs
  type Graph,
  type NodeSpec,
  type Orientation,
  type Gap,
}
```

**Entry:** `roadmap/protocol`

### recovery — src/checkpoint.ts + src/audit.ts

Checkpoint and audit trail.

```typescript
export {
  type Checkpoint,
  createCheckpoint,
  CheckpointManager,
  type AuditTrail,
  recordTrail,
  readTrail,
}
```

**Entry:** `roadmap/recovery`

### predicates — src/predicates.ts

Artifact detection for orientation.

```typescript
export {
  fileExists,
  siblingArtifactExists,
  gitArtifactAt,
  any,
  type Predicate,
}
```

**Entry:** `roadmap/predicates`

### validation — src/validation.ts

Contract validation.

```typescript
export {
  validateNode,
  validateGraph,
  type ValidationRule,
}
```

**Entry:** `roadmap/validation`

### versioning — src/versioning.ts

DAG loading and migration.

```typescript
export {
  loadDAG,
  migrate,
  type Version,
}
```

**Entry:** `roadmap/versioning`

### agent — src/agent.ts

Sealed API for agents (no DAG introspection).

```typescript
export {
  getBrief,
  advance,
  checkpoint,
  restore,
  type Brief,
  type Handoff,
}
```

**Entry:** `roadmap/agent`

### Main — src/index.ts

Backward-compatible full API.

**Includes:** all exports from protocol, recovery, predicates, validation, versioning

**Entry:** `roadmap`

## Sub-Modules (Internal Use)

Not part of public API, but grep-friendly:

- `src/lib/project-metadata.schema.ts` — metadata types
- `src/lib/dependency-resolver.ts` — multi-repo discovery
- `src/lib/cross-orient.ts` — parallel orientation
- `src/lib/auto-integrate.ts` — project integration
- `src/lib/build-discoverer.ts` — build command detection

**These are re-exported at top level for convenience:**
- `src/project-metadata.schema.ts` ← `src/lib/project-metadata.schema.ts`
- `src/dependency-resolver.ts` ← `src/lib/dependency-resolver.ts`
- etc.

## File Headers

Every file has structured headers for grep discovery:

```typescript
// @module protocol
// @exports define, verify, check, order, ...
// @types Graph, NodeSpec, Orientation, ...
// @entry roadmap/protocol
```

**Find all exports:**
```bash
grep -h "@exports" src/*.ts | sort | uniq
```

## Entry Points Summary

| Entry | Use Case |
|-------|----------|
| `roadmap` | Everything (backward compat) |
| `roadmap/protocol` | Core DAG work |
| `roadmap/recovery` | Checkpoints + audit |
| `roadmap/predicates` | Orientation setup |
| `roadmap/agent` | Agent sealed API |
| `roadmap/validation` | Validation rules |
| `roadmap/versioning` | DAG loading |

## Size by Module

Approximate compiled size (uncompressed):

| Module | Size | Impact |
|--------|------|--------|
| protocol | 15 KB | Required |
| recovery | 8 KB | Optional |
| predicates | 3 KB | With protocol |
| validation | 2 KB | Optional |
| versioning | 2 KB | For DAG load |
| agent | 1 KB | Sealed API |
| **Total** | **31 KB** | Minified: ~10 KB |

Use sub-entry-points for tree-shaking.

## See Also

- Each module's `@entry` link points to documentation
- `docs/decisions/entry-points-design.md` — design rationale
- `src/index.ts` — re-export implementation
