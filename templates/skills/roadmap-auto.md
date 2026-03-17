---
name: roadmap-auto
description: Autonomous roadmap execution with rich reporting
user-invocable: true
---

# roadmap-auto

Send the agent off to work. Autonomous execution of the current roadmap.

## Protocol

```
  1. roadmap orient — position is truth. never infer.
  2. work every node in the current batch.
     parallel background agents when batch has 2+ nodes.
  3. per node:
     implement produces → git add → git commit "<node-id>: <what>"
     → roadmap advance <node-id> --note "<what>"
  4. advance rejects? read the error. fix the produce.
     re-commit. retry. never skip validators.
  5. batch completes → orient again → next batch → repeat until done.
```

## Reporting

```
  the human sees the DAG come alive

  on orient:
  ┌─────────────────────────────────────────────────────────┐
  │  🔮 dag-name — B2 of 7 │ 5/14 done                     │
  ├─────────────────────────────────────────────────────────┤
  │  B0  init ✅                                            │
  │  B1  setup-db ✅ │ setup-auth ✅                        │
  │  B2  [🧪 api-routes] │ [🧪 middleware] ←── you are here │
  │  B3  integration │ B4 tests │ B5 term                   │
  └─────────────────────────────────────────────────────────┘

  on dispatch:
  ┌─────────────────────────────────────────────────────────┐
  │  B2 DISPATCHED — 2 parallel agents                     │
  │  🔧 api-routes    → src/api/routes.ts                  │
  │  🔧 middleware    → src/middleware/auth.ts               │
  └─────────────────────────────────────────────────────────┘

  on batch complete:
  🟩🟩🟩🟩🟩🟩🟩🟩🟩🟩🟩🟩🟩🟩🟩🟩🟩🟩🟩🟩🟩🟩🟩🟩
    B2 ✅ api-routes (3/3) │ middleware (2/2)
    Next: B3 integration
  🟩🟩🟩🟩🟩🟩🟩🟩🟩🟩🟩🟩🟩🟩🟩🟩🟩🟩🟩🟩🟩🟩🟩🟩

  on terminal:
  🟩 DAG COMPLETE — trajectory + successor proposal
```

## At Terminal

```
  read terminalContext.detectedGaps — remaining work items
  read terminalContext.rootIntent — what we're building toward
  read successorProposal.action:
    converged    → done. tell the human.
    continue     → write successor spec from specDraft, roadmap make it
    orbit-break  → STOP. surface orbitDiagnosis to human.
```

## Chain Continuation

```
  after writing successor spec:
    git checkout main && git merge <branch>
    roadmap make successor-spec.json --note "chain from <dag_id>"
    roadmap orient — begin next cycle

  the loop: work → term → successor → merge → make → orient → work
  do not stop at "merge this branch first." complete the loop.
```

## Permissions

```
  next moves approved. do not ask permission.
  merge to main approved.
  dispatch parallel background sonnet agents for batch nodes.
  expand plan nodes into subgraphs as encountered.
```

## Two Loops

```
  DAG loop     orient → work batch → advance → orient again
               across nodes, across iterations

  agent loop   produce → inspect your output → fix → produce again
               within a single node, before committing
               look at what you made. not once — until it's right.
```

## Chain

```
  this skill is called after /roadmap-orient shows work to do
  at terminal → run /roadmap-endcontext (review + persist + close)
  the chain: orient → auto → spec → endcontext → orient
```
