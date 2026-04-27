---
description: Invoke to read the bug-class hunting doctrine — the 11-class taxonomy, per-detector contracts, and the I1/I2/I3/I4 invariants that govern render-quality closure. Use when authoring a new detector, debugging why a detector over-counts or under-counts, deciding whether a visual issue is a class-N instance, or reviewing a bug-hunt CI failure. Parallel to /pipeline-thesis for extraction and /rovmk3-thesis for staging quality.
---

# bug-class-hunting

Refresher on the bug-class taxonomy and detector suite that governs HMI render
quality. The thesis: a class with a detector scales · an instance with a fix
does not.

## The thesis in one sentence

Every divergence between our render and the legacy HMI is an *instance* of
something — the question is never "fix this one pixel" but "what class of
drift produces this, what detector finds all of them mechanically, and what
upstream change drives the count to zero."

## Canonical docs (the full taxonomy + detector specs live here)

- `docs/design/bug-classes.md` — taxonomy + instances + remediation tiers
- `docs/design/bug-class-detectors.md` — per-class detector contracts + orchestrator spec

## The 11 classes (plus PBR carrier)

```
   0 · PROVE-BEFORE-RETIRE          meta-#8 carrier · CAPs held as
                                    named instances · target 0 ·
                                    round-terminal gate
   1 · EXTRACTION-REGEX             regex authored against sampled
                                    decompiler output · live differs ·
                                    extractor emits 0 silently
   2 · CONSOLIDATION-GAP            raw/*.json has data · consolidator
                                    drops it before v2
   3 · LENIENT-RESPONDER            permissive layer 200s on wrong
                                    request · verification claims
                                    pass against nothing (I3)
   4 · SLOT-ROUTING                 chrome-band widget lands in wrong
                                    sub-slot · overlap truncation
   5 · ARCHETYPE-DISPLAY MISMATCH   archetype chosen · renders variant
                                    that doesn't fit the bbox
   6 · MISSING-ELEMENT              legacy shows N in region R ·
                                    our render shows M < N
   7 · CONTAINER-AS-LEAF            widget has internal structure ·
                                    classifier treated as atom
   8 · MODE-SWITCH vs TOOL-PALETTE  mutex strip classified as multi-
                                    select palette · wrong semantic
   9 · POST-DETACHMENT STUB MISSING hardware-bound archetype renders
                                    empty box · no "requires X"
  10 · MODAL-STACK-CAPACITY         model assumes one modal · legacy
                                    shows N > 1 concurrent
  11 · COORDINATE-REBASE            parentId:null propagated · emitter
                                    lays out in binary-absolute space ·
                                    overlap rate > 30%
```

## Work directive

```
  any PR that introduces a class-N instance without incrementing the
  detector's known-residual count in its report must fail CI.
  detector count > target → exit 1 → pipeline blocks.
  residual bump requires an explicit justification note in the PR body.
```

## Command

```
  npm run bug-hunt

  stdout table:
    | class  | name                         | count | target | status |
    | 1      | EXTRACTION-REGEX             |    1  |    1   |  PASS  |
    | 2      | CONSOLIDATION-GAP            |    0  |    0   |  PASS  |
    ...

  per-class reports: model/output/bug-reports/class-<N>-<kebab>.json
  summary:           model/output/bug-reports/summary.json
  pipeline step:     step-b-bug-hunt (after extract + merge · before emit)
  per-detector:      tsx model/bin/detectors/detect-<kebab>.ts
```

## The four invariants (CI-blocking · not guidelines)

```
  I1 DETECTOR SUITE GREEN
     npm run bug-hunt · per-class count <= target for each named class ·
     >= 6 of 11 classes at target 0
     enforcement: model/bin/bug-hunt.ts · pipeline step-b-bug-hunt

  I2 VISUAL PARITY
     for each of the 3 enshrined pages (FnPgRovMk3 · FnPgRov · FnPgMission):
     assay probe http://localhost:5180/?layout=staging&page=<Page> AND
     assert DOM contains all checklist items from
     docs/design/legacy-reference/<page>.md
     enforcement: 3 assay specs at assay/specs/legacy-parity-<page>.json
     class 6's detector IS this invariant mechanized

  I3 NO FALSE-POSITIVE FROM LENIENT RESPONDER
     every verification step asserts POSITIVE CONTENT · not just 200/presence
     stratum dev server refuses wrong-URL patterns loudly
     every detector rejects vacuous-true (exit 2 on empty corpus)
     enforcement: stratum main.ts · class 3 detector · all detector
     vacuous-true guards

  I4 INTERACTIVITY (added round-3)
     end-to-end survey-mission runnable in-browser via assay drive
     (authority claim · waypoints · telemetry · fault · release)
     enforcement: assay-specs/survey-mission.json
```

## Detector authoring contract

When a new class emerges (or an existing one reframes · like round-3's
null-semantics cascade that reframed classes 1/2/11):

```
  1. author detector at model/bin/detectors/detect-<kebab>.ts
  2. use common.ts primitives (writeReport dual-write · vacuous guard
     · readJSON · sha256File)
  3. goldilocks file size · 80-250 LOC sweet
  4. orchestrator auto-discovers via dirent scan in bug-hunt.ts
  5. output at model/output/bug-reports/class-<N>-<kebab>.json
     (primary) + <kebab>.json (alias · same content)
  6. target is named explicitly in detector · if > 0, justify inline
  7. receipt explains what the class IS and how to drive count to
     target
```

## Reframe pattern (round-3 lesson)

If a detector over-counts because of a conflated semantic, fix the DETECTOR
not the DATA. Round-3 reframed class-1/2/11 to respect `ownedBy` · counts
dropped from (2, 3, 11) to (1, 0, 1) without changing the extraction. The
detector's frame is as important as the extractor's output.

## Read these before authoring

1. `docs/design/bug-classes.md` — taxonomy + instances
2. `docs/design/bug-class-detectors.md` — per-detector contracts
3. `model/bin/detectors/common.ts` — shared primitives
4. `model/output/bug-reports/summary.json` — current state

## One-line doctrine

> A class with a detector scales. An instance with a fix does not.
