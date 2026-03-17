---
name: roadmap-endcontext
description: Review session, persist learnings, close cleanly
user-invocable: true
---

# roadmap-endcontext

End of session. Three steps: review what happened, persist what matters, hand off cleanly.

## Step 1: Review

```
  scan the conversation for what didn't land

  dropped threads
    things discussed but never acted on
    ideas, bugs, concerns that were acknowledged
    but never became a spec node, handoff, or CLAUDE.md entry

  undocumented decisions
    "we chose X because Y" said in conversation
    but never written to docs/ or CLAUDE.md

  execution quality (if a DAG ran)
    use the thing — screenshot, run, exercise the workflow
    what's the worst thing about the current state?
    what would embarrass you if the human saw it now?

  successor completeness (if one was written)
    does it cover the discoveries?
    is it narrower than the current DAG?
    are there dropped threads that should be nodes?
```

Present what you find. **Don't act — propose.** The human decides what matters.

```
  ┌─────────────────────────────────────────────────────────┐
  │  📋 SESSION REVIEW                                      │
  ├─────────────────────────────────────────────────────────┤
  │                                                         │
  │  Dropped threads:                                       │
  │    • item (discussed, no node)                          │
  │    • item (mentioned, not investigated)                 │
  │                                                         │
  │  Undocumented decisions:                                │
  │    • decision (not in CLAUDE.md or docs/)               │
  │                                                         │
  │  Proposed actions:                                      │
  │    → add to successor spec?                             │
  │    → write to CLAUDE.md?                                │
  │    → fine to drop?                                      │
  │                                                         │
  │  Waiting for your call on each item.                    │
  └─────────────────────────────────────────────────────────┘
```

## Step 2: Persist

After the human triages, act on decisions:

```
╭─────────────────────────────────────────────────────────────────╮
│ mutation rules                                                  │
│                                                                 │
│ CLAUDE.md     mutate anchored sections, append references       │
│               never: session context, TODOs, task lists         │
│                                                                 │
│ docs/         specs, ADRs, design docs — things with shelf life │
│               never: session logs, scratch, anything that expires│
│                                                                 │
│ .roadmap/     append-only (trail, completed, handoffs)          │
│               head.json via CLI only. heads/ immutable.         │
│                                                                 │
│ ephemeral → handoff.  permanent → CLAUDE.md.  actionable → spec.│
│ nothing else gets written to the repo.                          │
╰─────────────────────────────────────────────────────────────────╯
```

## Step 3: Boot Prompt

After everything is durable, the boot prompt is thin — it points, not contains.

```markdown
## Context

<1 sentence: what repo, what intent>

## Start

Run `/roadmap-orient` — position is truth.
Read this repo's CLAUDE.md for execution protocol and known issues.

## Skills

/roadmap-orient · /roadmap-spec · /roadmap-auto · /roadmap-endcontext

## State

<branch, clean/dirty, successor spec created or DAG in progress>

## Decisions

<2-3 bullets, or: "see docs/adr/">

## Next Move

<one line: what to do first>
```

## Values

```
  the review is adversarial, not congratulatory
  surface, don't act — human decides what matters
  the boot prompt is a pointer, not a container
  session docs are an antipattern — use specs and handoffs
  dropped threads are the highest-value finding
  decisions not written down are lost forever
```

## Chain

```
  this skill closes the cycle
  boot prompt tells next agent: /roadmap-orient
  full chain: orient → auto → spec → endcontext → orient
```
