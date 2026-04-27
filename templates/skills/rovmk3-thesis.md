---
description: Invoke to read the FnPgRovMk3 Thesis · the forensic/common-sense doctrine for staging-quality work. Parallel to /pipeline-thesis. Says every render uncertainty is a question we have not yet asked the binary; gives the forensic method (trace upstream, not patch downstream) and the common-sense invariants (no overlaps, aspect matches archetype, evidence hierarchy). As of r25 the forensic method IS the three-way diff (predictor · topology · screenshot). Use at session-start when working on any page's visual quality, or mid-session when stuck on a misclassification or render bug.
---

# FnPgRovMk3 Thesis · runtime invocation

Read `~/src/fleet/docs/fleet-rov-thesis.md` in full. That file is the doctrine.

## r25 realized state · three-way diff IS the forensic method

The thesis originally framed forensics as "trace upstream, not patch downstream." As of r25 that frame has a concrete shape: **three independent oracles, triangulated**.

```
  predictor     predictLayout(IR) → expected geometry
                honest unresolvable[] · never silent default
  topology      pick-buffer sweep → observed render
                per (page, state, resolution) corpus
  screenshot    enshrined legacy PNG → multimodal truth
```

Every staging disagreement collapses to one verdict:

```
  all-agree             → converged · move on
  render-bug            → predictor + screenshot agree · topology diverges
  predictor-gap         → topology + screenshot agree · predictor silent or wrong
  intentional-deviation → predictor + topology agree · screenshot diverges (deviation list)
  all-disagree          → escalate · forensic deep-dive
```

No fourth category. Every disagreement has verdict + bug-class + disposition.

**Operational consequence:** "I can't tell why this renders wrong" is now never a valid terminal state. The three oracles constrain the answer to one of five named verdicts · the verdict names the carrier.

## Forensic method · unchanged in spirit

```
  1. ask the binary, not the rule system
  2. trace upstream (predictor · IR · extractor) · not patch downstream (CSS)
  3. common-sense invariants before visual polish
  4. evidence hierarchy: binary > topology > predictor > screenshot
```

The three-way diff operationalizes (1)–(4) as a single artifact instead of a prose checklist.

## See also

- fleet/CLAUDE.md §"Three-way convergence · predictor · topology · screenshot"
- /per-page-convergence · uses three-way diff as B0 observation primitive
- /bug-class-hunting · every verdict routes to a class-N carrier
