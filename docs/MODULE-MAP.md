# Module Map

## Entry Points

| Import | Use when | Index file |
|--------|----------|------------|
| `roadmap` | Full API — all DAG ops + recovery + versioning + predicates + errors | `src/index.ts` |
| `roadmap/protocol` | Core only — define, verify, orient, merge, branch, reconcile, parallelOrder | `src/protocol.ts` |
| `roadmap/agent` | Sealed agent API — getBrief, advance, checkpoint (no DAG introspection) | `src/index.agent.ts` |
| `roadmap/recovery` | CheckpointManager + AuditTrail | `src/index.recovery.ts` |
| `roadmap/validation` | validateNode, validateGraph | `src/index.validation.ts` |
| `roadmap/versioning` | loadDAG, migration, compatibility | `src/index.versioning.ts` |

## Source Files

### Core (protocol)

| File | Exports | Purpose |
|------|---------|---------|
| `protocol.ts` | define, graph, check, verify, order, parallelOrder, orient, reconcile, merge, branch, analyze, modify, modifyAndCommit, validateNode, validateGraph | DAG operations — the entire protocol |
| `predicates.ts` | fileExists, gitArtifactExists, compound | Curried predicates for orient() |
| `errors.ts` | RoadmapError, ErrorCode | Typed error codes with fix suggestions |
| `orient-cached.ts` | orientCached, updateRoadmapPosition | O(1) orient via .regent/git-state.json cache |

### Agent (sealed)

| File | Exports | Purpose |
|------|---------|---------|
| `brief.ts` | getBrief, loadHandoffJournal | Agent context: current node brief + handoff history |
| `handoff.ts` | checkpoint, advance, verifyBootstrapSignature | Agent lifecycle: checkpoint progress, advance to next node |

### Recovery

| File | Exports | Purpose |
|------|---------|---------|
| `checkpoint.ts` | CheckpointManager | Save/restore per-node checkpoints with artifact hashes |
| `audit.ts` | AuditTrail | Append-only session audit log |

### Versioning

| File | Exports | Purpose |
|------|---------|---------|
| `versioning.ts` | loadDAG, loadDAGFromFile | Load DAG with auto-migration |
| `versioning.schema.ts` | checkCompatibility, migrateDAG | Version checks + migration |
| `migrations.ts` | DAGMigrator | Migration registry (0.1→0.2→0.3) |

### Integration

| File | Exports | Purpose |
|------|---------|---------|
| `auto-integrate.ts` | integrateProject | Detect project type + generate roadmap |
| `auto-integrate-gen.ts` | generateRoadmapSource | Generate roadmap.ts from metadata |
| `build-discoverer.ts` | discoverBuildProcess | Detect build tools (npm, cargo, etc.) |
| `dependency-resolver.ts` | resolveDependencies | Map project deps to roadmap nodes |
| `project-detector.ts` | detectProjectType | Identify project type from filesystem |
| `generate-bootstrap.ts` | generateBootstrap | Scaffold roadmap files for new projects |

### Schemas

| File | Exports | Purpose |
|------|---------|---------|
| `checkpoint.schema.ts` | GitState, Checkpoint types | Checkpoint data shapes |
| `git-state.schema.ts` | readGitState, isFresh | Git state cache reader |
| `project-metadata.schema.ts` | ProjectMetadata type | Project metadata for auto-integration |
| `versioning.schema.ts` | VersionInfo, CompatibilityResult | Version compatibility types |

## Key Types

```typescript
NodeSpec<TAll, TSelf>     // { id, desc, produces, consumes, deps, validate, idempotent }
Graph<T>                  // { id, desc, init, term, nodes, version?, protocolVersion? }
Orientation               // { position, done, produces, consumes, remaining }
Connection                // { forward, backward, artifact }
Gap                       // { between: [string, string], missing: string[] }
Brief                     // Agent context: node desc, produces, consumes, handoff chain
FinalHandoff              // { summary, keyDecisions, gotchas, timestamp, ... }
RoadmapError              // { code: ErrorCode, context: { fix, entry, ... } }
ErrorCode                 // 'POSITION_MISMATCH' | 'CONTRACT_VIOLATION' | ...
```
