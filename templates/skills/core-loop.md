---
name: core-loop
description: Run the iterate-upstream-propagate-downstream loop on RED outcomes. Trigger on any roadmap node landing RED · falsifier-tripped · diffuse-back-honest-RED · asymptote-fired-within-narrow-scope · or "course-correct"/"iterate further" requests. The fundamental research-grade pattern that prevents premature HONEST-RED and forge-by-narrative.
---

# core-loop

The iterate-upstream-propagate-downstream loop · the universal discipline for research-grade work that hits RED.

## When to invoke

```
trigger conditions
  any roadmap node lands RED
  falsifier tripped during execution
  diffuse-back returns HONEST-RED
  asymptote test fires within a NARROW scope
  user says "course-correct" or "iterate further"
  blocker discovered mid-cascade
```

## The loop

```
1.  DIFFUSE at current level         pass-1 broad · pass-2 residual · pass-3
                                     hard-residual · count delta vs prior pass

2.  ASYMPTOTE TEST                   delta < 5pp AND mechanism unchanged?

3a. NOT yet                          continue diffusing at this level

3b. YES → SCOPE-WIDEN ONCE           is the asymptote within a narrow scope?
                                     widen the corpus or filter once · if NEW
                                     emissions surface · the prior asymptote
                                     was a scope artifact · continue at widened
                                     scope. (operationalized by /cross-page-sweep)

4.  STILL ASYMPTOTE post-widen       MOVE UPSTREAM to next layer

5.  ITERATE diffusion at upstream    pass-1/2/3 at the new level

6.  CONTINUE upstream                until TERMINAL UPSTREAM (the primary record ·
                                     ground truth · legacy source · binary database
                                     · whatever is the unchallengeable origin)

7.  PROPAGATE DOWNSTREAM             each upstream finding reshapes the next level's
                                     emissions · populators · schema · runtime · probes

8.  RE-VALIDATE at every level       descending · against new substrate

9.  ASYMPTOTE TEST at every level    on the way down

10. ONLY THEN accept HONEST-RED      with named successor carriers
```

## Why it's load-bearing for LLMs

```
LLM default               core-loop discipline
─────────────────────     ────────────────────────────────────
first-plausible-answer    iterate-to-honest-asymptote
accept-narrow-asymptote   widen scope before honoring
forge-narrative-on-RED    structured upstream pivot through layers
vibes-driven-stop         terminal-upstream as only legitimate stop
treat-RED-as-failure      RED as routing signal · honest carrier > forged GREEN
```

## Key insights

- asymptotes are SCOPED · narrow asymptote ≠ global asymptote
- LLM default = stop at first plausible answer · loop forces structured exhaustion of upstream sources
- forge-by-narrative on RED is the failure mode the loop prevents
- terminal upstream is the ONLY legitimate stop · before it · "honest-RED" is premature
- upstream travel is cheap (grep · primary inspection) · downstream propagation is expensive (populator · runtime · probes) — exhaust upstream first

## Empirical anchors

- **fleet round-33** (2026-04-25/26) · cutover-2 RED · L1 legacy-grep ceiling honored honestly · 5 emissions packed into one Ghidra rerun via iterative L0 diffusion · structural-pivot signal on FnPgFiles revealed as 1-line populator bug · NOT authoring gap · core-loop saved a hypothetical structural-pivot round
- **fleet pre-scorched rounds 1-27** (proven empirically pre-r28) · the cross-page-sweep variant operationalized scope-widen and triangulated patterns

## Pairs with

- `/cross-page-sweep` — horizontal corpus-dimension scope-widen · operationalizes step 3b
- `/roadmap-orient` · `/roadmap-auto` · `/roadmap-term` — auto-invoke /core-loop on RED detection
