# Roadmap Protocol — CLAUDE.md Reconciliation Overlay

Paste this into any existing CLAUDE.md. It does not replace existing instructions — it layers on top. Conflicts resolve in favor of the roadmap protocol (this is the governance layer; your existing instructions are the execution layer).

---

## Roadmap Protocol

**Every interaction that mutates state is roadmap-governed.** Code, files, config, infra, project structure, documentation — if it produces or modifies artifacts, it runs through the DAG. Only pure reasoning (Q&A, explanation, analysis that produces no files) is exempt.

### Classification — apply on every user message

| Type | Test | Roadmap? |
|------|------|----------|
| Reasoning | Answer a question. No files touched. | No |
| Task | Produces or changes any artifact. | **Yes** |
| Planning | Designs what to build. | **Yes** — planning IS a task. It produces a DAG. |

If uncertain, it's a task.

### On session start

1. Look for `bin/roadmap` or `.roadmap/head.json` in the repo.
2. **If found**: run `bin/roadmap orient --note "session start — <intent>"` before doing anything else. This is not optional. The output tells you where you are — position, what's done, what remains. Trust it over memory, context, or prior conversation.
3. **If not found and task is >1 step**: create one.

```bash
mkdir -p .roadmap
# Write minimal head.json — init (current state) → term (goal)
# Then: bin/roadmap orient --note "session start — bootstrapped roadmap"
```

Minimum viable DAG:
```json
{
  "id": "project-name",
  "desc": "what this roadmap governs",
  "init": "init",
  "term": "term",
  "nodes": {
    "init": { "id": "init", "desc": "current state", "produces": [], "consumes": [], "deps": [], "validate": [], "idempotent": true },
    "term": { "id": "term", "desc": "goal state", "produces": [], "consumes": [], "deps": ["init"], "validate": [], "idempotent": false }
  }
}
```

Expand nodes between init and term. 3 nodes is fine for a small task. `define()` catches structural errors — cycles, missing init/term, disconnected nodes.

### During work

- Each logical unit maps to a DAG node. If what you're doing isn't in the DAG, a node is missing — add it.
- After completing a node: `bin/roadmap orient --note "<what changed>"` to record the breadcrumb and verify position advanced.
- Never skip orient. Never infer position from reading files or memory. The DAG is the source of truth.

### On session end

- `bin/roadmap trail --archive` — commits the session's breadcrumbs to git, then truncates the trail file. Previous sessions' trails are in git history.

### Conflict resolution with your existing instructions

Your existing CLAUDE.md tells the agent *how* to work (style, conventions, tooling, constraints). The roadmap protocol tells it *what* to work on and *when*. They compose:

| Your instructions say | Roadmap says | Resolution |
|----------------------|--------------|------------|
| "Use pytest for tests" | "Node X produces tests/" | Write tests with pytest. Node X tracks it. |
| "Always run lint before commit" | "orient after completing a node" | Lint, then orient. Both happen. |
| "Don't modify files without asking" | "Task is roadmap-governed" | Ask before modifying, but the DAG still tracks what's planned. |
| "Use feature branches" | "bin/roadmap branch <name>" | Roadmap branch command creates the git branch. |

If your instructions conflict with the protocol on *sequencing* or *state tracking*, the protocol wins. If they conflict on *style* or *conventions*, yours win.

### What changes about how the agent works

**Before**: Agent reads the codebase, makes a plan in its head, executes, maybe writes a summary.

**After**: Agent orients in the DAG, sees what's next, executes that node, records a breadcrumb, advances. Every session is a continuation of a structured plan, not a fresh start. Handoffs between sessions are explicit — the trail shows what happened, orient shows where to resume.

**The agent cannot**:
- Start work without orienting
- Work on something not in the DAG (must add a node first)
- Claim progress without the trail recording it
- Skip steps — DAG deps enforce ordering

**The agent gains**:
- Instant reorientation (one command vs. reading files to guess position)
- Session continuity (trail + git history)
- Structural guarantees (cycles, contracts, ordering validated by the protocol)

### Installation

Copy `bin/roadmap` and `bin/roadmap.ts` from `~/src/roadmap/` into your repo's `bin/`. Or add `roadmap` as a dependency. The CLI needs Node.js with `--experimental-strip-types` (handled by the wrapper script).

```bash
cp -r ~/src/roadmap/bin/roadmap ~/src/roadmap/bin/roadmap.ts your-repo/bin/
cp -r ~/src/roadmap/src/ your-repo/node_modules/roadmap/src/  # or npm link
```

Then paste this section into your CLAUDE.md.
