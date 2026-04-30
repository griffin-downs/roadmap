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
│  🔮 cycle-8-observation-layer — B3 of 11 │ 8/42 done        │
├──────────────────────────────────────────────────────────────┤
│  B0  ( 1) init ✅                                            │
│  B1  ( 3) emission-types ✅ │ keel-relay ✅ │ assay-util ✅  │
│  B2  ( 4) emission-bus ✅ │ use-emission ✅ │                │
│           assay-schema ✅ │ assay-fetch ✅                    │
│  B3  (13) [🧪 emit-gauge] [🧪 emit-alert] [🧪 emit-map]    │
│           [🧪 emit-compass] [🧪 emit-status-bar]            │
│           [🧪 emit-camera] [🧪 emit-text] [🧪 emit-sonar]  │
│           [🧪 emit-control] [🧪 emit-authority]             │
│           [🧪 emit-toolbar] [🧪 emit-telemetry]             │
│           [🧪 check-state-value]  ←── you are here          │
│  B4  ( 6) check-state-match │ check-layout │ emission-http  │
│  B5  ( 2) assay-executor │ emission-ws                       │
│  B6  ( 5) assay-status │ assay-watch │ assay-diff │ tests   │
│  B7  ( 3) cross-sync │ cross-authority │ multi-viewport      │
│  B8  ( 1) dag-layout-predict                                 │
│  B9  ( 1) dag-parity-fuzzer                                  │
│  B10 ( 1) dag-parity-spec                                    │
│  B11 ( 1) term                                               │
├──────────────────────────────────────────────────────────────┤
│  🏗️  3 repos: stratum (emission + components)                │
│               assay (checks + verbs)                         │
│               keel (emission relay)                           │
│  📡 fleet: 11 frontier nodes across 3 repos                  │
└──────────────────────────────────────────────────────────────┘
```

Adapt the display to the DAG's actual shape. Wide batches get wrapped. Fleet data gets a footer. Color bars (🟥🟧🟨🟩🟦🟪) separate sections. Every scroll lands on something worth looking at.

For fleet orient, show per-repo status with their active DAGs:

```
┌─── FLEET ────────────────────────────────────────────────────┐
│  keel     keel-surface-dag        ██████████████████ DONE    │
│  stratum  cycle-8-observation     ████████░░░░░░░░░░ B3      │
│           cycle-9-dogfood-regen   ░░░░░░░░░░░░░░░░░░ B0     │
│  assay    (no DAG)                                           │
├──────────────────────────────────────────────────────────────┤
│  globalFrontier: 13 nodes (11 stratum, 2 keel)               │
│  blockers: assay-executor waits on keel emission-relay       │
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
