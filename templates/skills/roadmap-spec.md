---
name: roadmap-spec
description: Generate convergence-oriented roadmap specs
user-invocable: true
---

# roadmap-spec

```
  completion = working output, not harnesses
```

Every section below traces to this line. If a spec doesn't produce working output, the spec is wrong.

## Schema

```bash
roadmap api make
```

Structure source of truth. If this document contradicts the API, the API wins.

## Read What Came Before

```
  .roadmap/heads/*.json — archived DAGs that completed
  .roadmap/trail.jsonl — what actually happened during execution
  .roadmap/.handoff/*.json — what agents discovered

  before writing a new spec, read 2-3 recent completed DAGs
  in this repo. look for:

    shape        how many nodes? how wide are the batches?
                 what's the observation/implementation/verify ratio?

    validators   what kinds of validators actually worked here?
                 what does "terminal" look like in this repo?

    nodes        what's the idiom for decomposition?
                 are build and test split? are components their own nodes?

    friction     grep trail for "advance" — which nodes got rejected?
                 those are the hard spots worth a second look.

  your spec should fit the repo's grain. a python project specs
  differently than a vue project. the archived heads tell you how.
```

## The Bet

A spec is a bet. The agent proposes: *if I execute these nodes in this order, I will satisfy this intent.* The terminal node is where the bet pays out or doesn't.

```
  before writing, answer out loud:

    intent       what was the human actually asking for?
                 not the implementation. the need.
                 "build a gauge" ← implementation
                 "see depth in real time" ← intent

    done         what would a human do to check?
                 open it. run it. click through it.
                 your terminal validator does that.

    risk         what will surprise us?
                 most bugs live at boundaries between systems.
                 observation nodes go in the first batch.
```

## What Kills Specs

Four failure modes, all from real sessions:

```
  1. assumption-first

     agent writes "build mesh → test mesh → ship mesh" (24 nodes)
     turns out 6 other repos have mesh patterns nobody mined
     the spec was wrong because it skipped observation

     fix: first batch is observation, not implementation.
     "mine 6 repos for patterns" is 6 parallel nodes.
     implementation comes after, consuming findings.

  2. boundary blindness

     agent builds gauge component. shader fights backdrop-filter.
     z-index stacks wrong against position:fixed. scoped CSS
     fails to reach child. 3 hours of debugging at the boundary.

     fix: ask "what can go wrong at the boundaries?" before
     writing implementation nodes. ownership, merge semantics,
     stacking order, process inventory, perf budget, scope
     leaks. each answer is an observation node.

  3. weak validators

     agent writes "Run vue-tsc. Run vitest." commits. ships.
     the thing renders but the gauge label is cut off.
     nobody looked at the screen.

     fix: the validator answers "how would a human check this?"
     if a human would look at the screen, the validator
     screenshots and evaluates. "it compiles" is not proof.

  4. self-graded success

     agent writes intent validator, agent grades at 0.95,
     agent advances, DAG closes, nothing works.

     fix: no intent validators on execute nodes. plan nodes only.
     execute nodes need shell validators that run real things.
     the validator command must reference a file from produces.
```

## Writing the Spec

```
  shape      observe wide → implement narrow → verify wide
             first batch: parallel observation nodes (read repos,
             extract contracts, answer boundary questions)
             middle: implementation with dependencies
             last: parallel verification + terminal

  nodes      self-contained — a stranger executes from desc alone
             one concern — build and test are separate nodes
             falsifiable — desc states what's true after it completes

  validators invoke produced files by path
             refuse grep as behavioral evidence
             refuse artifact-exists as terminal validator
             refuse "it compiles" as proof of correctness

  descs      implementation + inspect + iterate + condition for commit
```

## Strong vs Weak Descs

```
  ❌ "Create GaugeDisplay.vue. Run vue-tsc. Run vitest."

  ✅ "Create GaugeDisplay.vue — reactive gauge driven by useEmission().
      After: launch dev server, screenshot the gauge.
      READ the screenshot. Can you read the depth number in < 1 second?
      Is anything clipped? Is the severity color correct?
      Fix what you find. Screenshot again. Commit only when you'd
      show it to a client."

  ❌ "Write Dockerfile. Run docker build."

  ✅ "Write Dockerfile for production build. After writing:
      docker build must succeed.
      docker run — container must start and bind port.
      curl /health must return 200.
      If any step fails, fix and rebuild. Do not commit until
      the container serves a health check."
```

The pattern: **implement → inspect → iterate → condition for commit.** Every desc for visual, functional, or infra work follows it.

## Before You Submit

Three judgment calls, not a checklist:

```
  approve    the first batch observes before it builds.
             every validator invokes a produced file.
             the terminal uses the thing the way a human would.
             → run roadmap make. ship it.

  redirect   something's off. one of:
             - implementation-first with no observation
             - validators that don't name files from produces
             - terminal that only checks existence
             - a node doing two concerns (build AND test)
             → fix it. re-run this skill.

  stop       you don't know the boundaries yet.
             you're guessing at the intent.
             you haven't read any archived heads.
             → go read. come back.
```

## Create

```bash
roadmap make docs/<dag-id>.spec.json --note "<intent>"
roadmap orient --note "begin <dag-id>"
```

## Chain

```
  orient → spec → make → orient → auto → term → orient
```
