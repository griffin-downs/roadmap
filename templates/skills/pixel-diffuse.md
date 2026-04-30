---
name: pixel-diffuse
description: Per-pixel gap classification across pick-buffer × visual-truth-PNG corpus. The FIFTH application of §Diffusion-discovery-pattern. Inverts forward-pass diffusion (binary→schema→render) into backward-pass (screenshot→gap-classification→carriers). Use when stuck on a render-quality gate, when carriers need empirical pixel-coverage ranking instead of doctrinal axis-bias, or when the closure metric pixel-disagreement-fraction needs to be computed. Triggered on: render-correctness cluster default · pixel-diffuse skill invocation · carrier-ranking-by-pixel-coverage node execution.
---

# /pixel-diffuse · pixel-coverage-ranked extraction

The screenshot has been begging to be the input the whole time.

## Thesis

```
forward-pass    binary  →  schema  →  render  →  pixels    (9 rounds)
backward-pass   pixels  →  disagreement  →  carriers       (NEW · r37)
```

Pick-buffer is the runtime counterpart to IR snapshot. Visual-truth PNGs are the legacy oracle. Their disagreement IS the carrier manifest — empirically ranked, not doctrinally guessed.

## When to invoke

```
visual gate RED      and you're tempted to author another extractor
single-axis ceiling  held <5pp across two passes (§Iterate-to-ceiling)
carrier triage       multiple cluster candidates · pick by pixel-coverage
closure metric       compute pixel-disagreement-fraction for round-terminal verdict
```

## The eight-step loop (§Diffusion-discovery-pattern · FIFTH application)

```
1. SCAFFOLD CORPUS
   per (page, state, resolution): pair visual-truth PNG ↔ pick-buffer JSON
   docs/design/legacy-reference/<page>.png        ↔
   model/output/topology/<page>.<state>.<res>.json
   ≥5 pages · enumerate in .roadmap/round-N/artifacts/<page>-pair-manifest.json

2. COMPUTE PIXEL-DISAGREEMENT-FRACTION
   per pair: rasterize pick-buffer at PNG resolution → diff per pixel
   metric: disagreement_count / total_pixels
   per-page baseline at corpus-build time · target ≥30% drop by terminal

3. CLASSIFY DISAGREEMENT INTO PROVENANCE AXES
   for each disagreeing pixel · attribute to category:
     P1 archetype-source        wrong component picked
     P2 geometry-source         right component, wrong rect
     P3 connection-source       slot/signal absent or miswired
     P4 visibility-source       hidden when shown / shown when hidden
     P5 label-source            text / icon string mismatch
     P6 archetype-children      missing / extra child widgets
     P7 icon-source             wrong icon / missing icon
     UNKNOWN                    honest-residual · no axis fits

4. PASS-1 BROAD (chunk-manifest)
   spawn one agent per page-pair · classifies every disagreeing pixel
   high-confidence rate target: ≥60% in pass-1
   honest "unknown" required (§Three-non-negotiables)

5. PASS-2 RESIDUAL (chunk-manifest over pass-1 unknowns)
   re-classify only pixels marked unknown after pass-1
   surfaces residual taxonomy · informs P-axis extension

6. EMIT CRYSTALLIZATION
   model/output/pixel-gap-classifier.generated.json
   shape: {page, state, res, total_pixels, disagree_count, by_axis: {P1..P7, unknown}, top_carriers: [{axis, coverage_pct, sample_pixels: [[x,y],...]}]}
   COMMITTED · review in PR · §Generator-protocol layer-1 substrate

7. RANK CARRIERS BY EMPIRICAL PIXEL-COVERAGE
   aggregate by_axis across pages → axis × pixel-coverage table
   each axis with ≥10% pixel-coverage → r38 carrier (NOT just doctrinal bias)
   carriers ranked descending · top-N becomes successor cluster manifest

8. PROPAGATE DOWNSTREAM
   carriers feed §Populator-wire-LIFT-WIRE-PROVE-canonical at next round
   pixel-disagreement-fraction re-measured at round-terminal · gate at -30%
```

## Discipline

```
honest-unknown        UNKNOWN axis count must appear in every emit · 0% is suspect
chunk-LLM             pass-1/2 use chunk-manifest + agent-per-chunk · §Chunk-level-LLM
build-purity          pixel-diffuse runs at AUTHORING time only · no SDK in build-path
multimodal-read       agent reads both PNG and pick-buffer JSON · cite recognizability
no-narrative-counts   pixel-coverage % MUST be jq-derived from .generated.json
                      · §Validator-as-process trips on self-reported deltas
```

## §Three-corner-classifier check

Before invoking pixel-diffuse, confirm corpus shape:

```
pick-buffer × visual-truth                 ✓ overlapping sources (prong-1)
DOM rendered from schema                   ✓ symbolic expression already written (prong-2)
pixel as instance · axes as shared unknown ✓ shared-unknown across instances (prong-3)
```

All three prongs hold → INVERSION (constraint-solving), not WALKER. Pixel-diffuse is the constraint-solver.

## Output contract

```
PRODUCES
  model/output/pixel-gap-classifier.generated.json     (committed)
  .roadmap/round-N/artifacts/pixel-coverage-table.json (per-axis ranking)
  .roadmap/round-N/artifacts/<page>-disagree-heatmap.png (per-page visual)

VERIFY
  jq '.by_axis | keys | length' .generated.json >= 7
  jq '.by_axis.unknown' .generated.json > 0   (honest-unknown present)
  jq '[.[] | .disagree_count / .total_pixels] | add / length' .generated.json
    → mean pixel-disagreement-fraction (the closure metric)

ROUND-TERMINAL GATE
  pixel-disagreement-fraction drop ≥ 30% on FnPgRov + 4 pages → PASS
  any axis with ≥10% pixel-coverage gains r38 carrier name
```

## Anti-patterns

```
× rank carriers by axis name doctrinal preference        forge-by-bias
× UNKNOWN bucket = 0%                                    forge-by-omission
× single-page corpus                                     §Cross-page-sweep failure
× fabricate pick-buffer at PNG resolution without rerender  rot
× "we'll classify later" without pass-2 chunk manifest   §Diffusion-pass-typology violation
× cite pixel-disagreement-fraction without jq probe in receipt  §Validator-as-process trip
```

## Anchor · r37 first invocation

Closure metric `pixel-disagreement-fraction` introduced this round. Baseline measured at i-pixel-diffuse-corpus-build. Target -30% by i-pipeline-pass-10-rerun + v-pixel-disagreement-fraction-pass-1. Carriers ranked at i-carrier-ranking-by-pixel-coverage (P0 may invert prior cluster priority).
