# Agent Spec-Kit Brief Guide

How to generate, customize, and consume agent briefs for spec-kit-driven roadmap execution.

## When to Use What

| Situation | Tool | Output |
|-----------|------|--------|
| Raw requirements exist, no spec yet | `/speckit.specify` | `<dag-id>-spec.md` |
| Spec exists, need implementation plan | `/speckit.plan` | `<dag-id>-plan.md` |
| Plan exists, need importable tasks | `/speckit.tasks` | `<dag-id>-tasks.md` |
| Tasks imported, need agent context | `generateAgentBrief()` | Markdown brief with YAML frontmatter |
| Node already in DAG with desc/produces/consumes | Roadmap node descriptions directly | No brief needed |

**Rule of thumb:** Use `generateAgentBrief()` when agents need spec-kit context (workspace layout, spec file discovery, pipeline commands). Use roadmap node descriptions when the node is self-contained and consumes only produced artifacts, not spec documents.

## The Spec-Kit Pipeline

```
constitution → specify → plan → tasks → import → orient → brief
```

Each stage produces a file in `.roadmap/spec/`:

```
.roadmap/spec/
  fr-auth-001-pre-spec.md    # raw requirements
  fr-auth-001-spec.md        # structured scenarios
  fr-auth-001-plan.md        # decomposition
  fr-auth-001-tasks.md       # importable nodes
```

After import, `generateAgentBrief()` assembles position + spec context into a single markdown document agents consume at spawn.

## Generating a Brief

### Example 1: Basic Brief Generation

```typescript
import { generateAgentBrief } from 'roadmap/spec-kit';
import { orient, fileExists } from 'roadmap/protocol';
import { loadDAG } from 'roadmap/versioning';

const g = loadDAG('.roadmap/head.json');
const pos = orient(g, fileExists('.'));

const brief = generateAgentBrief({
  dagId: 'fr-auth-001',
  intent: 'Implement JWT refresh token rotation with sliding window expiry',
  orientation: pos,
  specKitWorkspace: '.roadmap/spec/',
});

console.log(brief.markdown);
// → YAML frontmatter + position + produces + consumes + spec files + next steps
```

### Example 2: Node-Scoped Brief

Override orientation-level produces/consumes with node-specific lists:

```typescript
const brief = generateAgentBrief({
  dagId: 'fr-auth-001',
  intent: 'Write the token rotation middleware',
  orientation: pos,
  specKitWorkspace: '.roadmap/spec/',
  nodeProduces: ['src/middleware/token-rotation.ts'],
  nodeConsumes: ['src/auth/types.ts', '.roadmap/spec/fr-auth-001-spec.md'],
});
```

The agent sees only its own contract — not the full batch produces/consumes.

### Example 3: Orchestrator Dispatch

Generate briefs for all nodes in the current batch:

```typescript
import { parallelOrder, orient, fileExists } from 'roadmap/protocol';

const g = loadDAG('.roadmap/head.json');
const pos = orient(g, fileExists('.'));

for (const nodeId of pos.position) {
  const node = g.nodes[nodeId];
  const brief = generateAgentBrief({
    dagId: g.id,
    intent: node.desc,
    orientation: pos,
    specKitWorkspace: '.roadmap/spec/',
    nodeProduces: node.produces,
    nodeConsumes: node.consumes,
  });
  // Spawn agent with brief.markdown as prompt context
}
```

## Brief Structure

The generated markdown follows a fixed structure:

```yaml
---
dagId: "fr-auth-001"
level: 3
position: ["token-rotation", "token-validation"]
batchComplete: false
done: 5
remaining: 12
produces: ["src/middleware/token-rotation.ts"]
consumes: ["src/auth/types.ts"]
specKitWorkspace: ".roadmap/spec/"
---
```

Sections after frontmatter:

| Section | Content |
|---------|---------|
| Intent | What the agent should accomplish |
| Position | Batch level, completeness, remaining count |
| Produces | Files this agent must create |
| Consumes | Files this agent reads (contract boundary) |
| Spec Files | Discovered files in the workspace |
| Next Steps | Pipeline commands if spec work remains |
| Troubleshooting | Common failure modes and fixes |

