---
name: roadmap-orient
description: Self-orient at session start — roadmap position, fleet state, what to do next
user-invocable: true
---

🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪

# roadmap-orient

First thing every session. Find out where you are before you do anything.

## What to do

```bash
roadmap orient --note "session start"
```

This is the source of truth. Auto-detects fleet.json for cross-repo state. Never infer position from git log or file inspection — orient returns it.

## Read the output

```
  position       which nodes are ready to work
  briefs         per-node: what to produce, what to consume, pattern
  done           how many nodes completed
  remaining      how many left
  chainReady     true = DAG complete, check successorProposal
  chain          iteration number, root intent, predecessor
  suggestedSkill the next skill to invoke — follow it
```

If fleet.json exists (auto-detected):
```
  repos          per-repo status: active, complete, stalled, no-dag
  activeDAGs     all incomplete DAGs per repo (not just head.json)
  globalFrontier all unblocked nodes across all repos
  blockers       cross-repo dependencies not yet satisfied
```

## Present richly

Parse the orient JSON and render the full DAG topology for the human. Show every batch, every node, completion status, and the current position. The human should see the whole shape at a glance.

```
┌──────────────────────────────────────────────────────────────┐
│  🔮 api-platform — B3 of 11 │ 8/42 done                     │
├──────────────────────────────────────────────────────────────┤
│  B0  ( 1) init ✅                                            │
│  B1  ( 3) build-api ✅ │ build-auth ✅ │ build-cache ✅      │
│  B2  ( 4) wire-api ✅ │ wire-auth ✅ │                       │
│           run-migration ✅ │ seed-data ✅                    │
│  B3  (13) [🧪 deploy-frontend] [🧪 deploy-worker]            │
│           [🧪 verify-contracts] [🧪 verify-routes]           │
│           [🧪 smoke-tests]  ←── you are here                 │
│  B4  ( 6) integration │ e2e │ load-tests                     │
│  B5  ( 2) staging │ canary                                   │
│  B6  ( 1) term                                               │
├──────────────────────────────────────────────────────────────┤
│  📡 fleet: 5 frontier nodes across 2 repos                   │
└──────────────────────────────────────────────────────────────┘
```

Adapt the display to the DAG's actual shape. Wide batches get wrapped. Fleet data gets a footer. Color bars (🟥🟧🟨🟩🟦🟪) separate sections. Every scroll lands on something worth looking at.

For fleet orient, show per-repo status with their active DAGs:

```
┌─── FLEET ────────────────────────────────────────────────────┐
│  api       api-platform              ████████░░░░░░░░░░ B3   │
│  web       web-frontend              ██████████████████ DONE │
│  infra     (no DAG)                                          │
├──────────────────────────────────────────────────────────────┤
│  globalFrontier: 5 nodes (5 api, 0 web)                      │
│  blockers: deploy-worker waits on web build artifacts        │
└──────────────────────────────────────────────────────────────┘
```

## Then what

```
  position has nodes?    → /roadmap-auto (autonomous execution)
  chainReady: true?      → /roadmap-term (assess before chaining)
  no DAG?                → /roadmap-spec (design one)
  fleet has blockers?    → surface which repos are blocking which
  end of session?        → /roadmap-term (persist + handoff)
```

## The chain

```
  orient → auto → spec → term → orient
  every skill points to the next
  orient is always the entry point and the re-entry point
```

## Read the repo's CLAUDE.md

After orient, read the repo's CLAUDE.md. It may have:
- Execution protocol specific to this repo
- Known issues to check before starting
- Anchored docs to read for context
- Architecture decisions that constrain your work

Orient tells you *where*. CLAUDE.md tells you *how*.

🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪

💀 *position is truth · find out where you are before you do anything*
