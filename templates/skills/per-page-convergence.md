---
description: Invoke when authoring or executing a per-page convergence DAG · the template that drives one HMI page to visual+interactive parity with its enshrined screenshot. Distilled from fleet-rov-main-convergence (round-4). Use when spec-writing a new "make THIS page eerie and clickable" DAG, when stuck on per-region scope during execution, or when the dominant signal is user-facing (pixel similarity + clickability) rather than infra-facing (class counts).
---

# per-page-convergence

Reusable template for per-page convergence DAGs. Distilled from round-4's
`fleet-rov-main-convergence` (FnPgRov · the first page to apply this
pattern end-to-end).

## The thesis in one sentence

One page, one dominant signal: the staging render is eerily similar to
the enshrined legacy screenshot AND every major element responds to
clicks. Everything else (bug classes · detectors · cleanup) is language
for describing the work, not the metric for judging it.

## When to reach for this

```
  invariants GREEN-AT-CAPACITY     round-N+1 should be user-facing proof
                                   · not another round of mechanism
  
  page has screenshot evidence     docs/design/legacy-reference/<page>.md
                                   + <page>.png exist · at least two
                                   visible regions with distinct UX
  
  demonstrability matters          you're within a milestone · stakeholder
                                   needs to SEE the page · not hear about
                                   detector counts
  
  interactivity spine exists       B8 equivalent (composables for
                                   authority · modal · heartbeat · ack)
                                   is authored but not mounted anywhere
```

## The 10-phase shape

```
  B0  BASELINE + OBSERVATION              5 nodes · first batch
  B1  OPERATOR COMPOSITION PAGE           6 nodes · mount the spine
  B2  KNOWN-BUG CLOSURES                  4-5 nodes · seed bugs + discovered
  B3  PRIMARY CANVAS STUB                 3-4 nodes · the hardest region
  B4  MODE OVERLAY FAMILY                 5-6 nodes · PLAN-MODE
  B5  PER-REGION INTERACTIONS             4-5 nodes · rails · menus · panels
  B6  CHROME BAND COMPOSITION             3 nodes · persistent surface
  B7  VISUAL FIDELITY POLISH              4 nodes · typography · color · spacing
  B8  ASSAY INTERACTIVITY SUITE           4 nodes · click · mode · auth · mini-mission
  B9  DISCOVERED BUG-CLASS AUDIT          3 nodes · PLAN-MODE · classify what emerges
  B10 ACCEPTANCE                          3 nodes · critic + VP-final + interactivity-final
  TERM                                    2 nodes
```

