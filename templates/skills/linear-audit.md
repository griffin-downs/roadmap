---
description: Invoke when pushing a Linear audit — the discrete checkpoint-driven protocol for mirroring fleet's HMI porting work to Linear issues. NOT for ongoing task tracking. Triggered at phase-4 first-regen-triage · phase-5 verify-at-scale · phase-6 tablet-september · phase-7 demo-ship · ad-hoc when Griffin says "push an audit." Between audits, work against the roadmap DAG · Linear lags the DAG intentionally.
---

# linear-audit

Linear push protocol. Audit-driven · not live. Read this only when doing an
audit push.

## The durable rule

**Linear is a mirror, not a mouth.** Readers of Linear see what was done, not
what's pending. Pending work lives in the roadmap DAG where agents can execute
against it. If a human wants to change scope, they edit the roadmap spec or
the deviation list — not a Linear issue.

## Scope — what lives in Linear vs not

```
  IN LINEAR                          NOT IN LINEAR
  ─────────                          ─────────────
  HMI Porting root epic              phases (1, 2, 0.6, 3, 4, 5, 6, 7)
  10 workflow epics                  mining toolchain
    (one per mined workflow)         deviations lift
  ~474 task issues                   generator skeleton / ingest / merge / emit
    (one per mined action,           observation nodes
     filtered by active deviations)  test suites
                                     style / sieve cleanup
                                     agent scaffolding
                                     anything that isn't a
                                     user-visible porting task
```

fleet's internal substrate stays in the roadmap DAG. Linear shows only what an
operator would recognize as "the HMI being rebuilt."

## Tree shape

```
HMI Porting          (single epic · parent=SRS project root)
├── Vehicle Control           (workflow epic)
│   ├── task: OnJoystick
│   ├── task: OnControl
│   └── task: ...
├── Mission Planning          (workflow epic)
├── Navigation & Map          (workflow epic)
├── Sonar                     (workflow epic)
├── Side-Scan Sonar & FLS     (workflow epic)
├── Camera & Video            (workflow epic)
├── Vehicle Status            (workflow epic)
├── Acoustics & Positioning   (workflow epic · deviation 14 deferred)
├── Data Management           (workflow epic · deviation 13 deferred)
└── Configuration & Settings  (workflow epic · deviation 12 deferred)
```

Parent-child nesting via Linear's `parentId`, not labels. The 3 deferred
workflow epics still get created — with a body note citing the deviation and
state=Backlog. Deferral is a visible thing on the Linear board.

## Issue template — Alex Sandberg mini-RFC

Every task issue uses this shape:

```markdown
## Problem
<one sentence · what must be true after this lands>

## Source
- action id: <Class::Slot>
- workflow: <workflow name>
- subgroup: <subgroup name>
- canonical IR entry: model/legacy-hmi-model.json#actions.<id>
- legacy display: <icon/component hint from media.qrc or mined inventory>

## Target (stratum)
- component: <stub-... or new component name>
- region: <sidebar | secondary | statusbar | primary | overlay>
- size: <medium | indicator | compact | large | full>
- tier: <T1 | T3 | T5>
- disclosure: <L0 | L1 | L2>
- stratum v2 node binding: <nodeId or unresolved>

## Plan
- generator plan kind: <extend | replace | sandbox | skip>
- applied deviations: <list of deviation ids that fire on this action>
- conflicts: <list of Conflict entries referencing this action, or none>

## Deliverable
- [ ] component file lands at <path>
- [ ] assay spec stub references this action
- [ ] keel schema includes this action
- [ ] render-check screenshot captured
- [ ] manual verification at localhost:5173/hmi
```

Verb-first short title (5-10 words). Fenced blocks for anything structural.
Cross-refs to sibling issues via Linear's `<issue id="...">LIN-###</issue>`
syntax. `##` headers religious.

## Done confirmation = body edit, not state change alone

When an agent advances a roadmap node that has a Linear mirror, the agent
edits the Linear issue body with a `> **Done YYYY-MM-DD.**` callout at the
top, followed by a test-results checklist:

```markdown
> **Done 2026-04-15.** Verified on branch griffindowns/lin-123-<slug>
> Commit: 4408261

## Test Results
- [X] component file lands at dashboard/src/components/display/JoystickDisplay.vue
- [X] vue-tsc clean
- [X] sieve sift fleet-vue — 0 new violations
- [X] render-check screenshot at docs/render-checks/joystick.png
- [X] manual verification: joystick responds to gesture at /hmi
```

Not just state=Done — the body becomes a receipt. Reading the issue two years
later tells you exactly what shipped and where to find it.

## Push cadence

Audits happen at discrete checkpoints, not continuously:

- after phase-4 first-regen-triage lands (first real emission)
- after phase-5 verify-at-scale lands (first passing assay run batch)
- before phase-6 tablet-september (pre-milestone push)
- before phase-7 demo-ship (final push)
- ad-hoc when Griffin asks "push an audit"

Between audits, agents work against the roadmap DAG. The Linear board lags the
DAG — that's expected.

## Audit procedure

```
1. cd ~/src/fleet && git log --oneline <since-last-audit>..HEAD
2. parse each commit for Linear ids (LIN-### tokens in messages)
3. for each touched issue:
     mcp__linear__save_issue(id, description=<body + done callout>)
     mcp__linear__save_comment(issueId, body=<commit sha · branch · artifact>)
4. for visual work:
     headless chrome screenshot · mcp__linear__create_attachment
5. write docs/lin-audits/YYYY-MM-DD.md with the receipt
6. commit the audit receipt on main
```

Triggered manually. Never automated. Never polled. Never tied to
ScheduleWakeup or cron.
