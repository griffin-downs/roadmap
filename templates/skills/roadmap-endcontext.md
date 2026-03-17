---
name: roadmap-endcontext
description: Persist learnings and close session cleanly
user-invocable: true
---

# roadmap-endcontext

Close a session. The goal is durability — not a summary, not a doc dump.

Run `/roadmap-review` first to catch dropped threads. The human should have already triaged what matters.

## Mutation Rules

```
╭─────────────────────────────────────────────────────────────────╮
│ CLAUDE.md                                                       │
│   mutate    anchored sections (<!-- topic:start/end -->)         │
│             architectural knowledge that evolved                 │
│   append    new anchored references to docs                     │
│   never     session-specific context (that's a spec)            │
│             TODOs or task lists (that's a DAG)                  │
│             delete someone else's section                       │
╰─────────────────────────────────────────────────────────────────╯

╭─────────────────────────────────────────────────────────────────╮
│ docs/                                                           │
│   create    specs, ADRs, design docs — things with shelf life   │
│   never     session logs, scratch notes, "what I did today"     │
│             anything that expires — use handoffs instead         │
│   rule      if it won't matter in 3 DAG iterations, don't file  │
╰─────────────────────────────────────────────────────────────────╯

╭─────────────────────────────────────────────────────────────────╮
│ .roadmap/                                                       │
│   append    trail.jsonl, completed.json, .handoff/*.json        │
│   mutate    head.json (via roadmap CLI only)                    │
│   immutable heads/*.json (archived, never edit)                 │
│   never     direct edits — always through roadmap CLI           │
╰─────────────────────────────────────────────────────────────────╯
```

## What Goes Where

```
  ephemeral              → handoff entry (via roadmap advance)
                           the handoff travels with the DAG lifecycle

  actionable             → successor spec (via /roadmap-spec)
                           learnings → node descriptions + validators
                           replaces: TODO lists, session docs, "notes for next time"

  permanent              → CLAUDE.md anchored section
                           architectural invariants, module boundaries,
                           known constraints that transcend any single DAG

  cross-repo             → CLAUDE.md in BOTH repos
                           if work in A affects B, both repos need the note

  nothing else gets written to the repo.
```

## Step 1: Persist

```
  act on what /roadmap-review surfaced and the human triaged:

  permanent learning?        → CLAUDE.md (anchor to doc if long)
  actionable item?           → successor spec node (should already exist)
  architectural decision?    → docs/adr/NNN-*.md, anchor in CLAUDE.md
  cross-repo impact?         → note in both repos' CLAUDE.md
```

## Step 2: Boot Prompt

After everything is durable, the boot prompt is thin — it points, not contains.

```markdown
## Context

<1 sentence: what repo, what intent>

## Start

Run `/roadmap-orient` — position is truth.
Read this repo's CLAUDE.md for execution protocol and known issues.

## Skills

- `/roadmap-auto` — autonomous execution
- `/roadmap-spec` — design new spec
- `/roadmap-review` — session completeness check
- `/roadmap-endcontext` — when wrapping up

## State

<branch, clean/dirty>
<"successor spec created" or "DAG in progress at node X">

## Decisions

<2-3 bullets, or: "see docs/adr/">

## Next Move

<one line: what to do first>
```

## Values

```
  the boot prompt is a pointer, not a container
  if it's ephemeral → handoff. permanent → CLAUDE.md. actionable → spec.
  the DAG is the session record — trail, handoffs, completions
  session docs are an antipattern — they're durable but not useful
  the next agent runs /roadmap-orient and the DAG tells it what to do
```

## Chain

```
  this skill is the end of the cycle
  the boot prompt tells the next agent: /roadmap-orient
  full chain: orient → auto → spec → review → endcontext → orient
```
