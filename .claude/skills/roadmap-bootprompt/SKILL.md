---
name: roadmap-bootprompt
description: Author the boot prompt — capture session-tacit cognitive stance before context dies
user-invocable: true
---

# roadmap-bootprompt

The spec encodes what to prove. This skill encodes **how the drafting session
wanted to think.** Drift-prevention, dead ends, register, user concerns, the
micro-doctrine that emerged in conversation but isn't formal enough for
CLAUDE.md — all of it dies when the session ends unless captured now.

A fresh agent in a future session loads `boot.md` via `/roadmap-orient` and
inherits the cognitive stance. Without this skill, that residue is lost and
the next session re-discovers (or worse, re-falls-into) the same patterns.

🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪

## When to invoke

```
PRIMARY      immediately after /roadmap-spec runs `roadmap make`
             session-tacit knowledge is still alive · capture before it dies

SECONDARY    mid-execution when fresh drift-prevention emerges
             user pushes back on a pattern · agent notices a recurring miss ·
             cognitive context shifted enough to warrant a refresh

NEVER        by a fresh agent that wasn't there for the drafting session
             a renderer can fill scaffold sections from spec fields,
             but Stance + Watch require having been in the conversation
```

🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪

## Output · the boot.md file

Write to `.roadmap/heads/<dag-id>.boot.md`. One file per DAG. Canonical path.

```markdown
# <Plain-English DAG title from dag_desc line 1>

## Context
<1-2 sentences · what repo, what lane, what round>

## Intent
<pulled from dag_desc · what the human is actually asking for>

## Scenario
given <starting state>
when  <the human acts>
then  <the human can ___>

## Round
Round <N> · falsifier: <one line>
Carriers inherited from r<N-1>: <list, or "none">

## Substrate state at round boundary
<MANDATORY · see "Required boot.md section" below · jq-runnable facts, not prose>

## Start
Run `/roadmap-orient` — position is truth.
Read CLAUDE.md for execution protocol.
Branch: <current branch>
First frontier (from compile-time orient): <ready node ids>

## Skills
/roadmap-orient · /roadmap-spec · /roadmap-bootprompt · /roadmap-auto

## Stance
<AUTHORED · session-tacit · the load-bearing part>
- <drift this session revealed · what to NOT re-explore>
- <dead ends · "we tried X, abandoned because Y">
- <patterns the user wants enforced · things to flag>
- <register/voice notes for this lane>
- <micro-doctrine that emerged in conversation but isn't in CLAUDE.md yet>

If the project has no tighter stance, the floor still travels:
- subtract before adding · removing a surface > handling a case
- extend, don't bolt · refactor when extension isn't natural
- thin and long > short and fat
- ~400 LOC goldilocks · functions 10-40 lines

## Watch
<AUTHORED · what to flag back to the user on encounter>
- <things the user wants surfaced if seen>
- <known AMBER candidates from prior rounds>
- <boundaries where surprise is likely>

## Trajectory so far
<optional · only if a prior session ran>
Last N nodes: <WIN WIN PARTIAL LOSS ...>
Notable pattern: <e.g. "LOSS streak at nodes 5-7 routed to upstream">
```

🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪

## Required boot.md section · ## Substrate state at round boundary

Every boot.md MUST include a top-level section titled `## Substrate state at
round boundary` between intent/thesis and stance. The section is mechanically
populated, not narrated · it inventories the substrate that exists at round
boundary so the next session opens with state, not prose.

Mandatory sub-sections (each one paragraph or short list):

  · Canonical artifacts touched by this round · jq model/canon/index.json ·
    cite path + sha256 + relevant entity counts.
  · Cross-machine substrate · jq model/canon/forensic-sources.json for any
    .sources[] whose role intersects the round's problem domain · cite
    .access.remote_host + .access.capture_emit_dir + .known_emitter_state flags.
  · Ephemeral substrate state · ls newest 1-3 epochs under model/raw/<domain>/ ·
    cite actual VALUES sampled (not just field names) · note coverage percentages.
  · Predecessor round empirical findings · cite specific receipts (path + verdict
    + key numeric finding) · NOT prose summaries.

Anti-pattern · "prose narrating cognitive stance about substrate" instead of
"jq-runnable substrate facts." Substrate facts survive context compression ·
prose summaries rot within one round..

§Substrate-inventory-precedes-DAG-authoring (sibling /roadmap-spec discipline)

## Authoring procedure

```
1. SCAFFOLD     pull from spec fields
                · title from dag_desc line 1
                · Intent/Scenario/Round from dag_desc structured blocks
                · Branch from `git rev-parse --abbrev-ref HEAD`
                · First frontier from `roadmap orient` JSON output
                · Skills list is static

2. STANCE       AUTHORED from session memory · the load-bearing work
                walk back through the drafting conversation
                surface:
                  · pushback the user gave on patterns
                  · approaches we tried and abandoned
                  · register/voice cues
                  · concerns the user voiced about quality/drift
                  · micro-doctrine not yet in CLAUDE.md

                if the session didn't surface any of these, the floor
                stance ships unchanged. that's honest; better than fake.

3. WATCH        AUTHORED · what should the next agent flag back?
                AMBER candidates · likely boundaries of surprise ·
                things the user wants eyes on

4. WRITE        one file, .roadmap/heads/<dag-id>.boot.md
                ≤ 80 lines total
                if any section bloats, compress · the boot prompt is a
                cartridge, not a doctrine repo
```

🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪

## Values

```
this skill requires session context · never dispatch to a background agent
the Stance + Watch sections are not derivable from spec fields
the scaffold is not the point — the cognitive residue is
brevity is mercy · a fresh agent reads this cold, not as a doctrine treatise
the floor stance always ships · the ceiling raises from there
```

## What this skill is NOT

```
✗ a renderer        a renderer can fill scaffold sections but cannot
                    author Stance + Watch · those require having been there

✗ a session log     not a transcript · not a "what we did" recap ·
                    capture FORWARD-LOOKING cognitive cues, not history

✗ doctrine          permanent doctrine goes to CLAUDE.md ·
                    boot.md is per-DAG and dies with the chain

✗ a retro           not "what went well/poorly" · that's roadmap-auto's
                    terminal review · this is about the next session's mind
```

## Chain

```
called immediately after /roadmap-spec runs `roadmap make`
also invokable standalone mid-session when drift emerges
output: .roadmap/heads/<dag-id>.boot.md at canonical path
read by: /roadmap-orient on session start
chain: spec → bootprompt → (user) → orient (next session) → auto
```

🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪

💀 *The session that drafted the spec is the only one that can write its boot prompt.*