Total: ~40-50 nodes · 2-3 plan-mode expansions to 5-8 children each.
Roughly half the size of a doctrine-wide DAG (like round-3's 104 nodes) —
appropriately narrower per /roadmap-spec doctrine.

## B0 · observation-first is doctrine

The first executable node is NOT implementation. It's measurement.

```
  B0.1  init                        mission recap · dominant signal named
                                    · page target · known bugs seeded
  
  B0.2  visual-baseline-capture     multimodal read of
                                    :5180/?layout=staging&page=<Page>
                                    side-by-side with legacy-reference PNG
                                    · enumerate every visible delta
                                    · screenshot diff stored in receipt
  
  B0.3  interactivity-baseline-     click every major element · log
         audit                      response or silence · every silent
                                    click becomes a work item
  
  B0.4  delta-enumeration            aggregate visual + interactivity
                                    deltas · categorize per region ·
                                    per-region ORDINALLY prioritized
                                    (worst visual gaps + most-impactful
                                    interactions first)
  
  B0.5  plan-from-observation       plan-mode · decompose B1-B10 from
                                    the delta list · not from guess
```

No one builds before looking. Observation produces the work list.
Agents that skip B0 build the wrong thing.

## B1 · operator composition page

The first page-specific node. Mounts the interactivity spine that was
authored in a prior round but never composed onto a real page.

```
  B1.1  author-<page>-composition    new Vue file (or existing page
        -shell                       wrapper) that mounts the B8 family
                                    · declares slots for chrome ·
                                    primary canvas · overlays · modals
  
  B1.2  mount-heartbeat              in chrome band · useHeartbeat
  B1.3  mount-severity-glow          overlay · useSeverity composable
  B1.4  mount-ack-button             conditional on fault state
  B1.5  mount-claim-authority-       edge placement · non-blocking
        ring
  B1.6  mount-modal-portal-stack-    dialog target · useModalStack
        root
```

Pattern: composition page is DUMB · it declares what mounts where ·
all logic is in composables · the page template is structure not
behavior.

## B2 · known-bug closures

Seed bugs come from the human + B0 observation. Each one either:
- fixes in-DAG (add a node, close it, receipt)
- classifies as a new bug class (B9 owns · earn a taxonomy slot)
- defers with named successor owner (GREEN-BY-DISPOSITION posture)

Round-4 seed bugs for FnPgRov were K1 (missing map toolbar) · K2 (SSS
action buttons not minimizable) · K3 (highlight region blocks clicks ·
probable class-12 CLICK-BLOCKING OVERLAY).

## B3 · primary canvas stub

Every page has ONE dominant region. For FnPgRov it's the map. For a
sonar-centric page it'd be the sonar canvas. The primary canvas usually
hits POST-DETACHMENT ceiling (hardware required) and lands as a STUB
per CLAUDE.md §"THE STUB CONTRACT".

```
  B3.1  author-<region>-post-        legacy layout · static axis labels ·
        detachment-stub              amber banner "POST-DETACHMENT ·
                                    requires X" · no hardware read
  
  B3.2  placeholder-content-         SVG grid or sine or checkerboard ·
        visual-credibility           makes the stub look like the thing
  
  B3.3  overlay-affordances-stub     waypoints · markers · interactive
                                    elements that float on top
  
  B3.4  emitter-wire                 pipeline tags the archetype with
                                    data-stub="post-detachment" +
                                    data-stub-kind
```

## B4 · mode overlay family

Most pages have a mode-mutex strip (modes switch view state). PLAN-MODE
because mode count varies per page.

```
  mode-strip-wires-to-state         keel or local state · one active
                                    at a time
  <mode-1>-overlay-stub             per-mode visual surface
  <mode-2>-overlay-stub             ...
  settings-mode-opens-modal         typically the last mode slot
```

Pattern: modes are mutex · active mode's overlay is visible · others
hidden · switching is clickable.

## B5 · per-region interactions

Rails · menus · side panels · tabs. Each has items that respond to
clicks.

```
  <region>-click-wiring              each item fires an action
  toggle-behaviors                  items that represent state toggle
                                    visibly
  dialog-wiring                     items that open modals do
  assay-spec                        playwright click-audit covers the
                                    region exhaustively
```

## B6 · chrome band composition

Top-of-page persistent surface. Page title · connectivity · authority
role indicator · severity glow host · heartbeat pulse.

```
  author-chrome-band-composition    the composition component
  left-center-right-slot-pop        per round-2 chrome-slot sub-classifier
  persistent-hmi-chrome-per-page    pattern for applying across pages
```

## B7 · visual fidelity polish

The eerie-similar part. Pixel-level tuning.

```
  typography-audit       fonts · sizes · weights match the screenshot
  color-audit            tokens · contrast · dark theme · saturation
  spacing-audit          gaps · padding · alignment · border radii
  screenshot-diff-       fresh screenshot · diff vs enshrined · measure
    baseline             pixel similarity on bbox grid · record gap
```

Use tokens from `packages/stratum-shared/src/tokens/design-tokens.css`.
Read `~/src/stratum/CLAUDE.md` before starting. No hardcoded colors.

## B8 · assay interactivity suite

The exhaustive click-and-verify suite. Every clickable element tested.

```
  <page>-click-spec                  exhaustive · every element
  <page>-mode-switch-spec           switch all modes · verify overlays
  <page>-authority-claim-spec       hold-gesture · role transitions
  <page>-mini-mission-end-to-end    scaled-down scenario on just
                                    this page
```

Use `assay drive` for state transitions · `assay run` for static checks.
NEVER raw playwright per CLAUDE.md §"Verification is assay".

## B9 · discovered bug-class audit

PLAN-MODE. Every new bug found during this DAG that doesn't fit an
existing class in `docs/design/bug-classes.md` becomes a candidate for
a new class. Round-4 candidate:

```
  class-12 CLICK-BLOCKING OVERLAY    pointer-events intercepting clicks
                                     from reaching intended targets
  class-13 MINIMIZATION MISSING      affordance absent that legacy
                                     supports
```

Per `/bug-class-hunting`: a class earns a slot if it has a MECHANICAL
DETECTOR. If you can't write a detector, it's not a class · it's an
instance to fix.

## B10 · acceptance

Three nodes: critic (six-question griffin-voice) · visual-parity-final
(pixel-similarity benchmark) · interactivity-final (click audit). The
critic names round-N+1 carry. The acceptance doc goes to
`docs/findings/<dag-id>-acceptance.md`.

## Terminal gates (non-negotiable)

```
  PRIMARY · user-facing dominant signal
    ≥ 90% pixel-similarity per-region vs enshrined screenshot
    ≥ 95% clickable-elements-respond on click audit
    zero clicks silently swallowed · zero intended targets blocked
  
  SECONDARY · bug class discipline
    every new bug classified per existing taxonomy OR earned a new
    class · no uncategorized drift
  
  TERTIARY · pattern preservation
    this round's playbook stays reusable for subsequent pages ·
    the 10-phase shape holds
  
  INVARIANT-PRESERVING (from prior rounds)
    I1/I2/I3/I4/ADR/ASSAY/KEEL-BOUNDARY don't regress
    but may stay at prior GREEN-AT-CAPACITY state
```

## Scope-out discipline

Per-page convergence explicitly does NOT do:

```
  ❌ retirement of extraction paths           → dedicated retirement DAG
  ❌ extraction-side mechanism work           → pipeline thesis DAGs
  ❌ cross-page regression sweeps              → later round once 3
                                               pages have the pattern
  ❌ infrastructure refactors (IR-lowering)    → structural DAGs
  ❌ keel-boundary hygiene (B-day prep)        → dedicated hygiene DAG
```

Page signals vs pipeline signals are different work. Keep them in
different DAGs.

## Meta-#8 integration

GREEN-BY-DISPOSITION applies: residuals in any phase close with named
round-N+1 owners · never "good enough to ship." See CLAUDE.md §
"GREEN-BY-DISPOSITION · closure without hard zero".

## The compounding effect

Round-4 applies this template to FnPgRov. The template landing IS
the methodology-contribution. Round-5 applies it to FnPgRovMk3
(hardest case per `/rovmk3-thesis`). Round-6 to FnPgMission.

Three pages under the same playbook means the convergence criterion
is repeatable — not bespoke per-page. That repeatability is the real
round-4 deliverable.

## r25 canonical exemplar · FnPgRov GBD-carrier-exposing

Round-25 re-ran FnPgRov under the three-way diff (predictor · topology ·
screenshot · see /rovmk3-thesis). The page did NOT converge to hard-
green; it converged GREEN-BY-DISPOSITION **with every residual routed
to a named bug-class carrier**. That posture is now the canonical shape
for this template:

```
  dominant signal lands at capacity (≥90% pixel-similarity)
  residuals enumerated per-region · verdict assigned per the five-category
    matrix (all-agree · render-bug · predictor-gap · intentional-deviation ·
    all-disagree)
  every render-bug/predictor-gap routes to bh:class-N-<kebab> with
    round-N+1 owner
  intentional-deviations cross-checked against model/deviations.json
  no fourth category · no "good enough" · no "we'll look later"
```

The GBD-carrier-exposing pattern is the honest shape: convergence means
the residuals are NAMED and ROUTED, not ABSENT. Apply this to FnPgRovMk3
and FnPgMission next — don't chase hard-green, chase complete routing.

## Read these

1. fleet/CLAUDE.md §"Dominant signal · infra-facing vs user-facing metrics"
2. fleet/CLAUDE.md §"GREEN-BY-DISPOSITION · closure without hard zero"
3. /bug-class-hunting · for the taxonomy + new-class earnability rule
4. /rovmk3-thesis · forensic staging-quality thesis
5. /keel-boundary-thesis · stratum/keel/pipeline protocol discipline
6. docs/design/legacy-reference/<page>.md + .png · the convergence target

## One-line template

> One page. One dominant signal. Observation first · known bugs ·
> primary canvas · modes · interactions · chrome · polish · assay ·
> classify what emerges · accept honestly. Repeat per page.
