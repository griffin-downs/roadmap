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

A fresh agent in a future session loads `r<N>.boot.md` via `/roadmap-orient` and inherits the cognitive stance. Without this skill, that residue is lost and the next session re-discovers (or worse, re-falls-into) the same patterns.

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

Write to `.roadmap/heads/r<N>.boot.md`. **One file per ROUND** (not per DAG). N is the round number from `dag-id` prefix (`r7-...` → N=7), or from `sidecar.round`, or from `dag_desc / Round`. If none present, the spec lacks round encoding and the boot.md falls back to `.roadmap/heads/<dag-id>.boot.md` (legacy).

Round-scoped because cognitive context is round-scoped — multiple DAGs within a round share stance, drift-prevention, and substrate inheritance. Re-writing on each intra-round successor is by design: the latest boot.md folds prior round-stable residue with new shifts.

```
.roadmap/heads/r6.boot.md         round 6 cartridge
.roadmap/heads/r7.boot.md         round 7 cartridge (reads r6 for cross-round residue)
glob: .roadmap/heads/r*.boot.md   all rounds, sorted lexicographically = chronologically
```

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

**First action: invoke `/roadmap-auto`.** Do not orient separately — auto handles orientation internally. Do not ask the user "should I begin" — the user pasted this boot prompt because they want execution to start. (§No-spontaneous-checkpoints applies.)

Branch: <current branch>
First frontier (from compile-time orient): <ready node ids>
Read CLAUDE.md for project-specific execution protocol.

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

4. WRITE        one file, .roadmap/heads/r<N>.boot.md (round-scoped)
                if r<N>.boot.md exists from a prior DAG in the round, FOLD
                still-relevant residue into the new write · do not blindly
                overwrite, do not blindly append
                ≤ 80 lines total · cartridge, not doctrine repo

MANDATORY      the ## Start section MUST contain the directive
                "First action: invoke `/roadmap-auto`." verbatim and prominent.
                The boot prompt is a self-executing cartridge — pasting it
                into a fresh session must trigger execution without the user
                typing /roadmap-auto themselves. A boot.md missing this
                directive failed authoring.
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
                    boot.md is per-ROUND and rotates on round boundary

✗ a retro           not "what went well/poorly" · that's roadmap-auto's
                    terminal review · this is about the next session's mind
```

## Chain

```
called immediately after /roadmap-spec runs `roadmap make`
also invokable standalone mid-session when drift emerges
output: .roadmap/heads/r<N>.boot.md at canonical path (round-scoped) ·
        glob `.roadmap/heads/r*.boot.md` lists all rounds chronologically
read by: /roadmap-orient on session start
chain: spec → bootprompt → (user) → orient (next session) → auto
```

🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪

💀 *The session that drafted the spec is the only one that can write its boot prompt.*