## Intent Formulation

Intent is the single most important field. It determines what the agent does.

**Good intents** — specific, bounded, falsifiable:

```
"Implement JWT refresh token rotation with sliding window expiry per RFC 6749 Section 6"
"Write SQLite CRUD layer consuming shared/types.ts, producing electron/db.ts"
"Add plan clarity validation: extract PlanClarityGap from vague nodes, emit fix-node proposals"
```

**Bad intents** — vague, unbounded, unmeasurable:

```
"Work on authentication"
"Improve the database layer"
"Fix things"
```

An intent that cannot fail is not an intent — it is a wish.

## Error Recovery

### `/speckit.plan` Fails

The plan stage may reject if the spec is incomplete or contradictory.

1. Read the error output — it names the missing section or conflict
2. Fix `<dag-id>-spec.md` (add missing scenarios, resolve contradictions)
3. Re-run `/speckit.plan`
4. Do NOT skip to `/speckit.tasks` — tasks derived from a broken plan inherit its defects

### `roadmap import` Rejects

Import validates task structure before committing to `head.json`.

```
Error: Task "setup-db" consumes "src/schema.ts" but no task produces it

Fix: Add "src/schema.ts" to the produces list of the task that creates it
```

Common causes:
- **Dangling consumes** — a task reads a file no other task produces. Fix: add it to the producer's `produces[]`.
- **Cycle** — tasks form a circular dependency. Fix: break the cycle by splitting one task.
- **Missing init/term** — import requires synthetic bookend nodes. Fix: let import generate them (default behavior) or add them manually.
- **Duplicate IDs** — two tasks share an ID. Fix: rename one.

After fixing, re-run:
```bash
roadmap import --from speckit .roadmap/spec/<dag-id>-tasks.md --id <dag-id>
```

### Brief Generation Fails

`generateAgentBrief()` is pure — it reads orientation and workspace, nothing else. Failures are input errors:

- **Orientation is stale** — re-run `orient()` before generating
- **Workspace path wrong** — check that `.roadmap/spec/` exists and contains files
- **No spec files found** — run the pipeline first (`specify` → `plan` → `tasks`)

## Common Patterns

### Pattern: Spec-First Node Design

Write the spec before the DAG. The spec surfaces entities, scenarios, and edge cases. Nodes map 1:1 to scenarios.

```
pre-spec.md  →  spec.md (3 scenarios)  →  plan.md (3 nodes)  →  tasks.md  →  import
                                                                              ↓
                                                          head.json with 3 execute nodes
```

### Pattern: Brief as Agent Prompt

Pass the brief markdown directly as the agent's system prompt or initial context:

```typescript
const brief = generateAgentBrief({ ... });

// Claude Code agent
spawnAgent({
  prompt: brief.markdown,
  // Agent receives: position, contract, spec files, commands
});
```

The brief is self-contained — the agent does not need to read `head.json` or discover workspace layout.

### Pattern: Plan Node Expansion via Spec-Kit

Plan nodes (`mode: 'plan'`) can use spec-kit to expand into execute nodes:

```typescript
// Agent spawned for plan node reads the brief
// Brief says: mode = 'plan', produces = []
// Agent runs: /speckit.specify → /speckit.plan → /speckit.tasks
// Output: expansion script that adds child execute nodes
// Parent plan node completes via { type: 'expanded' } validation
```

## Pitfalls

1. **Stale orientation in brief** — generating a brief, then completing nodes, then spawning agents with the old brief. Always generate briefs immediately before dispatch.

2. **Workspace path mismatch** — `.specify/` (legacy) vs `.roadmap/spec/` (current). The brief generator does not fall back — it reads exactly the path you give it.

3. **Overloaded intent** — cramming multiple objectives into one intent string. If the intent has "and" in it, the node should probably be two nodes.

4. **Ignoring consumes** — agents that read files not listed in `consumes` break the contract boundary. The brief lists consumes explicitly; agents should treat it as an allowlist.

5. **Skipping pipeline stages** — jumping from `pre-spec.md` to `tasks.md` produces shallow, untested task decompositions. Each stage adds structure the next stage depends on.
