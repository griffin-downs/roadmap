# Orientation — Finding Position

When you enter a roadmap, the first thing is to find where you are.

## The Problem

You have:
- A DAG (phases to execute)
- A filesystem (artifacts that exist)
- No marker saying "you are here"

Where are you in the DAG?

## The Solution

`orient()` answers by comparing artifacts to the DAG:

```typescript
const pos = orient(g, fileExists(cwd()));
// pos.position = "build"  (current node)
// pos.produces = ["dist/"]
// pos.consumes = ["src/**/*.ts"]
// pos.remaining = ["test", "release"]
```

## How It Works

1. **Start at init** (bootstrap node)
2. **Check if produces exist** — if all of init's produces exist, init is satisfied
3. **Move forward** — find the first unsatisfied node
4. **Return position** — current node + what's left to do

## Example

DAG:
```
bootstrap (produces: package.json)
  ↓
build (produces: dist/)
  ↓
test (produces: coverage/)
  ↓
release (produces: release.tar.gz)
```

Filesystem (after build, before test):
```
package.json ✓
dist/ ✓
coverage/ ✗
```

Orientation:
```
position: test
done: [bootstrap, build]
remaining: [test, release]
produces: [coverage/]
consumes: [dist/]
```

## Why It Works

- **Idempotent** — running orient multiple times gives same result
- **Consistent** — filesystem is source of truth
- **Deterministic** — no randomness, no side effects
- **Observable** — can trace why position is what it is

## Example: Session Start

```bash
$ roadmap orient --note "session start — implement feature X"
{
  "position": "build",
  "done": 2,
  "remaining": 3,
  "produces": ["dist/"],
  "consumes": ["src/"],
  "complete": false
}

$ roadmap chart
# Shows visual progress
```

## See Also

- `orient()` in src/protocol.ts
- `predicates.ts` for artifact detection
- `multi-project-patterns.md` for cross-repo orientation
