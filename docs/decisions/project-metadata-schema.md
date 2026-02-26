# Project Metadata Schema (.roadmap.json)

## Problem

Autonomous agents integrate roadmap into multi-repo setups with zero manual config. They need:
- What's already built (init artifacts)
- What needs to exist (term artifacts)
- How to build it (build command, phases)
- What depends on what (sibling repos)

## Solution: ProjectMetadata Schema

File: `.roadmap.json` in project root

```typescript
interface ProjectMetadata {
  readonly projectType: string;           // "TypeScript", "Python", "monorepo", etc
  readonly init: readonly string[];       // Artifacts that exist now
  readonly term: readonly string[];       // Artifacts that should exist
  readonly buildCommand?: string;         // Primary build command
  readonly phases?: readonly PhaseSpec[]; // Manual execution phases
  readonly dependencies?: readonly DependencySpec[];  // Sibling repos
}

interface PhaseSpec {
  readonly id: string;
  readonly desc: string;
  readonly automatic: boolean;            // Can run unattended?
  readonly command?: string;
  readonly reviewer?: string;
  readonly produces?: readonly string[];
  readonly consumes?: readonly string[];
}

interface DependencySpec {
  readonly repo: string;                  // Path to dependency
  readonly consumes: readonly string[];   // What it needs from this repo
  readonly phase: string;                 // "init", "build", "release"
  readonly mustComplete?: boolean;        // Block if not done?
  readonly siblingPath?: string;          // Override resolution for CI
}
```

## Design Decisions

1. **ProjectType as string, not enum** — Users describe their project however they want. No built-in list, no false negatives.

2. **init/term are artifact lists** — Match DAG init/term pattern. init = what exists, term = goal state. Agent measures progress.

3. **Optional phases and buildCommand** — Most projects have one build step. Complex ones specify custom phases with automatic/manual gating.

4. **Dependencies are explicit** — Agent reads .roadmap.json to discover sibling repos, parallel orient them, and detect blocking relationships (mustComplete).

5. **siblingPath for containers** — CI environments don't have relative paths. Env var `ROADMAP_SIBLING_ROOT` or per-dep override allows agent to find repos.

## Usage

Agent workflow:
1. Read `.roadmap.json` (if exists)
2. Extract projectType → inform detector logic
3. Extract init → compare to filesystem → compute position
4. Extract term → compute remaining work
5. Extract dependencies + phases → order work (build deps first)
6. Run buildCommand or phases in order

If `.roadmap.json` missing → fallback to auto-detection (heuristics).

## Validation

- init and term must differ
- Phase IDs must be unique
- Dependencies must reference valid repos
- buildCommand should exist (heuristic check)

## Imports

- `validateProjectMetadata(unknown): boolean` — Type guard
- `readProjectMetadata(root): Promise<ProjectMetadata | null>` — Load from .roadmap.json
- `writeProjectMetadata(root, m): Promise<void>` — Persist
- `validateMetadataConsistency(m): string[]` — Check validity
- `mergeWithDefaults(partial): ProjectMetadata` — Apply defaults

## Related

- `src/lib/project-detector.ts` — Auto-detect metadata if missing
- `src/lib/dependency-resolver.ts` — Read dependencies, build transitive graph
- `src/lib/cross-orient.ts` — Parallel orient sibling repos
