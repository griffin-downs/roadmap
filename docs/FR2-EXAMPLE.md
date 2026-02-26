# FR-2: Cross-Repo Blocking Report — Example

Demonstrates the `blockedBy` feature in action.

## Setup

**Template Repo:**
```bash
template/
  .roadmap/head.json
    nodes:
      auth-module: produces [src/auth/]

  .roadmap.json
    role: "template"
```

**App Repo:**
```bash
app/
  .roadmap/head.json
    nodes:
      wait-for-auth: consumes [template:src/auth/]
      implement-feature: deps: [wait-for-auth]

  .roadmap.json
    dependencies:
      - repo: ../template
        consumes: [src/auth/]
        mustComplete: true
```

## Before Template Publishes

```bash
$ cd app
$ roadmap orient --note "check if unblocked"

{
  "position": "wait-for-auth",
  "produces": [],
  "consumes": [],
  "done": 0,
  "remaining": 3,
  "blockedBy": [
    {
      "repo": "template",
      "position": "auth-module",      // ← where template is
      "waiting": ["src/auth/"],        // ← what we're waiting for
      "repoComplete": false            // ← not done yet
    }
  ]
}
```

**Chart view:**
```bash
$ roadmap chart --deps

⚡ roadmap-adversarial — DAG expansion protocol
  0% (0/3 nodes)
  📍 position: wait-for-auth
  📦 1 dep(s) — use --deps for cross-repo view

template — shared auth module
  33% (1/3 nodes)
  📍 position: auth-module

⏳ blocked by: template → src/auth/ (template at auth-module)
```

## After Template Completes

Template publishes `src/auth/`:

```bash
$ cd template
$ # ... work finishes, src/auth/ exists
$ roadmap orient --note "auth module complete"
{
  "position": "publish-auth",
  "done": 1,
  "complete": true
}

$ roadmap trail --archive
# Committed: "roadmap: archive trail (5 entries)"
```

## App Re-Orients

```bash
$ cd ../app
$ roadmap orient --note "check if template is done"

{
  "position": "implement-feature",    // ← advanced!
  "produces": ["src/feature.ts"],
  "consumes": ["src/auth/"],
  "done": 1,
  "remaining": 2,
  "blockedBy": []                     // ← no more blockers!
}
```

**Chart view:**
```bash
$ roadmap chart --deps

⚡ roadmap-adversarial — DAG expansion protocol
  33% (1/3 nodes)
  📍 position: implement-feature

template — shared auth module
  100% (3/3 nodes)
  📍 position: publish-auth

# No ⏳ blocked by message — we're unblocked!
```

## Key Points

1. **blockedBy shows what's blocking** — repo name, what artifact is missing, where they are
2. **No coupling** — App doesn't enumerate template's internal nodes (wait-for-auth just says "I need src/auth/")
3. **Artifact-level** — Blocking is on produces/consumes, not on internal DAG structure
4. **Visible in two places**:
   - JSON output: `roadmap orient` includes blockedBy array
   - Human view: `roadmap chart --deps` shows ⏳ blocked by message

## Implementation

This is in `src/lib/cross-orient.ts`:

```typescript
export interface CrossOrientation extends Orientation {
  readonly blockedBy: SiblingStatus[];   // What's blocking us
  readonly deps: SiblingStatus[];        // All our dependencies
}

// In crossOrient():
const blockedBy = siblingStatuses.filter(s =>
  !s.satisfied &&                        // artifact missing
  deps.find(d => d.mustComplete)?.       // and we require it
);
```

And displayed in `bin/roadmap.ts`:

```typescript
// cmdOrient() outputs:
if (pos.blockedBy.length) {
  result.blockedBy = pos.blockedBy.map(s => ({
    repo: s.repo,
    position: s.position,
    waiting: s.waiting,      // artifact names
    repoComplete: s.satisfied,
  }));
}

// cmdChart() displays:
if (pos.blockedBy.length) {
  console.log(`  ⏳ blocked by: ${b.repo} → ${b.waiting.join(', ')}`);
}
```

---

**Result:** Adopters can see exactly what's blocking them, where the blocking happens, and what artifact they're waiting for. No guessing.
