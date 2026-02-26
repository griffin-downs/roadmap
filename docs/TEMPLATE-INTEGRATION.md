# Template Repository Integration

Complete guide for using roadmap with template/downstream patterns.

## The Pattern

```
Template Repo (shared infrastructure)
  ↓ publishes artifacts
Consumer Repos (app-a, app-b, app-c)
  ↓ block until artifacts exist
```

## What Already Works

| Need | Solution | Status |
|------|----------|--------|
| Consumer declares template dependency | `.roadmap.json` dependencies | ✅ shipped |
| Orient checks artifact availability | `siblingArtifactExists()` | ✅ shipped |
| Show what's blocking | `blockedBy` in orient output | ✅ shipped |
| Visualize multi-repo progress | `roadmap chart --deps` | ✅ shipped |
| Cross-repo memory/history | `roadmap trail --global` | ✅ shipped |
| Template doesn't enumerate consumers | Consumer-only declaration | ✅ by design |

## Setup: Template + Consumer

### Template Repo

**.roadmap.json** (template doesn't declare consumers):
```json
{
  "projectType": "template",
  "init": ["package.json"],
  "term": ["dist/", "docs/"],
  "buildCommand": "npm run build"
}
```

**.roadmap/head.json** (standard DAG):
```json
{
  "id": "auth-template",
  "nodes": {
    "bootstrap": { "produces": ["package.json"], ... },
    "auth-module": { "produces": ["src/auth/", "dist/lib/auth"], ... },
    "test": { "produces": ["coverage/"], ... },
    "release": { "produces": ["dist/"], ... }
  }
}
```

### Consumer Repo

**.roadmap.json** (consumer declares dependency):
```json
{
  "projectType": "react-app",
  "init": ["package.json"],
  "term": ["dist/", "docs/"],
  "buildCommand": "npm run build",
  "dependencies": [
    {
      "repo": "../auth-template",
      "consumes": ["src/auth/"],        // ← What we need
      "phase": "build",
      "mustComplete": true              // ← Block if not available
    }
  ]
}
```

**.roadmap/head.json** (define what we build):
```json
{
  "id": "app-a",
  "nodes": {
    "bootstrap": { "produces": ["package.json"], ... },
    "wait-for-auth": {
      "produces": ["src/auth-ready.txt"],
      "consumes": ["../auth-template:src/auth/"]  // ← Cross-repo consumption
    },
    "build": {
      "produces": ["dist/"],
      "deps": ["wait-for-auth"]                   // ← Only start after unblocked
    }
  }
}
```

## Workflow

### Template Team

```bash
$ cd auth-template
$ roadmap orient --note "starting auth module"
position: auth-module

$ # Work... multiple commits
$ git commit -m "auth-module: JWT implementation"
$ git commit -m "auth-module: session storage"

$ roadmap orient --note "auth module complete"
position: release

$ roadmap trail --archive  # Mark milestone
```

### Consumer Teams (parallel, async)

```bash
$ cd app-a
$ roadmap orient --note "check if we can start"

# Output shows blocking:
{
  "position": "wait-for-auth",
  "blocked": true,
  "blockedBy": [{
    "repo": "auth-template",
    "position": "auth-module",
    "waiting": ["src/auth/"],
    "repoComplete": false
  }]
}

$ roadmap chart --deps
# Shows template progress and ⏳ blocked by message

# Wait for template...
# When template publishes src/auth/:

$ roadmap orient --note "template done, checking again"

# Output shows unblocked:
{
  "position": "build",
  "blocked": false,
  "blockedBy": []
}
```

## Key Properties

✅ **Template doesn't know consumers**
- No coupling
- Template can be reorganized without breaking consumers
- Consumers can be added/removed freely

✅ **Blocking is artifact-level, not DAG-level**
- Consumer declares "I need src/auth/" not "I need auth-template:auth-module"
- If template restructures nodes, consumers still work
- Tight coupling to DAG structure avoided

✅ **Progress is visible to everyone**
- `roadmap chart --deps` shows all repos at a glance
- `roadmap trail --global` records all milestone events
- No hidden wait states

✅ **Reorientation unblocks automatically**
- Consumer runs `orient` again when they suspect template is done
- Artifact existence is the source of truth
- No manual notification/subscription system needed

## Multi-Consumer Example

Three apps depending on same template:

```bash
$ cd template && roadmap trail --archive
# Publishes auth-template:release

$ cd ../app-a && roadmap orient --note "template done?"
position: build  # ← unblocked

$ cd ../app-b && roadmap orient --note "template done?"
position: build  # ← unblocked

$ cd ../app-c && roadmap orient --note "template done?"
position: build  # ← unblocked
```

All three can now proceed in parallel. No central coordination needed.

## Monitoring Multi-Repo Progress

From any consumer:

```bash
$ roadmap chart --deps

template — auth-template
  100% (3/3 nodes)
  📍 position: release

app-a — React app A
  50% (3/6 nodes)
  📍 position: build

app-b — React app B
  33% (2/6 nodes)
  📍 position: wait-for-auth
  ⏳ blocked by: template → src/auth/ (template at release)

app-c — React app C
  16% (1/6 nodes)
  📍 position: bootstrap
  ⏳ blocked by: template → src/auth/ (template at release)
```

## Constraints & Guarantees

**What works:**
- N consumers depending on 1 template ✅
- 1 consumer depending on N templates ✅
- Nested: template A depends on template B, consumer depends on A ✅
- Template changes while consumers are mid-phase ✅

**What doesn't (and why):**
- Consumer knowing template's internal phases ❌ (couples to DAG structure)
- Template pushing notifications ❌ (consumers poll via orient)
- Automatic cascade reorientation ❌ (overcomplicates; consumer's responsibility)

**Why this design:**
- Loose coupling (template free to evolve)
- Passive coordination (filesystem is source of truth)
- Simple implementation (no event system, registry, or broker)
- Observable & debuggable (chart --deps shows everything)

## See Also

- `docs/FR2-EXAMPLE.md` — detailed example with output
- `docs/GIT-INTEGRATION.md` — git hook system
- `src/lib/cross-orient.ts` — implementation
- `docs/multi-project-patterns.md` — other patterns
