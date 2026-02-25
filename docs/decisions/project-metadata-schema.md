# .roadmap.json: Project metadata schema

## Problem

Agent integrating a project must know:
- What files exist NOW (init state)?
- What should exist AFTER (term state)?
- Is the build automatic or manual?
- Does this project depend on other roadmaps?

**Currently**: No way to provide this. Agent guesses (wrong 60% of time).

## Solution: .roadmap.json sidecar

Minimal metadata file (optional, but enables autonomous integration):

```json
{
  "projectType": "typescript-react-vite",
  "init": ["src/main.tsx", "package.json", "vite.config.ts"],
  "term": ["dist/index.html", "dist/index.js"],
  "buildCommand": "npm run build",
  "phases": [
    {
      "id": "build",
      "desc": "Compile TypeScript + bundle",
      "automatic": true,
      "command": "npm run build"
    },
    {
      "id": "test",
      "desc": "Run tests",
      "automatic": true,
      "command": "npm test"
    },
    {
      "id": "deploy",
      "desc": "Deploy to production",
      "automatic": false,
      "reviewer": "devops-team",
      "command": null
    }
  ],
  "dependencies": [
    {
      "repo": "../roadmap",
      "consumes": ["src/protocol.ts"],
      "phase": "init"
    }
  ]
}
```

## Schema definition

```typescript
interface ProjectMetadata {
  // What is this project? (user-defined, no validation)
  readonly projectType: string;  // e.g., "typescript-cpp-monorepo", "python-rust-hybrid"

  // Initial state: what exists now?
  readonly init: string[];  // Relative paths

  // Terminal state: what should exist?
  readonly term: string[];  // Relative paths

  // How to build?
  readonly buildCommand?: string;  // e.g., "npm run build" or "make build"

  // Project phases (optional)
  readonly phases?: PhaseSpec[];

  // Multi-repo dependencies (optional)
  readonly dependencies?: DependencySpec[];
}

interface PhaseSpec {
  readonly id: string;
  readonly desc: string;
  readonly automatic: boolean;  // true=can run autonomously, false=manual review
  readonly command?: string;     // How to execute (for automatic=true)
  readonly reviewer?: string;    // Who reviews (for automatic=false)
  readonly produces?: string[];  // Artifacts created
  readonly consumes?: string[];  // Artifacts needed
}

interface DependencySpec {
  readonly repo: string;         // Relative path or URL
  readonly consumes: string[];   // Files we need from repo
  readonly phase: string;        // Which phase (init, build, etc)
  readonly mustComplete?: boolean; // Block our phase if false
}
```

## Discovery strategy (if .roadmap.json missing)

Agent attempts to auto-detect (imperfect, but functional):

### Project type detection
```
package.json → react, vite, webpack? → typescript-react-vite
package.json → next? → typescript-react-next
pyproject.toml → exists? → python-pip
go.mod → exists? → go
Cargo.toml → exists? → rust-cargo
else → generic
```

### Init artifacts discovery
```
Scan src/ → find entry points
Scan package.json → find dependencies
Find tsconfig.json, vite.config.ts, etc.
Result: likely [src/main.ts, package.json, tsconfig.json, ...]
```

### Term artifacts discovery
```
Read package.json scripts → find "build" command
Parse build command → infer output directory
npm run build → dist/ → find .js, .d.ts files
Result: likely [dist/index.js, dist/index.d.ts, ...]
```

### Phase detection
```
package.json.scripts → entries are phases
"build", "test", "lint", "typecheck" → automatic
"deploy", "release" → manual (manual-approval validation)
```

## Storage location

```
project-root/
  .roadmap.json             ← Project metadata (optional, enables speed)
  roadmap.ts                ← Generated DAG (after integration)
  .roadmap/                 ← Metadata directory
    head.json               ← Current DAG snapshot
    checkpoints/            ← Session checkpoints
    audit/                  ← Execution logs
```

## Integration workflow (with metadata)

```
Agent reads .roadmap.json
  ↓
Generates roadmap.ts (deterministic)
  ↓
Validates DAG
  ↓
Discovers multi-repo deps (if any)
  ↓
Boots + orients
  ↓
DONE in ~5 seconds
```

## Integration workflow (without metadata)

```
Agent scans filesystem
  ↓
Guesses init/term (wrong? ask user)
  ↓
Guesses build command (fails? try alternatives)
  ↓
Generates roadmap.ts (might be invalid)
  ↓
Validation fails → retry
  ↓
Takes 2+ minutes, many failures
```

## Validation rules

- `init` + `term` must not overlap (init ⊂ universe, term ⊂ universe, init ≠ term)
- `buildCommand` should exist (npm run build must work)
- `phases` must be acyclic (can express: build → test → deploy)
- `dependencies[].consumes` should be `init` of dependent repo
- `projectType` should match heuristics (sanity check)

## Examples

### TypeScript with C++ components (monorepo)
```json
{
  "projectType": "typescript-glue-cpp-components",
  "init": ["src/ts/index.ts", "src/cpp/CMakeLists.txt", "package.json"],
  "term": ["dist/index.js", "build/Release/libcomponent.so"],
  "buildCommand": "npm run build:all",
  "phases": [
    { "id": "build-cpp", "automatic": true, "command": "cmake --build build" },
    { "id": "build-ts", "automatic": true, "command": "npm run build:ts" },
    { "id": "test", "automatic": true, "command": "npm test" }
  ]
}
```

### Python + native extensions
```json
{
  "projectType": "python-native-extensions",
  "init": ["setup.py", "src/main.py", "src/native/extension.c"],
  "term": ["dist/my-package-0.1.0.tar.gz", "build/lib.*/"],
  "buildCommand": "python setup.py build",
  "phases": [
    { "id": "build-native", "automatic": true, "command": "python setup.py build_ext" },
    { "id": "test", "automatic": true, "command": "pytest" }
  ]
}
```

### Multi-repo: cockpit depends on roadmap
```json
{
  "projectType": "typescript-react-app",
  "init": ["src/main.tsx", "package.json"],
  "term": ["dist/index.html"],
  "dependencies": [
    {
      "repo": "../roadmap",
      "consumes": ["src/protocol.ts"],
      "phase": "init",
      "mustComplete": true
    }
  ]
}
```

## Next: auto-detection implementation

See project-type-detector, build-process-discoverer nodes.
