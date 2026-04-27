---
name: threads
description: Surface conversation threads — status, completion, dropped/obviated
user-invocable: true
---

🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪

# threads

Scan the conversation. Surface every thread. Show status in a table.

## What's a thread?

```
  anything the human raised or the agent proposed that
  became a unit of discussion or work

  explicit asks             "let's build X"
  ideas that landed         "we should also..."
  bugs noticed              "this thing is broken"
  decisions made            "we chose X because Y"
  tangents explored         "what if we..."
  items deferred            "we'll come back to this"
```

## Status vocabulary

```
  🟩 done         shipped, committed, verified
  🟨 in-progress  partially done, actively being worked on
  🟦 proposed     discussed but not started
  🟥 dropped      acknowledged then abandoned, no trace
  🟫 obviated     superseded by another decision or approach
  💀 orbiting     raised multiple times, never resolved
```

## Output format

```
┌──────────────────────────────────────────────────────────────────────┐
│  📋 THREADS — <N> total                                              │
├─────┬──────────────────────────────────────┬──────────┬──────────────┤
│  #  │ Thread                               │  Status  │ Completion   │
├─────┼──────────────────────────────────────┼──────────┼──────────────┤
│  1  │ Fleet scheduler across repos         │    🟩    │ ██████████ % │
│  2  │ /roadmap-spec convergence skill      │    🟩    │ ██████████ % │
│  3  │ Successor spec auto-inject at term   │    🟩    │ ██████████ % │
│  4  │ Miner — trajectory — successor fold  │    🟨    │ ██████░░░░ % │
│  5  │ Validator strength tiers             │    🟫    │ ░░░░░░░░░░ % │
│  6  │ Skill receipt system                 │    🟥    │ ░░░░░░░░░░ % │
│  7  │ Native Claude Code integration       │    🟦    │ ░░░░░░░░░░ % │
│  8  │ ML Prague open source release        │    🟦    │ ░░░░░░░░░░ % │
└─────┴──────────────────────────────────────┴──────────┴──────────────┘

  🟩 3 done · 🟨 1 in-progress · 🟦 2 proposed · 🟥 1 dropped · 🟫 1 obviated

  dropped threads (highest value to surface):
    #6 Skill receipt system — discussed, we decided prompt enforcement was enough

  obviated threads:
    #5 Validator strength tiers — replaced by successor spec structural gate
```

## How to scan

```
  walk the conversation from start to current
  for each topic raised, track:
    - when it came up
    - what was decided
    - was it acted on?
    - is there a trace in the repo (spec, commit, doc)?

  the conversation is the input. your memory is the scanner.
  be honest about what was dropped — that's the point.
```

## Values

```
  surface, don't act
  the dropped threads matter most
  obviated ≠ dropped — obviated means we chose differently
  orbiting means the conversation keeps circling — escalate
  the table is for the human to triage
  this skill doesn't make anything durable — /roadmap-term does that
```

## When to use

```
  mid-session checkpoint    "what have we talked about so far?"
  before a decision         "what else is on the table?"
  end of session            run before /roadmap-term
  after a dense exchange    surface what might have been missed
```

🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪

💀 *every thread surfaced · nothing dropped silently*
