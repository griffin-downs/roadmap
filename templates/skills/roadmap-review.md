---
name: roadmap-review
description: Session completeness check — surface dropped threads, present plan
user-invocable: true
---

# roadmap-review

Scan the session for what didn't land. Present what you find. Don't act — propose.

## When to use

```
  before /roadmap-endcontext — always
  the review catches what fell through the cracks
  the endcontext makes decisions durable
```

## What to check

```
  1. dropped threads
     scan the conversation for things discussed but never acted on
     ideas, bugs, concerns, tangents that were acknowledged
     but never became a spec node, a handoff, or a CLAUDE.md entry
     these are the most likely things to be lost

  2. undocumented decisions
     "we chose X because Y" that was said in conversation
     but never written to docs/adr/ or CLAUDE.md
     decisions evaporate when context clears

  3. execution quality
     if a DAG completed this session:
       use the thing — screenshot, run, exercise the workflow
       what's the worst thing about the current state?
       what would embarrass you if the human saw it now?
     if no DAG completed:
       what's the state of the work in progress?

  4. successor completeness
     if a successor spec was written:
       does it cover the discoveries from this iteration?
       is it narrower than the current DAG? (if not, why?)
       are there dropped threads that should be nodes?
     if no successor:
       should there be one? or is the work converged?

  5. trajectory
     if terminal advance returned trajectory data:
       is the trend converging, orbiting, or diverging?
       persistent findings = same problems across iterations
     if this is a first iteration:
       what's the baseline? what are we measuring convergence against?
```

## What to present

```
  DO NOT act on findings. present them as a plan for the human.

  ┌─────────────────────────────────────────────────────────┐
  │  📋 SESSION REVIEW                                      │
  ├─────────────────────────────────────────────────────────┤
  │                                                         │
  │  Dropped threads:                                       │
  │    • shader optimization (discussed, no node)           │
  │    • authority anchor bug (mentioned, not investigated)  │
  │                                                         │
  │  Undocumented decisions:                                │
  │    • severity drives GL + CSS from one attribute         │
  │    • hex glow uses two-layer (inner hex + outer radial)  │
  │                                                         │
  │  Quality:                                               │
  │    • gauge renders but color scale needs calibration     │
  │    • dock hover feels sluggish on laptop                 │
  │                                                         │
  │  Proposed actions:                                      │
  │    → add "optimize-shader" to successor spec?            │
  │    → write severity decision to CLAUDE.md?               │
  │    → drop authority bug (low priority)?                  │
  │                                                         │
  │  Waiting for your call on each item.                    │
  └─────────────────────────────────────────────────────────┘

  the human decides what matters
  then the agent acts on the decisions
  then /roadmap-endcontext closes the session
```

## Values

```
  surface, don't act
  the review is adversarial, not congratulatory
  dropped threads are the highest-value finding
  decisions that aren't written down are lost forever
  the human's judgment is what makes triage durable
```

## Chain

```
  this skill runs between work and endcontext
  full chain: orient → auto → spec (at terminal) → review → endcontext → orient
  review presents. human decides. endcontext persists.
```
