---
name: roadmap-term
description: Assess convergence, review session, write successor, close cleanly
user-invocable: true
---

# roadmap-term

You're at the terminal node. This is the assessment moment — not a formality.

## 1. Assess

```
  read the root intent — what was the human actually asking for?
  not the DAG description. the original need.

  compare: does what we built satisfy that intent?
  not "did validators pass" — does the thing WORK?

  visual work   → screenshot it. look at it.
  functional    → run it. exercise the workflow.
  infra         → deploy it. hit the endpoint.

  read the trail — .roadmap/trail.jsonl
    this is the flight recorder. append-only. the agent can't edit it.
    look at the last 50-100 entries. what jumps out?
    many orients between advances = agent was lost
    advance rejections = validator failures (what broke?)
    long gaps between events = agent was stuck
    mutation events = DAG changed during execution (why?)
    the trail tells you what actually happened, not what was reported
```

## 2. Review Dropped Threads

```
  scan the conversation for what didn't land

  dropped threads
    things discussed but never acted on
    ideas, bugs, concerns acknowledged but never
    became a spec node, handoff, or CLAUDE.md entry

  undocumented decisions
    "we chose X because Y" said in conversation
    never written to docs/ or CLAUDE.md

  execution gaps
    nodes where you noticed something wrong but moved on
    validators that passed but the output wasn't right
    things a human would catch that the DAG didn't
```

## 3. Present

```
  show what you found. don't act — propose.

  ┌─────────────────────────────────────────────────────────┐
  │  📋 TERM REVIEW                                         │
  ├─────────────────────────────────────────────────────────┤
  │                                                         │
  │  Intent: <root intent>                                  │
  │  Status: <converging / gaps remain / orbiting>          │
  │                                                         │
  │  Dropped threads:                                       │
  │    • item (discussed, no node)                          │
  │    • item (mentioned, not investigated)                 │
  │                                                         │
  │  Undocumented decisions:                                │
  │    • decision (not in CLAUDE.md or docs/)               │
  │                                                         │
  │  Proposed:                                              │
  │    → successor spec node?                               │
  │    → CLAUDE.md entry?                                   │
  │    → fine to drop?                                      │
  │                                                         │
  │  Waiting for your call.                                 │
  └─────────────────────────────────────────────────────────┘

  the human decides what matters. then you act.
```

## 4. Persist

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

## 5. Successor

```
  converged     write {"dag_id":"...","converged":true,"rationale":"why"}
                the rationale must be specific — what intent is satisfied

  continue      invoke /roadmap-spec to design the successor
                dropped threads + gaps feed into the spec
                the next DAG should be NARROWER than this one

  orbiting      STOP. surface to human.
                "same problems across iterations: [list]"
                do not write another spec. redirect needed.
```

## 6. Boot Prompt

```markdown
## Context

<1 sentence: what repo, what intent>

## Start

Run `/roadmap-orient` — position is truth.
Read CLAUDE.md for execution protocol and known issues.

## Skills

/roadmap-orient · /roadmap-spec · /roadmap-auto · /roadmap-term

## State

<branch, successor spec status>

## Decisions

<bullets, or: "see docs/adr/">

## Next Move

<one line>
```

## Values

```
  this node requires your full session context
  never dispatch it to a background agent
  the review is adversarial, not congratulatory
  dropped threads are the highest-value finding
  decisions not written down are lost forever
  the human's judgment is what makes triage durable
```

## Chain

```
  this skill closes the cycle
  boot prompt tells next agent: /roadmap-orient
  chain: orient → auto → spec → term → orient
```
