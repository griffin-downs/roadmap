---
name: fleet-doctrine
description: Full §-anchor library for the fleet metarepo · ~80 anchors with empirical depth (shas, dates, round-anchors). Use when a §-anchor is cited and depth is needed, or when authoring/extending doctrine. Searchable by §<name>.
---

# Fleet doctrine · §-anchor library

This skill holds the full text of every §-anchor authored across rounds r25-r39. CLAUDE.md is now a thin pointer file (§No-doctrine-in-CLAUDE-md). All empirical depth, anchors, falsified hypotheses, per-round Discipline-notes preanchor + LATE blocks, and Meta-pattern-validation tables live here.

Per-round retrospective tables (r31-r35) live in `/fleet-doctrine-history`. Rounds r36-r39 LATE/preanchor blocks live below in this file.

Search by §-name. Original CLAUDE.md content (1546 lines) preserved verbatim below.

---

# fleet — doctrine

The metarepo for the FUSION HMI replacement effort. Coordination + canonical model + analysis + dashboard. Code lives in sibling repos.

## Thesis

The legacy HMI is being reimplemented as a single function:

```
binary + deviation list ──→ pipeline ──→ CSS + wiring + components
```

The binary is the database. The deviation list is the only authored content. Everything else regenerates from the binary on demand. See `docs/pipeline.md`.

A year-long manual rewrite collapses to weeks because the approach structurally eliminates source-reading, per-feature design, implementation typing, and drift management. The pipeline is a UI decompiler, not a tool that assists human porting.

## §Three-non-negotiables

1. **No legacy C++ source reading.** Compiled outputs only — MOC, PDB, string tables, decompiled binary, runtime accessibility tree, log capture. Source-reading reintroduces the unreliability the whole approach was meant to escape. *Mechanical syntax extraction is permitted* (tree-sitter on call-sites = same category as MOC parsing). **Test:** does the operation require an opinion about what the code DOES? Yes → prohibited. No → permitted.

2. **The model is the database.** Pipeline, analysis, reports, roadmap, deviation list — all functions of `model/raw/ir-snapshot/latest.json` (queried via `model/ir/query.ts`) populated into `model/output/hmi-schema.json`. Hand-tracked is drift waiting to happen.

3. **Deviation categories ≤15, net-add forbidden.** Cap is on CATEGORIES; each contains unlimited rules. When pressure builds for a 16th, consolidate or redesign — never relax the cap.

## The pipeline is a UI decompiler · zero-judgment target

Binary in, web UI out, no human in the loop.

```
binary             FUSION.exe + FUSION.pdb (reference · observed not read)
deviations.json    ≤15 categories · intentional departures from legacy
design-system.json target archetype catalog · authored once
```

**Every task does one of:** SHRINK judgment table via mechanical extraction · IMPROVE extraction quality · VALIDATE via assay spec · EXTEND target vocabulary. Work outside these four is drift.

**Deviation vs extraction:** if the answer changes when binary version changes → EXTRACTION. If it stays the same → DEVIATION.

**Pre- vs post-detachment:** pipeline extracts STRUCTURAL (layout · archetypes · wiring · chrome · navigation · state machines). HARDWARE-coupled (video decode · GL shaders · sonar waterfalls · camera streams) is authored, not extracted. **Test:** requires reading/writing a physical device's data stream not derivable from UI structure? YES → post-detachment · land a STUB. NO → pre-detachment · pipeline handles end-to-end.

**Stub contract:** post-detachment components ship as stratum components rendering legacy layout · static labels · `POST-DETACHMENT · requires X` banner · NO real hardware read.

**Assay validates extraction.** Each passing assay spec proves one judgment-table entry mechanical.

## Topology corpus · runtime counterpart to IR snapshot

```
IR snapshot   binary facts (compile-time) · model/raw/ir-snapshot/latest.json
topology      runtime facts (rendered) · model/output/topology/<page>.<state>.<res>.json
```

Per (page, state, resolution): every pixel's layer stack. CLI: `npx tsx model/bin/topo-sweep.ts`. Pipeline step-19 emits opt-in via `--with-topology`. Detector seeds: occlusion graph · off-viewport-at-res · depth-vs-dom-drift · pick-but-invisible · state-delta · resolution-delta. Sweep output → assay input.

## Proving order · authored deviations LAST · extracted workflows FIRST

The thesis is tested by EXTRACTED workflows behaving identically to legacy — not by authored deviations being capable.

**Test:** does proving this workflow test the pipeline's decompiler thesis? NO → authored overlay · defer until N extracted workflows landed. YES → extracted workflow · P0 candidate.

## Refreshers · lazy-loaded skills

Pipeline/extraction: `/pipeline-thesis` · `/pcode-ir-lowering` · `/bug-class-hunting`. Staging: `/rov-thesis`. Boundaries: `/keel-boundary-thesis`. Agents: `/meta-directives`. Per-page: `/per-page-convergence`. Linear: `/linear-audit`. Doctrine history: `/fleet-doctrine-history`.

## Agent meta-directives · little genius mode

Eight directives — scars from specific failures. Include in every dispatch brief. Depth in `/meta-directives`.

```
1. SHOW DON'T ASSERT             observe what you produce
2. READ BEFORE WRITE             grep · read · then write
3. SURFACE BLOCKERS LOUDLY       stop · name the block · return
4. COMMIT MESSAGES TO FUTURE YOU explain the why
5. CROSS-CHECK REALITY           state belief · verify · update
6. THE COCKPIT IS GROUND TRUTH   don't remember · check
7. PROBE BEFORE ANCHOR           archetype may not be populated
8. PROVE BEFORE RETIRE           dominance proven · then delete
```

**#8 is most-cited.** Never delete because a replacement exists; delete because dominance is proven. Contract: (a) parity gate green on every page, (b) all consumers reading the new output, (c) smoke regen confirms no regressions, (d) THEN delete.

## Cross-repo design discipline

Before authoring any stratum component: read `~/src/stratum/CLAUDE.md` and `~/src/stratum/docs/design-system.json` (13 hardFailures CI-enforced). Clone closest canonical in `packages/surface-console/src/components/display/`. Write `.story.vue` alongside. Use tokens from `packages/stratum-shared/src/tokens/` — never hardcode colors. Test experience (recognizable with text removed), not structure.

~80% of new work composes existing primitives · ~15% extends a family · ~5% truly new.

## §Wave-grounding

Component-authoring waves MUST verify archetype overlap between wave's component list and round's user-facing target page(s) BEFORE dispatch.

```
pre-dispatch contract · brief MUST contain
  target-page archetype set    enumerated from classifier
  wave's component list        4 names
  intersection count           must be > 0 to dispatch
```

**Smell:** wave with zero overlap = forensic dispatch failure — components mount nowhere visible.

**Test:** before dispatch, list target-page archetypes and wave's component names side-by-side. Any intersection? If no, brief is wrong.

**Anchor · r31:** wave-1 authored Container/Page/DialogPanel/DisplayPanel · FnPgRov needed Button/ToolPanel/MagPanel/MapPane/etc · zero intersection · diversity dropped instead of rising.

## §Dumb-components · intelligence lives in the DAG

Every Vue component in fleet's cockpit AND stratum's display layer is DUMB. Single load-bearing rule.

```
dumb means
  props in            component takes typed props
  events out          emits typed events
  refs from composables   reactive state via composables
  render what you're told  template binds refs · nothing else
```

**The rule:** if removing `<script setup>` would leave a still-functional render-only component fed by a composable, the component is dumb. If `<script setup>` carries the load, it isn't.

**Smells:** fetch/axios/HTTP in `<script setup>` · async/Promise · state derivation · validation · setTimeout · localStorage · imperative DOM · computed >5 lines.

**Required in every dispatch brief touching `.vue`:** "Dumb component rule: intelligence lives in the DAG, not in `<script setup>`. Props in, events out, refs from composables."

**Silhouette test:** remove `<script setup>` · does the template still compile against a mock composable returning literal refs? Yes → dumb.

## §Goldilocks-size · TypeScript file discipline

```
sweet zone        80–250 LOC    one concern · reads cleanly
acceptable        up to 400     if cohesion is high
smell · justify   400–600       refactor note
don't ship        > 600         extract · split · compose
```

**Goldilocks test:** can you summarize the file's job in one sentence without "and"? Does every export belong to that job? Cohesion beats size. Function-level: 10–40 LOC · max one nesting level · guards first.

## Feature acceptance · two paths · both require assay

```
GENERATED (80%)
  1. populator emits widget/behavior into model/output/hmi-schema.json
  2. HmiRuntime.vue dispatches schema node at runtime
  3. assay spec validates schema → render against binary
  4. screenshot in docs/render-checks/

AUTHORED (5% · sandbox)
  1. dumb component (props in · events out · no logic)
  2. real assay spec (not assertions: [])
  3. passing receipt against running surface + keel
  4. screenshot read multimodally before advance

smells (either path):
  ❌ assertions: []      ❌ spec exists but never executed
  ❌ receipt older than commit       ❌ "we'll add the assay later"
```

## GREEN-BY-DISPOSITION · closure without hard zero

Four conditions, all required: (1) every residual has NAMED round-N+1 owner; (2) receipt enumerates residuals; (3) meta-#8 still applies — GBD is for TAXONOMIC closure not STRUCTURAL; (4) validator relaxation is VISIBLE in the DAG.

**Anti-pattern:** relaxing a validator without naming successor work = forged green.

## RED-is-good-when-named

Honest RED routed to named carriers beats forged GREEN with zero carriers.

```
what RED means when surfaced by assay
  reproducible · routable · bounded · fixable
```

**Acceptance pattern:** when user-facing gates land RED-absolute but route 1:1 to GBD carriers, acceptance is PASS-via-GBD, not FAIL.

## §Diversity-regression-is-blocker

Any drop in archetype-classifier vocabulary count between rounds, OR any drop in distinct `data-archetype` values between user-facing probes of the same page, is STRUCTURAL FAILURE — never GBD candidate.

```
verdict
  count rises    → converging · expected
  count flat     → no progress · named carrier
  count FALLS    → BLOCKER · trace before round-terminal closure
```

**Test:** can you name specific archetypes present in round-N but absent in round-N+1? If no, regression not yet diagnosed; round cannot close.

**Anchor · r30→r31:** FnPgRov diversity 13→11 · two missing archetypes never identified within the round.

## Pipeline-tempo must exceed agent-turn-tempo

```
< 5 min      tight feedback loop
> 10 min     breaks single-agent dispatches
> 20 min     requires orchestrator-level monitoring
~25 min      current cold-Ghidra baseline
```

Architectural principle: Ghidra is a preprocessor · runs ONCE per binary. TypeScript interprets all subsequent stages. Commits are schema versions · regen is migration.

## Synchronous-only node marker · scope boundary

```
synchronous-only when:
  node touches the pipeline                    (Ghidra regen breaks tempo)
  node requires tablet / physical device       (USB + adb + watching)
  node requires wall-clock measurement         (before/after needs human)
  node requires paper-polish with screenshots  (judgment call)

autonomous when:
  docs-authoring · design + GBD routing · receipt consolidation ·
  audit / grep walk / cross-check
```

Mark in spec node JSON: `"dispatch_mode": "autonomous" | "synchronous" | "parallel-authorized"`. Default autonomous. Autonomous run encountering synchronous node must STOP, surface, land GBD receipt — never forge.

**Test:** "if I advance with only a doc receipt, will next round find the same node open?" Yes → synchronous-only.

## §Bug-hunt-as-regression-gate · not absolute-zero gate

```
target=0          north star · what every class eventually reaches
frozen-baseline   model/baseline/bug-hunt-baseline.json
gate fails        any class count EXCEEDS frozen baseline
gate passes       all class counts ≤ frozen baseline
baseline refresh  ONLY when a class count FALLS · never raise to mask
```

Refreeze when pipeline fix CORRECTED a fabrication the baseline encoded · receipt names the transition. Hold frozen otherwise. **Test:** does the baseline OVER-REPORT correctness? If yes → refreeze. If no → hold.

## Cross-round claim verification

Every round opens with a claim audit against predecessor's terminal verdict. Each headline claim gets a probe (grep · artifact-exists · smoke-regen). Claims that pass → premises. Claims that fail → `blocker-upstream` · NEVER quietly re-landed.

## §Plan-children-executor-doctrine

Plan-mode nodes emit `*children.json`. Those drop silently unless either (a) absorbing executor exists in the live DAG, OR (b) expanding agent runs `roadmap dag insert` to land children in the same batch.

```
detection   at /roadmap-term · grep *children.json · for each, assert
            a live DAG node consumes it · unabsorbed = dropped thread
discipline  plan-mode spec MUST name absorbing executor OR
            expanding agent MUST dag.insert in same batch
```

## §Fail-hard · no legacy support

We do not preserve compatibility with old shapes. We do not accept both "legacy" and "canonical" paths, flags, or field names. We do not add tolerant fallback logic "just in case." When a shape changes, the old shape goes away in the same commit.

```
❌ accept both paths "for now"
❌ check field both old and new names
❌ silent default fallback when key missing
❌ try/catch swallowing malformed input
❌ "TODO: migrate callers later" without deletion DAG named

✓ pick ONE canonical path · crash loudly otherwise
✓ rename + update all call sites in same commit
✓ required key missing → throw with diagnostic
✓ migration atomic OR explicit pre-requisite · never graceful-degrade
```

**Allowlist pattern for cross-page mutators:** any step mutating page-scoped state declares `ALLOWED_CLASSES` explicitly · throws on unlisted. **Test:** "can this mutator silently broaden scope without a receipt?" If yes → add allowlist.

**Relation to meta-#8:** fail-hard is forward direction (don't accept both on creation); meta-#8 is backward (don't delete old until new is dominant).

## Pipeline fallback · block and surface, never guess

```
✅ BLOCK AND SURFACE   emit into conflicts.json with reason + suggested-analog
🟨 SANDBOX             new components land in sandbox/ with promote marker
❌ NEVER GUESS         wrong guess propagates through 474 actions
```

Existing stratum content (49 nodeRegistry entries · 4-role authority model · 26 displayContracts) is INPUT, not output. Pipeline preserves authored content and ADDS missing coverage.

## Staging preview URL · the trap

Vite's SPA fallback serves `index.html` 200 for ANY path → silent success against wrong surface.

```
correct      http://localhost:3000/?layout=staging&page=<PageName>
port         3000 (stratum dev server)
path         /  (root) · NOT /staging/*
query        ?layout=staging  &page=X  &live=0|1  &hud=1
```

200 HTTP is NOT proof the right content rendered. Verify with assay probe that DOM contains staging-specific markers.

## Verification is assay · not raw playwright

When the task is "launch a browser · scan DOM · check behavior · verify render" — reach for `~/src/assay`, not playwright. Assay IS built on playwright; using playwright directly bypasses fleet's observation substrate.

```
assay verbs
  probe <url>          full DOM cross-section + screenshot
  run <spec.json>      execute deterministic DOM assertions
  drive <spec.json>    operate robot through keel
  validate <dag.json>  InteractionDAG schema check
  parity <keel> <stratum>  state vs surface diff
```

**Test:** writing playwright boilerplate inside fleet or any sibling? Stop. If the thing isn't an assay verb, consider whether it should become one. Exception: one-off debugging is fine; rule is about LANDED verification code.

## Multimodal inspect discipline

Agent has multimodal vision. Use it.

```
visual         dev server → screenshot → Read → verify
functional     run the thing → read the output → verify behavior
infra          build → run → hit endpoint
```

Validators are the floor; agent's own inspection is the ceiling.

## Per-phase intensity discipline

```
phase shape              agent intensity      human attention
─────────────────────    ────────────────    ─────────────────
wide observation         MEDIUM · thorough   LOW
scaffold trunk           LOW · mechanical    LOW
★ launch-check           HIGH · multimodal   HIGH
service implementation   MEDIUM · typed      LOW
panel impl + render      LOW impl/HIGH check LOW
verification wide batch  LOW tests/HIGH fail TRIAGE
★ tablet / physical      HIGH · real device  HIGH
★ terminal intent gate   ULTRATHINK          ULTRATHINK
```

Trunk moments marked ★ always warrant full attention.

## Layout

```
fleet/
├── CLAUDE.md                        doctrine (this file)
├── docs/
│   ├── qt-feature-catalog.json      authored tracker seed
│   ├── retrofit-era-terminal.md     archive readers-guide
│   ├── pipeline.md                  three-file mental model
│   └── fleet-rov-thesis.md          forensic staging-quality doctrine
├── .roadmap/                        ephemeral round artifacts
│   ├── round-N/                     per-round receipts (JSON)
│   ├── trail.jsonl                  what happened
│   └── heads/                       archived DAGs
├── model/
│   ├── ir/query.ts                  engine · 502 LOC · 15 verbs
│   ├── schema/hmi-schema.ts         primitive · 296 LOC
│   ├── raw/ir-snapshot/             gitignored · 1.46 GB
│   ├── raw/qt-feature-coverage.json committed anti-orbit tracker
│   └── deviations.json              authored overlays · 14 entries
├── pipeline/
│   ├── build-schema.ts              orchestrator
│   ├── compute-qt-feature-coverage.ts
│   ├── generators/                  LLM-diffused · emits committed .generated.ts
│   │   ├── core.ts                  shared harness · chunk manifests
│   │   └── archetype-classifier.ts  442-entry · confidence-scored
│   └── populators/
│       ├── structural.ts · wiring.ts · declarative.ts  (consumes .generated.ts)
│       ├── slot-effects.ts · visibility.ts · apply-deviations.ts
│       └── index.ts
├── model/legacy-syntactic-probes/   committed grep oracles · planning only
├── codegen/
│   └── archetype-registry.ts        generator · emits to stratum
└── ghidra_scripts/                  lowering · Java · touched rarely
```

## Sibling repos

| Repo | Role | Generator territory? |
|------|------|----------------------|
| `~/src/donjon`   | Infrastructure scaffolding (CI · package.json · protocol types) | Yes — donjon owns L0 |
| `~/src/keel`     | Interaction model runtime · no build-time concerns | No — generator output target |
| `~/src/stratum`  | Pure renderer (`render(keel)`) | No — output of `keel generate` |
| `~/src/assay`    | Observation + verification | No — verifies, doesn't generate |
| `~/src/.dev/legacy-fusion-hmi` | Read-only Qt 5.11.3 source + MOC | Mining input only |

## Keel boundary · remote-by-design

Keel is a peer process reached over the wire, always. Collocation is deployment convenience, not architectural commitment.

**Five invariants (CI-enforceable):**

```
I    NO IN-PROCESS SHORTCUTS   stratum never imports keel internals
II   KEEL_URL IS CONFIG        env at boot · never hardcoded
III  AUTH TOKEN ALWAYS PRESENT even on localhost
IV   CONNECTION IS RETRY+      stratum survives keel restart
     HEARTBEAT
V    ASSET STORE KEEL-MEDIATED pipeline NEVER writes stratum's filesystem
                               directly · always via keel ingest endpoint
```

**Purity test:** can I move keel to a different machine without changing stratum code? Restart keel without reloading the tablet? Connect a second stratum? Run stratum against a mock keel? Any "no, because we collocated X" → tech debt today.

## §Component-keel-decoupling

Legacy FUSION HMI has no SessionContext. Generated stratum components do NOT `inject` keel, session, or global state — they take props in, emit events out (§Dumb-components). Staging-preview path feeds mocked props; runtime path feeds keel-mediated props via the dispatcher.

```
staging-mock at root      provide(SessionContextKey, mockSessionContext)
                          mockSessionContext returns literal refs · no keel call
runtime-mediated at edge  HmiRuntime dispatcher reads schema · feeds keel-derived
                          props down · child components remain prop-only
```

**Test:** can the component mount with `provide(SessionContextKey, null)` if staging-mock injects literal refs? Yes → decoupled.

**Anchor:** r31 30+ AsyncComponentWrapper + SessionContext-not-provided fatals; r32 i-session-context-provider-fix unblocked at staging boundary; r33 carrier owns retiring 13 hand-coded keel-coupled twins per meta-#8 cross-repo.

## The pipeline is permanent infrastructure

Scorched-earth r28: 20-step retrofit pipeline (46,940 LOC) retired at tag `retrofit-era-terminal`. Current kernel ≈3,594 LOC. One orchestrator · populator-driven · runtime dispatch.

```
FUSION.exe + FUSION.pdb
       │
  Ghidra · ONCE per binary
       │
  model/raw/ir-snapshot/latest.json   (gitignored · 1.46 GB)
       │
  model/ir/query.ts                   (15 verbs · TS · the API)
       │
  pipeline/build-schema.ts            (orchestrator)
     ├─ pipeline/generators/*.ts      (LLM-diffused · emits committed .generated.ts)
     └─ pipeline/populators/*.ts      (structural · wiring · declarative · …)
       │
  model/output/hmi-schema.json        (gitignored · canonical DB)
       │
  stratum/HmiRuntime.vue              (one mount · dispatches any page)
```

Two phases: `lower(binary) → IR snapshot` (Ghidra · ONCE) · `interpret(IR) → schema` (TypeScript · every run). Java transcribes; TypeScript interprets; commits are schema versions; regen is migration. Doctrine: `/pcode-ir-lowering`.

**Corpus-as-database.** IR corpus is database · TS query grid is API · populators + detectors + overlay are views. If a question needs a new scratch script, the API is missing a verb — add it.

**Per-page emit retired.** No more `emit-staging.ts` per page.

## LLMs-as-diffusion-machines

LLMs (chat sessions · agent dispatches) are the DIFFUSION machines that translate the 1.46 GB IR corpus into a working HMI. Diffusion happens during AUTHORING — agents read slices and crystallize understanding into committed TypeScript.

The tool itself contains NO LLM dependency. Each populator, each IR verb, each pattern is one crystallized diffusion.

## §No-LLM-in-build-path

Hard rule, no exceptions.

```
❌ import * from '@anthropic-ai/sdk'  (or equivalent) in any committed file
❌ prompt templates in the repo
❌ build-time model calls
❌ ANTHROPIC_API_KEY                   in any CI or docker config
```

Regression-gated via `v-regression-gates` node every round.

## Multi-pass diffusion to fidelity

Each round = one or more passes · each pass crystallizes diffusion · followed by gap-diffusion survey that diagnoses uncovered slices · successor round's carriers = those gaps.

```
Pass N           populate schema from IR via current populators
Gap Diffusion N  agent reads residuals · diagnoses · emits carrier manifest
Pass N+1         addresses top-priority carriers
```

**Anti-pattern:** single-pass "done" claims. Honest partial coverage with named carriers beats forged completeness.

## §Diffusion-pass-typology

Diffusion is a FAMILY of cognitive operations · different I/O contracts and success metrics. Naming the types makes them composable.

**Eight pass types:** BROAD · RESIDUAL · HARD-RESIDUAL · MULTIMODAL · GROUNDED · DIFFUSE-BACK · EMIT · INVERSION.

**Naming:** `i-<corpus>-diffuse-<type>-pass-N`.

**Per-type receipt slots (mandatory):** chunk_count · pass_type · prev_pass_ref · per-type metric · zero_doctrine_violations · honest_unknown_count · carrier_manifest.

Depth + per-type metric tables: `/fleet-doctrine-history` (search "§Diffusion-pass-typology").

## §Diffusion-discovery-pattern

META rule · two-crystallization proven (r29 archetype-classifier · r31 pcode-shape-classifier). When unknown taxonomy lives in a structured corpus, run multi-pass diffusion to discover it, crystallize as committed `.generated.ts`, hand-author thin TS layer that consumes it.

**Template · five steps:** SCAFFOLD CORPUS · MULTI-PASS DIFFUSE · EMIT .generated.ts · HAND-AUTHOR THIN LAYER · RE-MEASURE YIELD.

**Applicability test · all three required:** structured corpus enumerable · unknown taxonomy without prior schema · crystallizable as committed TS lookup.

Empirical anchors + per-pass curves: `/fleet-doctrine-history`.

## §Generator-protocol

Three layers · one direction · no reverse dependencies. Generator IS the author · committed `.generated.ts` is source-of-record.

```
LAYER 1 · GENERATOR    pipeline/generators/*.ts (LLM-diffused · session-scoped)
LAYER 2 · POPULATOR    pipeline/populators/*.ts (build · pure TS · runs every regen)
LAYER 3 · RUNTIME      stratum/HmiRuntime.vue (dispatch · renders schema)
```

**Hand-coded rule + generator rule coexisting = PBR owed** (meta-#8). Once `.generated.ts` proves dominant, hand-coded twin deleted in same commit (§Fail-hard).

**Build path is LLM-free.** Generator executes during AUTHORING — at populator-run-time no model is touched. **Test:** can a teammate with no API key run the pipeline end-to-end? If no, generator leaked.

## §Component-generator-protocol

THIRD application of §Diffusion-discovery-pattern. Components are GENERATED, not hand-authored.

```
three crystallizations · canonical artifacts
  r29   archetype-classifier.generated.ts     442 entries · 13 labels
  r31   pcode-shape-classifier.generated.ts  2628 entries · 13 labels · 71.31%
  r32   archetypes-generated/*.generated.vue   32 components
```

**Cadence:** pass-1 broad · pass-2 multimodal · pass-3 emit · pass-4 retrofit-grounded.

**Inputs:** retrofit-era exemplars (git tag retrofit-era-terminal) + legacy-reference PNGs + archetype names + design-system tokens + hmi-schema widget shape.

**Test:** can a teammate with no API key run `npm run build` end-to-end against the binary AND get the rendered components? Yes → protocol holds.

Receipts + shas: `/fleet-doctrine-history`.

## §Populator-consume-protocol

Substrate landing alone is NOT done. **Populator consumption is the empirical-lift proof point** — until populator reads substrate and `model/output/hmi-schema.json` shifts measurably, substrate is dead weight.

**Wiring contract · four hops, each must shift:**

```
substrate (.generated.ts | IR verb)        layer-1 · authoring
     │   test: unit-green on real IR
     ▼
populator (pipeline/populators/*.ts)       layer-2 · consume + emit
     │   test: schema field count > 0
     ▼
model/output/hmi-schema.json               canonical DB
     │   test: zod-green · field present
     ▼
HmiRuntime.vue dispatch + DOM attribute    layer-3 · runtime
         test: assay probe sees attribute
```

**Falsification trap · §Schema-runtime-contract-gap:** schema lift ≠ DOM lift. Every populator-consume node owes a DOM-attribute gate (or names runtime carrier owning it).

**Meta-#8 cross-repo:** populator-side dominance must be proven AND consumer-side (stratum) must accept BEFORE any hand-rule retirement. Consumer is the dominance test.

r30 anchors + per-axis evidence: `/fleet-doctrine-history`.

## §Operand-tree-eval

Const-propagation fold over IR pcode operand trees · `model/ir/pcode-eval.ts` (194 LOC · 14/14 contract tests green). Canonicalizes opcode chains into resolved scalar operands.

**Fold rules:** INT_ADD/SUB/SDIV/MULT(const,const) · LOAD(global-const-addr) · PTRSUB(receiver,offset) → resolved member-access. Any other / unseeded LOAD → unresolved (honest).

**Kind taxonomy:** const-int · const-size · expression · unresolved. **Honest `unresolved` is correct** when LOAD globals are unseeded — populator OMITS the field rather than emit fabricated rect (§Three-non-negotiables).

**r30 fold ceiling:** setVisible 56.7% folded · setGeometry 0% (LOAD-of-globals unseeded · honest-RED, not regression). r31 carrier `r31-load-inference-deeper` owns extending `EvalContext.knownGlobals`.

## §Pcode-shape-classifier

Specific application of §Diffusion-discovery-pattern to operand-tree corpus. r31 emit: `pcode-shape-classifier.generated.ts` · 2628 entries · 13 labels · 71.31% cumulative-high after 3 passes.

**Top-5 labels covered by 5 fold handlers:** dpi-scaled-const · dpi-arithmetic-mix · float-truncated-scale · parent-anchored-offset · parent-anchored-fraction · 81.2% of corpus.

**Fold-rules-author cap · top-5 only.** Pcode-eval at 350 LOC · adding 7 more handlers blows §Goldilocks-size. Tail 19% is r32+ work.

Distribution table + ceiling discussion: `/fleet-doctrine-history`.

## §Schema-runtime-contract

Schema lift does NOT automatically appear in DOM. Every new schema field requires explicit dispatch in `stratum/HmiRuntime.vue` to land as a DOM attribute.

**Wiring obligation · per schema field:**

```
schema.geometry              → data-geometry="x,y,w,h"
schema.connections[].target  → data-connection-target="<sig>"
schema.visibility.kind       → data-visible="true|false|<expr>"
schema.archetype             → data-archetype="<name>"  (already wired)
```

**Test:** does `assay probe <verified-url>` see the new attribute? Yes → contract closed. No → carrier owed.

**r30 evidence:** pipeline emitted 54 connections; DOM had 0 `data-connection-target` attributes before runtime-dispatch carriers landed.

## §Schema-runtime-contract-loop

Formalizes the lift-then-wire-then-prove cadence as routine. Three steps · per field · non-skippable.

```
1. LIFT    populator emits to model/output/hmi-schema.json
2. WIRE    stratum (HmiRuntime.vue · RenderWidget.vue) maps schema field
           to DOM attribute
3. PROVE   assay run <spec.json> against URL-verified surface
           (§Brief-template-render-verify owns step-1 of probe)
```

**Brief MUST name:** step-1 LIFT (populator + verb) · step-2 WIRE (stratum component + DOM attr) · step-3 PROVE (URL + spec + gate). Brief MUST instruct: URL-verify FIRST · probe gates SECOND.

**Audit-as-planning-oracle pattern · r31 canonical:** read-only forensic walk produces per-field gap-table · 14 fields · 8 gaps. Spec for downstream wire-up nodes (NOT a code edit). Forensic before constructive.

## §Brief-template-render-verify

Any render-adjacent dispatch brief MUST instruct agent to FIRST verify which URL produces visible content on the CURRENT stratum branch, THEN probe gates against verified URL.

**Two-step protocol · non-negotiable:**

```
1. VERIFY URL    assay probe <candidate-url>
                 assert response contains page-specific marker
                 if absent → URL is wrong · stop · surface
2. PROBE GATES   assay run <spec.json> against the verified URL
```

**Test:** can the brief name URL-verification artifact (markers asserted) BEFORE the gates? If no, brief is template anti-pattern · reject before dispatch.

## §Gate-premise-mismatch

Distinct from GBD-forgery. When a gate's spec **presumes a scope the round didn't execute**, gate measures something different than its assertions presume. Resolution: relax gate to measure what round DID prove, route original intent to successor carrier with SAME NAME.

**Test:** did round execute the work the gate presumed? Yes + still red → GBD-or-fix. No → premise-mismatch · relax + route.

**Anchor:** r29 v-schema-populates-pass-2 presumed populator-consume executed; only substrate landed. Honestly-relaxed; v-schema-populates-pass-3 inherited intent.

## §Meta-#8-cross-repo

Existing meta-#8 PBR rule applies across fleet/sibling-repo boundary. Never retire fleet hand-rule before consumer in stratum (or other sibling) accepts new shape. Dominance is proven at consumer, not producer.

**Cross-repo PBR contract:**

```
1. new shape lands in fleet (or other producer)
2. consumer in sibling repo updates to accept · commits
3. parity probe across consumers proves dominance
4. ONLY THEN retire the hand-rule in fleet · same commit as proof receipt
```

**Anti-pattern · r29:** fleet retired hand-coded archetype map · stratum registry only had fine-grained names · 39/40 widgets fell through to stub. r30 fix: consumer-side acceptance landed BEFORE producer-side dominance probe.

## Entropy-flow-diffusion

```
pass-1   broad Qt-prior ride     high-entropy · wide catalog sweep
pass-2   residual feedback       medium-entropy · unknowns from pass-1
pass-3   hard residual           low-entropy · one-off anomalies
                                 (survivors are authored, not extracted)
```

**The curve IS the falsification gate.** If pass-2 lands below pass-1 surplus, diffusion regressed.

## Chunk-level-LLM

Diffusion batches IR corpus into chunks sized for a single chat session. Mechanism is files-on-disk, never SDK.

```
1. GENERATE MANIFEST    pipeline/generators/core.ts writes chunk-N.json
2. AGENT READS          Claude Code session · one chunk at a time
3. AGENT REASONS        per-entry classification · confidence · honest "unknown"
4. AGENT WRITES         response-chunk-N.json to disk · no SDK call
5. AGGREGATOR MERGES    next-round merges responses
6. EMIT CRYSTALLIZES    .generated.ts committed · review in PR
```

**Why not SDK-drive it?** A committed SDK call is a runtime LLM dependency by another name. Chat-session-as-generator keeps build pure. PR diff is the audit trail.

## Convergence-curve-empirical

Round-terminal verdict · named explicitly.

```
HELD       curve at-or-above prediction across all tiers · converged
PARTIAL    curve below target but monotone-improving · named carriers
FLATTER    curve plateaued · asymptote below target · carrier owed
STEEPER    curve regressed · blocker-upstream · investigate
```

**Discipline:** report against ONE denominator. Changing denominator mid-round to flatter a verdict = forged green.

## Legacy-syntactic-probes

**Bounded budget: ≤20 probes per round.** Round reaching for 21 has slid from planning-oracle into source-reading. Lifts the implicit "no source reading ever" rule to its actual doctrinal form: **no source reading for semantic opinion · mechanical syntax probes permitted with discipline**.

```
PERMITTED (mechanical · no opinion formed)
  grep for symbol counts · presence/absence · syntactic patterns ·
  file/line-count tuples · .qrc manifests

PROHIBITED (requires an opinion about what code DOES)
  grep -A / -B / -C surrounding context · reading function bodies ·
  tracing control flow by eye · extracting behavior narratives
```

**Three guardrails:** committed artifacts in `model/legacy-syntactic-probes/<name>.sh` · spec not binary (grep informs UPPER BOUNDS · IR reads at runtime) · bounded budget.

**Where grep sits · where it must not cross:** grep is PLANNING ORACLE for next IR verb's test bounds. Binary stays the database. If a probe answers a question the IR could answer, IR is missing a verb — add it.

## Archive marker · retrofit-era-terminal

Tag `retrofit-era-terminal` (commit `531991a6` · local-only) preserves full pre-scorched tree. Branch `archive/retrofit-era` tracks same sha locally. `docs/retrofit-era-terminal.md` is the readers-guide.

**Invariant:** anything from retrofit era is one git command away. `git checkout retrofit-era-terminal -- <path>`. Never resurrect without §Fail-hard reason.

## IR snapshot is the database

```
location    model/raw/ir-snapshot/<sha256>.json    content-addressed
            model/raw/ir-snapshot/latest.json      symlink to current head
            model/raw/ir-snapshot/_manifest.json   shape + counts + provenance

shape       ~1.46 GB  · one binary · one file
            23199 functions · 8466 classes · 67617 call sites · 331 vtables
            157 QObjects · 17953 function bodies
```

**API · `model/ir/query.ts`** · 15 verbs over the snapshot:

```
ir.class          ir.member         ir.function       ir.metaObject
ir.strings        ir.callsFrom      ir.callsTo        ir.vtable
ir.functionBody   ir.resources      ir.dataTypes.enum ir.manifest
ir.qtTypeOf       (+ two internals)
```

**Consumer rule · future rounds add QUERIES, not extractors.** Test before writing Java: can I phrase this as a query over existing IR fields?

**Ghidra rule · re-run only on binary version bump.** A Ghidra re-run without a new binary hash = receipt-less rewrite of the database — refuse it.

## §Side-channel-relic-test · r26

A judgment-table at zero ≠ zero ignorance · zero REGISTERED ignorance. Side-channel JSONs that silently encode binary-derivable facts are ignorance that escaped the table.

**Three telltales · any one → relic-candidate:** producer absent or pre-IR · encodes binary-derivable fact · consumer patches by hand on miss.

**Retirement protocol (meta-#8 PBR · ordered):** land replacement verb · unit-test against real IR · switch consumers + parity-verify · smoke regen · THEN delete relic.

## Bug-class hunting

A class with a detector scales · an instance with a fix does not. Full taxonomy: `/bug-class-hunting`.

```
0  PBR (prove-before-retire)    1  EXTRACTION-REGEX
2  CONSOLIDATION-GAP            3  LENIENT-RESPONDER
4  SLOT-ROUTING                 5  ARCHETYPE-DISPLAY
6  MISSING-ELEMENT              7  CONTAINER-AS-LEAF
8  MODE-SWITCH                  9  POST-DETACH-STUB
10 MODAL-STACK-CAPACITY         11 COORDINATE-REBASE
12 ORPHAN-MEMBER                13 ARCHETYPE-UNMOUNTED
14 STRETCH-FALLBACK-GEOMETRY    15 VISUAL-PARENT-DRIFT
16 SIBLING-STACK-COLLISION      17 SEMANTIC-MISCATEGORY (extends 5)
18 IR-TYPE-FIDELITY-LOSS-AT-BOUNDARY
```

Command: `npm run bug-hunt` → CI-blocking. Reports at `model/output/bug-reports/class-<N>-<kebab>.json`.

**Four invariants** (I1 detector-suite · I2 visual-parity · I3 no-lenient · I4 interactivity survey-mission) enforce at pipeline `step-b-bug-hunt`.

**Canonical namespace:** `inv:<kebab>` (run-invariants · topology detectors) · `bh:class-N-<kebab>` (bug-hunt pipeline classes). Bare numeric references are AMBIGUOUS — use full prefixed ID.

## §IR-type-fidelity-loss-at-boundary · bh:class-18

Binary encodes values with SPECIFIC type lenses (float64 IEEE-754 · signed int32 · pointer · uint16 · enum · bit-packed flags). IR snapshot stores raw bits. TS interpreter must apply the right lens. **Wrong lens = computation succeeds, no exception, silent nonsense propagates downstream**.

**r32 instances · 4 fixed at sha 5d531605:** FLOAT_* uint64 IEEE-754 read as JS number · negative int32 zero-extended · connection-key pointer offsets as integer addends · setGeometry coords folded as int32 when binary uses uint64.

**13 candidate shapes · CI-detector should hunt:** endianness · sign-magnitude · padding bytes · alignment · ASCII vs UTF-16 length · pointer width · bit-fields · null-terminator · Q_FLAGS · NaN sentinel · PTRDIFF cross-region · size_t on 32-bit · uchar sign-extension.

**Resolution pattern · per-handler typed-input contract:** every pcode-eval handler declares input type explicitly · IR field-fetcher applies lens at boundary · never `as number` on raw IR field · on unknown type throw with diagnostic (§Fail-hard).

**Anti-pattern:** "the math works for the simple case · ship it." If handler doesn't fail on uint64 boundary OR negative-int OR pointer-as-int, it's silently broken.

## Dominant signal · infra-facing vs user-facing

```
INFRA-FACING   "is the pipeline working"
               bug-class counts · detector suites · widget-resolution %
               appropriate when building mechanism
USER-FACING    "does the operator see a working HMI"
               pixel-similarity · clickability · end-to-end workflow runs
               appropriate when mechanisms landed and visual proof needed
```

**One-line test:** what would you screenshot at round-terminal? "A bug-hunt table" → infra. "This page open in a browser" → user.

## Per-round stratum push cadence

Stratum LOCAL commits on `keep/fleet-composable-vocabulary-wiring` accumulate. Rhythm: `/roadmap-term` includes stratum-push gate. Anti-pattern: "push everything at September" — 100+ commit merge with no per-round bisection.

## Deviation list contract

`model/deviations.json` is single authored artifact. Schema: `{schemaVersion, hardCap:15, netAddPolicy:"forbidden", deviations:[...]}`. 14 entries · at the cap.

Categories: visual-system · topology · authority-model · layout-mode · input-paradigm · data-source · authority-override · network-security · fls-integration · replay-architecture · dive-tablet-scope · configuration-scope · data-management-scope · acoustics-scope.

## September milestone

Operator completes simulated survey mission end-to-end on Galaxy Tab Active 5: claim authority (hold gesture 800–900ms) · set waypoints · monitor telemetry · handle a fault · release authority. Verification: `assay run --batch` against live demo via CDP-over-adb.

## Linear · audit mirror, never live

Linear mirrors user-facing porting work at discrete checkpoints — NOT a task queue. Roadmap DAG is source of truth. Cadence: post phase-4 first-regen · post phase-5 verify-at-scale · pre phase-6 tablet-september · pre phase-7 demo-ship · ad-hoc on Griffin's call. Full protocol: `/linear-audit`.

## Compile the successor before closing context · always

At `/roadmap-term`, successor MUST compile to SpecIR + `roadmap make` advance before session closes.

**Terminal-close ritual order (non-negotiable):**

1. Critic verdict landed
2. Acceptance receipt landed
3. Successor narrative authored (`_narrative: true`)
4. Successor compiled to SpecIR (`docs/<dag_id>.spec.json`)
5. `roadmap make` run · head.json advanced
6. Boot prompt for next session points at LIVE DAG

If step 5 skipped, agent's next report MUST surface as dropped thread. **Exception · none.** Even if dag_id is unsettled, compile with working title; rename via `roadmap dag modify` later.

## Orienting in a new session

1. Read this file (CLAUDE.md)
2. Read `docs/pipeline.md`
3. Read `docs/fleet-rov-thesis.md` for any staging quality work
4. Check `model/raw/qt-feature-coverage.json` (gap count)
5. `git log` — what changed
6. `/roadmap-orient`
7. Sibling CLAUDE.md only when working in those repos

## Discipline notes

- Don't restate context from past turns. Trust conversation as cache.
- Visual structure beats verbal exposition. Diagrams over prose.
- Tighter responses. Hedge less. Every token earns or dies.
- Never reach for legacy C++ source. Compiled output.
- Never patch generated output. Fix the generator and regenerate.
- Round receipts to `.roadmap/round-N/`, NOT `docs/`.

C interpreter traps + pipeline parser gotchas → `docs/pipeline.md`.

## §Doctrine-author-cannot-violate

A round that lands new doctrine in CLAUDE.md cannot depend on that same doctrine to GBD its own gates within the same round.

```
this round AUTHORS §X     →  this round's gates that test §X
                              must hold to PRIOR-round standard
                              OR be honestly RED · never GBD'd via §X
```

**Rationale:** doctrine becomes alibi for the violation. Rule and dispensation in same commit-window — rule is shaped (consciously or not) to absorb the failure it was supposed to prevent.

**Test:** would this round's GBD survive if the doctrine cited were someone ELSE's — landed two rounds prior, by different author, against unrelated work? If no, you're laundering the verdict through your own writing.

**Discipline:** doctrine landed mid-round is provisional until successor round either invokes cleanly or refines. Self-citation within authoring round is forbidden. Doctrine becomes load-bearing after another round honors it without alibi.

**Anchor · r31:** forward-declared §Schema-runtime-contract-loop and §Populator-parallel-dispatch · then violated §Populator-consume-protocol five times · closed PASS-via-GBD on doctrine same round wrote. Screenshot was the falsifier.

## §Populator-parallel-dispatch

Parallel populator agents writing to `model/output/hmi-schema.json` race · last writer wins · earlier lifts vanish silently. Either serialize OR mandate final integration regen pass that consolidates and reports zero drift.

**Detection:** schema mtime < latest populator agent commit time · agent's claimed delta absent from final schema.

**Contract per round:** parallel populator agents → integration-regen node REQUIRED. Serialized populator chain → no integration node needed.

## §Validator-must-open-the-console

Render-adjacent receipts MUST cite browser `console.error` count from a real devtools probe. Server-side log inspection (e.g. `stratum-dev.log`) does NOT satisfy this gate — Vite dev-server logs are blind to runtime mount errors, AsyncComponentWrapper failures, and inject/provide fatals.

**Probe pattern:** launch playwright (or assay probe wrapping it) · attach console listener · navigate · capture errors[] / pageerrors[] / async failures · receipt fields MANDATORY: `browser_console_error_count` · `browser_pageerror_count` · `browser_session_fatal_count` · `browser_async_error_count` · classify residual.

Scar: r31 cited stratum-dev.log as `console_clean` while browser console showed 30+ errors.

## §Era-as-dubious-source-inversion

Legacy era PNGs — historically dismissed as noisy reference — can serve as NOISY SENSOR INPUT to algebraic inversion when binary-extracted geometry plateaus.

**Pattern:** treat era-values as sensor readings · structural relations as constraints · solve for global unknowns by consensus voting across widget population.

**Disagreement-as-signal:** outlier vote is signal that outlier widget's binary site has different scale path.

**Test · sensor or source-of-truth?** Sensor: subject to noise, used as one input among many, retired when binary unblocks. Source-of-truth: contradicts binary directly. Use strictly as sensor — when binary unblocks, era retires as fallback (§Meta-#8 PBR applies).

## §Inversion-as-extraction-method

META mechanism · subsumes §Era-as-dubious-source-inversion. When two corpora overlap on shared unknowns AND one corpus contains symbolic expressions the binary already wrote, treat extraction as **constraint-solving**.

**Two-prong test (insufficient · see §Inversion-three-prong-test for refinement):** independent known-output corpus · symbolic expression binary already wrote.

**Anti-pattern:** reaching for new walker / new IR verb / new fold rule when the question is "what value would make the existing equation balance?"

Application slots (untapped): color · visibility · slot-data · connections · state-machine. Geometry was the r32 first application.

## §Inversion-three-prong-test

§Inversion-as-extraction-method's two-prong test was incomplete. Empirical scar of r33 connections inversion (i-connections-inversion-solve · partial falsification at FnPgRov) revealed THIRD required prong: **consensus-poolable shared unknown across instances**. Without it, "inversion" degenerates into per-instance solving — just a walker by another name.

**Refinement (r35):** the third prong requires both SHAPE-prong (offset · structural relation) AND VALUE-prong (resolvable scalar) BOTH shared across instances. Shared shape with distinct values is still WALKER, not INVERSION.

**Test:** is the unknown the SAME across instances (DpI · window-size · color-token) or DIFFERENT per instance (this-class member offset · stack-local frame slot)? Same → inversion. Different → walker.

## §Three-corner-classifier

Promoted r35 to load-bearing on TWO empirical anchors (one falsification · one verdict-affirmation). Meta-controller for picking extraction method by corpus shape:

```
diffusion-discovery   structured corpus + unknown taxonomy + crystallizable
cascade               known-tree-known-root (resolve top-down)
inversion             overlapping sources + SHARED-UNKNOWN-VALUE across N instances
walker                per-instance-unique mechanical extraction (new IR verb)
```

Classifier is fast-fail before authoring · NOT a tie-breaker.

## §Iterate-to-ceiling-then-diffuse-back

Within-round iteration loop. When node hits ceiling (yield plateaus across two consecutive passes despite mechanism remaining valid), STOP iterating same mechanism — diffuse-back, decide in-round close vs successor carrier.

**Loop:** ITERATE → PLATEAU CHECK (delta < 5% AND mechanism unchanged → ceiling) → DIFFUSE BACK → DECIDE (in-round close OR successor carrier) → CLOSE.

Distinct from §Multi-pass-diffusion-to-fidelity (which assumes mechanism stable). This handles "iterate harder won't help; iterate differently might."

## §Asymptote-confirmation-discipline

Refines §Iterate-to-ceiling-then-diffuse-back. Asymptote tests are SCOPED — narrow scope's asymptote is NOT global asymptote. Honoring scoped asymptote prematurely freezes diffusion against boundary that's a scope artifact, not knowledge artifact.

**Test:** when asymptote fires, widen scope at least once before honoring. Boundary may be scope artifact.

## §Streaming-refactor-discipline

Streaming refactors must go END-TO-END. Thin String wrapper at any frame defeats streaming benefit at wrapper boundary — memory still accumulates whole serialized subtree before writer sees it.

**Test:** trace data path from generation to disk. Is there ANY frame holding whole serialized subtree as String? If yes, streaming is half-done.

## §Sharded-output-architecture

DumpIR-style preprocessor outputs MUST be sharded by top-level array — one file per concern. Monolithic JSON defeats reader tooling at scale.

**Test:** can a reader answer "fetch function body for funcId X" with constant-time disk seek (offset-index hit) instead of full scan? If no, index is missing.

r34 extension: sqlite shard with WAL + zlib BLOB + truncated-flag column became 15th shard.

## §Function-body-skip-guard-honest-residual

The 28 pathological function bodies (top-1: 2.5 GB) need honest-skip via `getFunctionBody({maxBytes})` returning null. Populators emit honest residual to `schema.pathological_function_bodies_skipped[]`, named by funcId.

```
✗ silent truncate at maxBytes        rot · downstream sees partial tree
✓ return null + named residual       populator emits funcId honestly
```

§Fail-hard at body-size boundary. Schema field IS the carrier manifest.

## §LOAD-of-this-member

Cutover-2 mechanism (LOAD-of-static-global) covers 6% of setGeometry LOAD sites. Dominant Qt pattern — LOAD-of-this-member via `PTRSUB(leaf:thisptr, const:offset)` — covers 86%. Object members need ctor-walking + member-init-tracking, not .rdata bytes.

**Subtype taxonomy → r34 carriers:** ctor-write tracker · member-init lattice · this-pointer typing · cross-function member resolver.

## §qt_static_metacall-as-slot-dispatch-table

r33 switch-tables emission revealed top switches are auto-generated `qt_static_metacall` functions. This IS Qt's signal/slot dispatch table.

**Implication:** slot-resolution walks `qt_static_metacall` switch tables directly — NOT vtable analysis. Case-index maps to slot ordinal in moc-generated dispatch.

**Test:** does connection walker need to traverse vtable entries to find slot? If yes, wrong layer — qt_static_metacall contains slot mapping directly.

## §Cluster-A-synchronous-Ghidra-rerun-protocol

Cluster A nodes carry `dispatch_mode:"synchronous"` · Griffin in loop for Ghidra session · ONE rerun per round · binary version unchanged · no opportunistic re-runs. Falsifier: malformed IR snapshot post-rerun → STOP · §Fail-hard · architecture review before downstream cascade.

r34 verified empirically (§Cluster-F functionbodies sqlite cutover · single Ghidra rerun).

## §Connections-inversion-application-pattern

THIRD-corner test of §Inversion-as-extraction-method. r33 named the FALSIFICATION-AS-PREDICTED at r34 (cluster-B 0/494): connect-tuple stack-frame layout is per-class-unique, NOT shared unknown. Right method is SLOT-SIDE `qt_static_metacall` walk + r35 QSlotObjectBase resolver, NOT inversion.

Working as immune system per §Inversion-three-prong-test.

## §Sender-pairing-walker-protocol

Slot-side resolver crystallized via `qt_static_metacall` switch-walker (96.68% slots resolve via first-CALL-in-case-body · zero vtable analysis required). Sender-side empirical wall: 99.8% of FUSION's connect-tuples are connectImpl-style where slot is `QSlotObjectBase*` pointer, not slot_id integer.

r35 cluster-B: 32 connections / 7 pages · DOM verification green on 5 pages · zero console errors. FnPgRov GBD-r36 (single-tuple unresolved-signal at non-ctor binding site).

## §Cluster-A-load-thisptr-protocol

r34 resolver (`pcode-eval-thisptr.ts` · ctor.body STORE-walk seeds `EvalContext.knownThisMembers`). Empirical · subtype distribution falsified r33 hypothesis that ctor-init dominates:

```
A · ctor-init STORE             8% absolute · 9.3% of unresolved
D · caller-passed (dominant)    >60% → r35+ carrier
site-yield from option-A only   6→14%
```

Honest-RED at cutover-2 falsifier (30% threshold) · 4 named carriers (member-init lattice · this-ptr typing · caller-passed walker · cross-function member resolver).

## §Substrate-survives-extractors-die

r34-tail discovery promoted load-bearing in r35 on three empirical ports. r28's scorched-earth retirement deleted 20-step retrofit pipeline (46,940 LOC) BUT preserved IR substrate (`model/ir/query.ts` 15-verb grid + IR snapshot) AND git tag `retrofit-era-terminal`.

**Discipline:** before authoring any new extractor: `git log --all --diff-filter=D --name-only | grep <pattern>` and `git checkout retrofit-era-terminal -- <path>`. Substrate that survived deletion is canonical; deleted extractors are recoverable.

r35 ports: visibility-extractor · three-way-diff · page-viewer. Cheaper than re-authoring · zero invented bugs.

## §Underused-IR-verb-audit

Forensic discipline pairing with §Substrate-survives-extractors-die. Mechanical audit before authoring any new walker / extractor / generator.

**Audit one-liner:**
```
grep -rh "ir\.\w\+(" pipeline/ model/bin/ | \
   awk '{match($0,/ir\.[a-zA-Z]+/); print substr($0,RSTART,RLENGTH)}' | \
   sort | uniq -c | sort -n
```

Verdict per verb: 0 calls + obvious applicability → SUBSTRATE-ON-TABLE · carrier. 0 + niche → preserved-but-dormant. 1 + single page → cross-page-sweep. N≥3 → load-bearing.

r35 anchor: i-retrofit-era-extractor-survey · 50 surveyed · 21 dead (SUPERSEDED-IR) · 7 r36 carriers via `ir.callsTo` + `ir.qtTypeOf` · 9 absorbed.

## §Resource-bundle-as-extraction-oracle

Promoted from preanchor on one HELD application; load-bearing-pending-second-app per /core-loop's two-instance rule. Compile-time-bundled assets (icon PNGs · `.qrc` · `.qss` · `.qm`) carry STRUCTURAL information mechanically-extractable per §Three-non-negotiables.

r35 anchor: i-icon-png-geometry-leaf · 281 icons · 46 schema · buttons-with-geometry 75 → 163 (+88 widgets across 14 pages).

Enriches §Three-way-convergence as fourth oracle. Bundle-leaves only fire when prior cascade leaves return null (§Iterate-to-ceiling).

## §Cluster-F-functionbodies-storage-architecture

Function bodies (17953 · 11+ GB monolithic JSON · 5 pathological top-1 = 2.5 GB) promoted to sqlite shard with WAL + zlib BLOB + truncated-flag column. Schema:

```
CREATE TABLE bodies(funcId INTEGER PRIMARY KEY,
  body BLOB NOT NULL, original_bytes INTEGER NOT NULL,
  truncated INTEGER NOT NULL DEFAULT 0) WITHOUT ROWID
PRAGMA journal_mode=WAL · body=zlib(JSON)
```

Constant-time seek vs r33 offset-index per-shard read. Five honest-truncated bodies surfaced · skip-surface API unchanged · downstream populators consume identically. NODE_MAX_STRING workaround retired same commit (§Fail-hard · §Meta-#8 PBR).

## §Cross-page-archetype-extension-pattern

r34 anchor: classifier extended for FnPgFiles cross-page archetypes (sourced from `archetype-cross-page-demand.generated.json` per §Cross-page-sweep-fleet-anchor). i-button-icon-rendering-author closed 163/163 schema entries via populator-side mechanical mapping (60 member-names → 60 retrofit-era icons · committed TS lookup) · zero stratum-repo changes.

## §Populator-wire-LIFT-WIRE-PROVE-canonical

Sibling to §Populator-consume-protocol and §Schema-runtime-contract-loop. Three-step cadence: substrate-LIFT (fold-rule contract-green) · populator-WIRE (context-builder threaded into `EvalContext`) · downstream-PROVE (schema delta verified by independent validator).

```
LIFT     fold-rule contract-green at site-yield N%
WIRE     populator threads buildContext(...) into EvalContext (§Goldilocks · §Fail-hard)
PROVE    independent validator opens schema · counts per-page delta
         CLAIM = ACTUAL  → GREEN · CLAIM ≠ ACTUAL → §Handoff-vs-commit-validator
```

§Handoff-vs-commit-validator-tightening (r35 refinement): per-page receipt fields claiming widget-count deltas MUST be cross-checked by downstream validator opening actual schema. Narrative receipt of "lifted N widgets" is forged-progress until counted. Validator is the seal.

## §Handoff-vs-commit

Handoff README is narrative; commit is reality. README's existence is NOT evidence of work — only named sha against `git diff <sha>~..<sha>` is.

**Protocol · trust verification, not narrative:**
1. handoff JSON names a sha · `git cat-file -e <sha>` must exist
2. handoff JSON names files · `git diff <sha>~..<sha> -- <files>` must be non-empty AND match
3. empty diff or missing sha → surface as blocker-upstream

**Test:** can you point at non-empty diff under the named sha containing the claimed change? If no, handoff is forged-progress regardless of README confidence.

## §Three-way-convergence · predictor · topology · screenshot

r25 forensic frame: three independent oracles triangulated per page, per state, per resolution. Every staging disagreement collapses to one of five named verdicts. No fourth category.

```
predictor    predictLayout(IR) → expected geometry from compile-time facts
             honest unresolvable[] when a question can't be answered
topology     pick-buffer sweep → observed render from live browser
             model/output/topology/<page>.<state>.<res>.json
screenshot   enshrined legacy PNG → multimodal oracle
             docs/design/legacy-reference/<page>.png
```

**Triangulation verdict matrix:**

```
all-agree              converged · move on
render-bug             predictor + screenshot agree · topology diverges
                       → bh:class-N (rendering pipeline bug)
predictor-gap          topology + screenshot agree · predictor silent/wrong
                       → extend predictor verb
intentional-deviation  predictor + topology agree · screenshot diverges
                       → cross-check model/deviations.json
all-disagree           three-way conflict · escalate to forensic deep-dive
                       → binary query · root-cause before any patch
```

**Discipline:** every disagreement gets a verdict + bug-class + disposition. No fourth category. "Unknown why it differs" is never terminal.

**Operational test:** can you name verdict for every visible delta on this page? If no, diff isn't complete.

## §Core-loop-fleet-anchor

Project-specific anchor for universal `/core-loop` skill (full mechanism in `~/.claude/CLAUDE.md` §Core-loop).

**Fleet's upstream chain · descending freshness, ascending authority:**

```
populator output       model/output/hmi-schema.json
populator              pipeline/populators/*.ts
IR verb                model/ir/query.ts (15 verbs)
pcode fold             model/ir/pcode-eval.ts
IR snapshot            model/raw/ir-snapshot/latest.json (1.46 GB)
Ghidra lowering        ghidra_scripts/*.java (re-run only on binary bump)
─────────── above this line: TS-interpretable, fast ───────────
legacy syntactic probe ~/src/.dev/legacy-fusion-hmi/ (≤20/round · planning oracle only)
retrofit-era reference git tag retrofit-era-terminal
─────────── TERMINAL UPSTREAM ───────────
binary                 FUSION.exe + FUSION.pdb (the database)
```

**Fleet RED triggers `/core-loop` whenever:** populator-consume schema=0 with mechanism unchanged · runtime-proof gate RED on verified URL · pcode-eval fold ceiling fires · three-way verdict `all-disagree` or `predictor-gap` · populator's claimed lift absent from schema.

**Test before declaring fleet HONEST-RED:** did you grep `~/src/.dev/legacy-fusion-hmi/`? did you check `git checkout retrofit-era-terminal -- <path>`? did you query IR for alternative verb? If any "no", `/core-loop` not yet exhausted.

## §Cross-page-sweep-fleet-anchor

Project-specific anchor for universal `/cross-page-sweep` skill. HORIZONTAL sibling to /core-loop's VERTICAL — when stuck on single page, sweep corpus before pivoting upstream-by-layer.

**Fleet sweep substrate · 20 pages · 601 widgets · `model/output/hmi-schema.json`:**
- mechanical probe: `jq '.pages[] | .widgets[].archetype'`
- per-page enumeration: `jq '.pages[].class_name'`
- per-archetype demand: archetype × pages-using × instance-count
- existing components: `packages/surface-console/src/components/archetypes-generated/`

**Sweep-or-not test:** stuck on page-specific RED? Before authoring per-page fix, ask: "is this archetype on N other pages? does this fold-rule fail at K other sites? does this populator emit zero for M other classes?" If yes — sweep first.

## §Discipline-notes-r36-preanchor

Forward-declarations for r36 LATE doctrine · §Doctrine-author-cannot-violate keeps these from being citable to GBD r36 gates.

**§Array-indexed-PTRADD-store-handler.** Cluster-A r36 anchor — caller-passed STORE-shape r35 named (i-load-resolver-caller-passed-implement sha 41206f54 · 0% yield) routes here as array-indexed-PTRADD STORE leaf authoring · consumes r35 caller-walker substrate via §Populator-wire-LIFT-WIRE-PROVE-canonical cadence.

**§Extractor-restoration-IR-grounded-protocol.** Cluster-EXT r36 anchor — r35 audit (i-retrofit-era-extractor-survey sha a40934dd) routed 7 extractors to r36 carriers via `ir.callsTo` + `ir.qtTypeOf`. Protocol formalizes IR-grounded restoration over re-authoring · `git checkout retrofit-era-terminal -- <path>` first · adapt to query-grid second.

**§Trampoline-vtable-terminal-upstream-walk.** Cluster-B r36 anchor — FnPgRov GBD-r36 single-tuple unresolved-signal at non-ctor binding site routes here · /core-loop terminal-upstream is FnPgRov::OnConnection function body itself · vtable trampoline walk preserved as honest method-of-last-resort despite r33 retire of vtable-resolver as wrong-layer for slot-side dispatch.

§Cluster-EXT-restoration is the cluster name; depth lands at r36 LATE doctrine after execution.

Full elaboration of each at r36 LATE doctrine (after cluster executes · NOT before).

---

## §Pick-buffer-as-diffusion-substrate

Pick-buffer topology output — historically a render verifier (oracle role under §Three-way-convergence) — is also a DIFFUSION substrate. Same data · different question. r25 used the pick-buffer to ANSWER "does this widget render where predicted?" r37 uses it to ASK "where do screenshot and pick-buffer disagree, and what class does the disagreement fall into?"

```
substrate role         topology = oracle              §Three-way-convergence (r25)
diffusion role         topology = corpus              §Diffusion-discovery-pattern (r37)
shared bytes           model/output/topology/<page>.<state>.<res>.json
```

**FIFTH application of §Diffusion-discovery-pattern.** r29 archetype-classifier · r31 pcode-shape-classifier · r32 archetypes-generated · r34 (cross-page-archetype) · r37 pixel-gap-classifier. Per-pixel disagree-cell becomes the corpus row · 8-axis label (P1..P7 + UNKNOWN) becomes the taxonomy.

**Anchor · r37:** i-pixel-diffuse-corpus-build (16px proxy grid · 6 pages · baseline pixel-disagreement-fraction 0.2524) → i-pixel-gap-classifier-emit (sha 951e7c56 · 7732 disagree-cells · 8 axes · UNKNOWN=2 honest · top-3 P2:49.3% P3:28.0% P5:9.6%). Backward-pass: screenshot → gap-classification → carriers (inverts forward-pass binary→schema→render).

**Discipline:** when an artifact is already on disk for one purpose, before authoring a new corpus, ask "could this artifact answer a different question if we relabeled its rows?" Pick-buffer as substrate cost zero new IO.

## §Granularity-fidelity-probe

A monolithic "yield N%" claim across heterogeneous axes is forged-progress. Per-axis breakdown is mandatory · single-number coverage is the smell.

```
forged              "populator emits 100% widget coverage"
honest              archetype 80% · geometry 30% · wiring 0% · visibility 12%
                    label 60% · icon 75% · archetype-children 40%
```

**Test:** does the receipt name ONE coverage number, or N coverage numbers (one per axis enumerated in §Provenance-explicit-attrs-P1-P7)? One → forged-monolith. N → honest.

**OBSOLETION receipt · r29 archetype-classifier coarsening (442:13).** The investigation that asked "did we lose information by coarsening?" was OBSOLETED by r37 pixel-evidence: P1 (archetype-source disagreement) accounts for only 2.45% of the 7732 disagree-cells. Coarsening was MATERIALLY SAFE; the ceiling lives elsewhere (P2 geometry 49.3% · P3 connection 28.0%).

**Discipline:** granularity loss is acceptable WHEN downstream pixel-evidence proves immateriality. Do not defend granularity in the abstract; let the disagree-cell distribution decide. Pixel-evidence is the seal.

## §When-axis-ceilings-stick-look-elsewhere

Sibling to §Asymptote-confirmation-discipline. The asymptote rule says "widen scope once before honoring." This rule says: when an axis ceiling holds across N rounds despite mechanism iteration, the bottleneck is NOT on that axis · pivot cross-axis before doubling-down or declaring honest-RED.

```
trigger        same axis stuck <5pp delta across 2+ rounds
forbidden      author yet another mechanism on the stuck axis
required       sweep cross-axis (§Cross-page-sweep direction) ·
               rank by pixel-coverage (§Pick-buffer-as-diffusion-substrate)
               pick the axis with highest residual visual delta
```

**Empirical anchor · r32–r36 cluster-A.** LOAD-of-this-member fold yield held <5pp delta across four consecutive rounds (r32 6% → r33 14% → r34 honest-RED · r35 0% caller-passed · r36 array-indexed-PTRADD partial). Each round added a NEW mechanism on the same axis. r37 pivoted: instead of authoring a fifth fold-shape, lifted three NON-cluster-A axes (parent-child-nesting · bh:class-16 · component-generator-defineprops) in 3 hours and produced more visual delta than r32–r36 combined on user-facing FnPgRov probes.

**Discipline:** ceiling-lift on a single axis after round N+2 of stagnation is a SUSPECT investment. Cross-axis sweep first · only return to the stuck axis after a residual carrier is named with pixel-coverage > the ceiling-lift's expected gain.

## §Render-correctness-cluster-default-when-visual-gate

When the round terminus owes a USER-FACING visual gate (screenshot · pixel-similarity · operator-facing assay probe), the DEFAULT cluster is RENDER-CORRECTNESS · not extraction-yield. Choosing extraction-yield as headline cluster while visual is the dominant signal is forged-cluster — measures the wrong axis (§Dominant-signal infra-vs-user inversion).

```
gate dominant signal      default cluster
─────────────────────     ────────────────────────────
bug-class counts          extraction-yield
widget-resolution %       extraction-yield
pixel-similarity          RENDER-CORRECTNESS
operator screenshot       RENDER-CORRECTNESS
```

**Anchor · r37 RC-cluster.** Created mid-round in response to off-DAG Griffin requests · proved methodology #5: render-correctness must be DEFAULT not optional when visual gate dominates. Three RC nodes landed and produced visible FnPgRov delta:
- i-parent-child-nesting-geometry-containment-deviation
- i-bh-class-16-detector-author (sibling-stack-collision)
- i-component-generator-emit-defineprops

**Discipline:** at round-spec time, look at the gate denominator. If it screenshots, RC-cluster is the trunk · extraction-yield clusters are tributaries. Do not invert.

## §Underused-IR-verb-audit-second-prong

Refines §Underused-IR-verb-audit. First prong (zero-call-count survey · r35 i-retrofit-era-extractor-survey sha a40934dd) finds DORMANT verbs (50 surveyed · 21 SUPERSEDED · 7 carriers). Second prong: verbs called HIGH-FREQUENCY but with NARROW SHAPE — one populator · one site · one filter · the verb is load-bearing-but-undertapped, and a sister populator could consume it for free.

```
prong-1   N==0 calls    dormant       SUPERSEDED-IR or carrier
prong-2   N≥3 calls     load-bearing  audit shape · is consumption monocular?
prong-2'  N==0 on-target  dead-on-target  do NOT pursue · author deviation
```

**Anchor · r37 prong-2' (DEAD-ON-TARGET).** r35 audit recommended `ir.qtParentOf` for parent-child-nesting work. r36 found `ir.qtParentOf` returned 0% useful results on FnPgRov (the user-facing target). r37's correct move: do NOT also author the downstream populator that would consume the dead verb. Author the DEVIATION that BYPASSES (i-parent-child-nesting-geometry-containment-deviation · geometry-containment as the structural test, not the binary parent-pointer).

**Discipline:** when an audited verb yields 0% on the target page, do not chain a downstream populator on top — the chain compounds zero. Reach for the deviation that bypasses · §Three-non-negotiables permits authored deviations as long as the cap holds. Better one deviation than seven empty populator calls.

## §Validator-as-process

Empirical refinement of §Handoff-vs-commit and §Validator-must-open-the-console. Validator is not a one-shot script invoked at receipt-write time · it is a CONTINUOUS process · per-commit hook · opens the named artifact · cross-checks every narrative count claim against jq-derived reality.

```
forged    receipt narrative says "lifted N widgets"
          author trusted to count
honest    receipt names jq_probe_cmd
          hook runs jq_probe_cmd · asserts result==claim_count
          divergence → commit blocked OR receipt downgraded
```

**Empirical scar · r36 connections.** Receipt narrative claimed connections=32 · downstream validator opened schema · counted 0 · forge surfaced post-hoc. r37 institutionalized the seal:
- i-validator-as-process-hook (sha 5ff13cbc · 108 LOC) — framework-level hook, jq-derived counts replace self-reported narrative
- i-receipt-narrative-validator-rule (sha d4c6958e · ~140 LOC) — every receipt with a count claim MUST pair `claim_count` field with `jq_probe_cmd` field, validator runs the cmd against the named artifact

**Contract per receipt:** any field claiming a numeric delta MUST be accompanied by a sibling `jq_probe_cmd` (or `grep_probe_cmd`) the validator can re-execute. Narrative-only counts are now a PR-blocking lint failure.

**Discipline:** the validator is the seal · the agent is not. Trust verification, not narrative (§Handoff-vs-commit forward direction).

## §Provenance-explicit-attrs-P1-P7

Each schema field — and each rendered DOM widget — declares its ORIGINATING provenance class. Seven axes · each maps to a `data-<field>-source` DOM attribute · pick-buffer captures source per layer · enables backward-pass diffusion (§Pick-buffer-as-diffusion-substrate).

```
P1   archetype-source           classifier emit · IR class · era fallback
P2   geometry-source            fold-resolved · ctor-walked · era-sensor · containment
P3   connection-source          qt_static_metacall · ctor-binding · trampoline
P4   visibility-source          schema-direct · slot-effect · default-true
P5   label-source               string-table · MOC name · era-PNG OCR
P6   archetype-children-source  containment · explicit · classifier
P7   icon-source                .qrc bundle-leaf · member-name lookup · era-PNG
```

**Wiring · r37 LIFT-WIRE-PROVE complete:**
- i-stratum-prov-attrs-extend + 7 children (sha fd62b410) — DOM attribute emit per axis
- i-topology-sweep-extend-prov-capture (sha 2421c8e6 · null-safe) — pick-buffer captures `<axis>-source` per pixel-layer
- pipeline pass-10 rerun (sha 3e3e80f7) — provenance coverage 601/601 widgets across all 20 pages

**Test:** can `assay probe <url>` see all seven `data-*-source` attributes on every widget? r37 pass-10: yes (601/601). Future-round residuals manifest as one of seven explicit classes · no "unknown source" · no fabrication-by-narrative.

**Discipline:** explicit attribution is the precondition for backward-pass diffusion. Without it, a disagree-cell cannot be classified beyond "something disagrees." With it, every disagree-cell routes to a named axis with a named carrier (§Pick-buffer-as-diffusion-substrate · §Granularity-fidelity-probe).

---

## §Meta-pattern-validation-r37

Verdict on the seven r37 preanchor stubs (sha 307156b2) after LATE elaboration:

| Preanchor stub | r37 verdict | Empirical evidence |
|---|---|---|
| §Pick-buffer-as-diffusion-substrate | HELD · promoted to FIFTH application of §Diffusion-discovery-pattern | i-pixel-gap-classifier-emit 7732 disagree-cells · 8 axes |
| §Granularity-fidelity-probe | REINFORCED · obsoleted archetype-coarsening-investigation | P1=2.45% pixel-evidence proved coarsening immaterial |
| §When-axis-ceilings-stick-look-elsewhere | HELD · cross-axis pivot produced more delta than 4-round cluster-A iteration | RC-cluster 3 hours > r32-r36 cluster-A combined on FnPgRov |
| §Render-correctness-cluster-default-when-visual-gate | HELD · created mid-round from off-DAG requests, methodology #5 proved | 3 RC nodes landed visible FnPgRov delta |
| §Underused-IR-verb-audit-second-prong | REINFORCED · added prong-2' DEAD-ON-TARGET clause | ir.qtParentOf 0% on FnPgRov → deviation, not populator |
| §Validator-as-process | HELD · institutionalized as PR-blocking hook | sha 5ff13cbc 108 LOC + sha d4c6958e ~140 LOC |
| §Provenance-explicit-attrs-P1-P7 | HELD · wired end-to-end · pass-10 601/601 | sha fd62b410 + sha 2421c8e6 + sha 3e3e80f7 |

**Zero falsifications across seven preanchors.** §Doctrine-author-cannot-violate honored: none of these doctrines were cited to GBD an r37 gate within r37 — all elaborations land POST gate-close (this node).

---

## Doctrine index · §-anchors

Every §-anchor name searchable here. Anchors marked `[history]` have empirical depth in `/fleet-doctrine-history`.

| Anchor | Summary | Depth |
|---|---|---|
| §Three-non-negotiables | No source-reading · model is database · ≤15 deviation cats | this file |
| §Wave-grounding | Pre-dispatch archetype-overlap check | this file |
| §Dumb-components | Props in · events out · refs from composables | this file |
| §Goldilocks-size | TS file 80–250 LOC sweet zone | this file |
| §Diversity-regression-is-blocker | Vocabulary count drop = STRUCTURAL FAILURE | this file |
| §Plan-children-executor-doctrine | `*children.json` needs absorbing executor | this file |
| §Fail-hard | No tolerant fallbacks · no legacy support | this file |
| §Bug-hunt-as-regression-gate | Frozen-baseline regression gate | this file |
| §No-LLM-in-build-path | Hard rule · no SDK imports · no API keys | this file |
| §Diffusion-pass-typology | 8 pass types · per-type metric | [history] |
| §Diffusion-discovery-pattern | Multi-pass diffusion → committed .generated.ts | [history] |
| §Generator-protocol | 3-layer · one direction · LLM-free build | [history] |
| §Component-generator-protocol | THIRD application of diffusion-discovery | [history] |
| §Populator-consume-protocol | 4-hop wiring contract | [history] |
| §Operand-tree-eval | Const-prop fold over IR pcode | [history] |
| §Pcode-shape-classifier | 2628 entries · 13 labels · 71.31% | [history] |
| §Schema-runtime-contract | Schema field → DOM attribute mapping | [history] |
| §Schema-runtime-contract-loop | LIFT-WIRE-PROVE cadence | [history] |
| §Brief-template-render-verify | URL-verify FIRST · gates SECOND | [history] |
| §Gate-premise-mismatch | Relax + route, don't GBD | [history] |
| §Meta-#8-cross-repo | Consumer is dominance test | [history] |
| §Component-keel-decoupling | No inject · staging mock at root | this file |
| §Side-channel-relic-test | Three telltales for relic-candidates | this file |
| §IR-type-fidelity-loss-at-boundary | bh:class-18 · per-handler typed contract | this file |
| §Doctrine-author-cannot-violate | Doctrine landed mid-round is provisional | this file |
| §Populator-parallel-dispatch | Race · last-writer-wins · integration regen | this file |
| §Validator-must-open-the-console | Browser console.error count mandatory | this file |
| §Era-as-dubious-source-inversion | Era PNGs as noisy sensor input | this file |
| §Inversion-as-extraction-method | META · constraint-solving extraction | this file |
| §Inversion-three-prong-test | Known + expression + shared unknown | this file |
| §Three-corner-classifier | Pick method by corpus shape | this file |
| §Iterate-to-ceiling-then-diffuse-back | Plateau check · 5pp delta | this file |
| §Asymptote-confirmation-discipline | Widen scope before honoring asymptote | this file |
| §Streaming-refactor-discipline | End-to-end streaming · no String wrappers | this file |
| §Sharded-output-architecture | One file per top-level concern | this file |
| §Function-body-skip-guard-honest-residual | Honest residual · funcId named | this file |
| §LOAD-of-this-member | PTRSUB(thisptr,offset) · 86% Qt pattern | this file |
| §qt_static_metacall-as-slot-dispatch-table | Slot-resolution via switch-walker | this file |
| §Cluster-A-synchronous-Ghidra-rerun-protocol | dispatch_mode:synchronous · ONE rerun | this file |
| §Connections-inversion-application-pattern | THIRD-corner · falsified-as-predicted | this file |
| §Sender-pairing-walker-protocol | qt_static_metacall + QSlotObjectBase | this file |
| §Cluster-A-load-thisptr-protocol | ctor STORE-walk · r34 substrate | this file |
| §Substrate-survives-extractors-die | retrofit-era-terminal recovery | this file |
| §Underused-IR-verb-audit | Forensic substrate-on-table check | this file |
| §Resource-bundle-as-extraction-oracle | Bundle leaves as fourth oracle | this file |
| §Cluster-F-functionbodies-storage-architecture | sqlite shard · 15th shard | this file |
| §Cross-page-archetype-extension-pattern | r34 mechanical lookup populator | this file |
| §Populator-wire-LIFT-WIRE-PROVE-canonical | Three-step cadence + validator-seal | this file |
| §Handoff-vs-commit | Sha + diff verification, not narrative | this file |
| §Three-way-convergence | predictor · topology · screenshot · 5 verdicts | this file |
| §Core-loop-fleet-anchor | Fleet upstream chain to terminal binary | this file |
| §Cross-page-sweep-fleet-anchor | Horizontal corpus sweep | this file |
| §Cluster-EXT-restoration | r36 cluster name (preanchor) | this file |
| §Array-indexed-PTRADD-store-handler | r36 cluster-A preanchor | this file |
| §Extractor-restoration-IR-grounded-protocol | r36 cluster-EXT preanchor | this file |
| §Trampoline-vtable-terminal-upstream-walk | r36 cluster-B preanchor | this file |
| §Discipline-notes-r36-preanchor | r36 forward-declarations | this file |
| §Sender-pairing-walker-protocol-elaboration | r34-LATE elaboration | [history] |
| §Pipeline-tempo | Tempo > agent-turn-tempo · ~25min cold | this file (Pipeline-tempo) |

| §Pick-buffer-as-diffusion-substrate | FIFTH application of diffusion-discovery · topology as corpus | this file |
| §Granularity-fidelity-probe | Per-axis fidelity breakdown · pixel-evidence seal | this file |
| §When-axis-ceilings-stick-look-elsewhere | Cross-axis pivot before doubling-down | this file |
| §Render-correctness-cluster-default-when-visual-gate | RC-cluster default when visual gate dominates | this file |
| §Underused-IR-verb-audit-second-prong | High-freq narrow-shape + dead-on-target prongs | this file |
| §Validator-as-process | Continuous hook · jq-derived seal | this file |
| §Provenance-explicit-attrs-P1-P7 | 7-axis attribution lattice · pass-10 601/601 | this file |
| §Meta-pattern-validation-r37 | r37 preanchor verdicts (7 HELD/REINFORCED · 0 falsified) | this file |

Per-round Discipline-notes (r31 · r32 · r33 · r34 · r35) including all empirical anchors, shas, falsified hypotheses, and Meta-pattern-validation tables → `/fleet-doctrine-history`.

---

## §Discipline-notes-r38-preanchor

Forward-declarations for r38 LATE doctrine. Per §Doctrine-author-cannot-violate, these are PROVISIONAL stubs — r38 gates may NOT be GBD'd via these. LATE elaboration after gate-close.

**§Dark-dimension-sweep.** Each round measures ≥1 previously-unmeasured rendering dimension (font · padding · border · z-order · cursor · focus-ring · spacing-token · etc). Closure metric is dimensions-with-extractor / dimensions-enumerated, not yield within a single dim. r38 anchor pending.

**§Pure-function-extraction-discipline.** Per-dimension extractor is a pure function `binary → IR → extractor → schema-field → DOM-attr → pixels` with zero human judgment in the path. If a dim's extractor needs an opinion, it's a deviation, not extraction (§Three-non-negotiables).

**§Axis-coverage-of-classifier.** New closure metric: classifier covers N axes for which extractors emit. Previously coverage was per-widget; r38 lifts it to per-axis. Forces classifier and extractor lattices to align.

**§Browser-console-probe-canonical.** Doctrine §Validator-must-open-the-console has been load-bearing 6 rounds (r31–r37) without empirical enforcement. r38 lands `scripts/validators/browser-console-probe.ts` as canonical primitive · receipts cite its output, not stratum-dev.log.

**§Caller-frame-walker-protocol.** Cluster-A r37 GBD-r38 (sha 611540fd) named the 55% mechanism: setGeometry's QRect arg comes from CALLER's local frame — caller-passed literal/arithmetic operand-tree, NOT this-member STORE-table. r38 walker traverses caller frames; §Three-corner-classifier WALKER (per-instance-unique value).

**§IR-substrate-completeness-test.** Before authoring a new IR walker / verb / Java extractor: exhaust the existing 15-verb grid. Second-prong audit (§Underused-IR-verb-audit-second-prong) ranks dimension candidates by IR-substrate-readiness (high = no Ghidra rerun needed).

**§Synchronous-track-parallel-not-gating.** Synchronous nodes (Ghidra rerun · git history cleanup · stratum push · tablet smoke) do NOT gate the round. Autonomous track proceeds in parallel; synchronous track surfaces to Griffin when the window opens. Round closes against autonomous gates; synchronous gates land as named carriers if window doesn't open.

| §Discipline-notes-r38-preanchor | r38 forward-declarations · 7 stubs | this file |
| §Dark-dimension-sweep | Per-round unmeasured-dim measurement | this file |
| §Pure-function-extraction-discipline | Zero-judgment per-dim extractor pipeline | this file |
| §Axis-coverage-of-classifier | Per-axis closure metric | this file |
| §Browser-console-probe-canonical | Empirical enforcement of console doctrine | this file |
| §Caller-frame-walker-protocol | Cluster-A 55% mechanism preanchor | this file |
| §IR-substrate-completeness-test | Exhaust 15-verb grid before authoring | this file |
| §Synchronous-track-parallel-not-gating | Parallel sync/async tracks · sync non-gating | this file |
| §LATE-elaborations-r38 | r38 LATE block · 11 anchors (4 r36-preanchor + 7 r38 promotions) | this file |
| §Array-indexed-PTRADD-store-handler · ELABORATED | r36-preanchor · cluster-A 0.0pp pass-2 falsification | this file |
| §Extractor-restoration-IR-grounded-protocol · ELABORATED | r36-preanchor · 9 dim-* extractors restored r38 | this file |
| §Trampoline-vtable-terminal-upstream-walk · ELABORATED | r36-preanchor · OnConnection body-walk closes GBD-r36 | this file |
| §Cluster-EXT-restoration · ELABORATED | r36-preanchor · 9 extractors · 3hr/shard velocity | this file |
| §Tier-2-decompiler-derived-shards | 167s rerun · 8466/331/157/201/133 substrate jump | this file |
| §Render-correctness-pivot-cross-axis | P2 49.3%→0.82% · P9 67.25% dominant · 13 carriers dropped | this file |
| §Console-probe-pipeline-gate | sha ceeb4f94 · doctrine 6-round gap closed | this file |
| §Trampoline-with-bypass | Lambda functor bypass · sha 6d0f7b34 | this file |
| §Array-PTRADD-falsified-again | Cluster-A 6-round flat · empirical asymptote sha 30104545 | this file |
| §Extractor-restoration-IR-grounded | 4 RECOVERABLE shards · 3hr vs 1day | this file |
| §Granularity-pixel-evidence-seal | sha 4476c512 · 13 carriers dropped <2% | this file |
| §Discipline-notes-r39-preanchor | r39 forward-declarations · 4 stubs | this file |
| §Pdf-baseline-rebase-as-denominator | r39 stub · denominator-shift discipline | this file |
| §Panel-composition-as-dominant-axis | r39 stub · P9 67.25% sub-axis decomposition | this file |
| §Custom-paint-stylesheet-literal-defuse | r39 stub · pcode literal-defuse fold-family | this file |
| §Cross-page-png-pairing-protocol | r39 stub · 5/6 pages png-unpaired (aliased by §Page-corpus-png-pairing-protocol) | this file |
| §Substrate-consume-must-follow-substrate-lift | r39 stub · same-or-next-round consume mandatory | this file |
| §RC-pivot-empirical-pixel-evidence | r39 stub · pivot cites per-axis pixel-coverage | this file |
| §PDF-baseline-rebase-discipline | r39 stub · classifier+denominator both required (aliases §Pdf-baseline-rebase-as-denominator) | this file |
| §Page-corpus-png-pairing-protocol | r39 stub · PNG-pairing precondition (aliases §Cross-page-png-pairing-protocol) | this file |
| §Pixel-coverage-priority-floor-2pct | r39 stub · <2% pixel-coverage auto-demoted to P2 | this file |
| §LATE-elaborations-r39 | r39 LATE block · 10 anchors (5 preanchor elaborations + 4 promotions + verdict table) | this file |
| §Substrate-consume-must-follow-substrate-lift · ELABORATED | sha 2f93e9d4 · 2/6 strict consume · forge-by-narrative without consumer | this file |
| §RC-pivot-empirical-pixel-evidence · ELABORATED | sha b71f58e5 + 5f22d8b2 · 93.52% P9+P8 · 10 demoted to P3 | this file |
| §PDF-baseline-rebase-discipline · ELABORATED | sha 9598745d · honest-rise routes GBD-r40 · denominator transparency | this file |
| §Page-corpus-png-pairing-protocol · ELABORATED | sha c5fe8d34 · 1/6 paired · 5 to r40 synchronous harvest | this file |
| §Pixel-coverage-priority-floor-2pct · ELABORATED | sha 9b18414a · 0 cluster-A/B above P3 · numeric floor | this file |
| §Cluster-A-officially-CLOSED | 7 rounds flat · sha 53f6295f + 7c0be16b · pixel-floor seal | this file |
| §Cluster-B-class-tuple-FALSIFIED-AT-CORPUS | spec 30–50 → 0 actual · sha 8e326f73 · GBD-r40 | this file |
| §Substrate-consume-LIFT-WIRE-PROVE-canonical empirical seal | sha 8ca6977b · 92 widgets DOM-attr · pixels flat · 2-sub-gate PROVE | this file |
| §DOM-attrs-don't-paint-pixels | sha d8cc4377 + aff58b49 · attr present · pixel delta 0pp | this file |
| §Discipline-notes-r40-preanchor | r40 forward-declarations · 4 stubs | this file |
| §PNG-harvest-synchronous-track | r40 stub · sync-track sequencing around 5-page harvest | this file |
| §Pixel-PROVE-gate-canvas-render | r40 stub · pixel_delta_pct + dom_attr_count two-sub-gate | this file |
| §Panel-composition-sub-axis-decomposition | r40 stub · P9 67.25% sub-axis split | this file |
| §Cross-axis-pivot-cadence | r40 stub · per-round vs per-asymptote pivot discipline | this file |

---

## §LATE-elaborations-r38

Eleven new §-anchors landing at r38 LATE per §Doctrine-author-cannot-violate. Four are the r36-preanchored cluster-anchors finally elaborated against r38 empirical evidence (the cluster work that would have provided the evidence didn't execute until r37–r38). Seven are r38 promotions from gap-diffusion-survey-pass-11 (sha 4143eaf0).

### r36-preanchor elaborations · finally landing

**§Array-indexed-PTRADD-store-handler.** Cluster-A array-indexed STORE shape — `STORE(PTRADD(this+base, i*stride), v)` — landed as fold-rule extension r37 (caller-passed walker substrate) consumed in r38 cluster-A non-thisptr pass-2 (sha 30104545 · 0.0pp lift). The handler resolves but the SHAPE is not the dominant cluster-A subtype. Empirically falsified-as-dominant: see §Array-PTRADD-falsified-again below for the empirical seal. Handler retained as honest substrate; downstream ranking demoted via §When-axis-ceilings-stick-look-elsewhere (cluster-A flat 6 rounds). Substrate value: array-indexed pattern still resolves where it occurs (≈8% of cluster-A sites); zero invented bugs.

**§Extractor-restoration-IR-grounded-protocol.** r35 i-retrofit-era-extractor-survey (sha a40934dd) routed 7 deleted extractors to r36 carriers via `ir.callsTo` + `ir.qtTypeOf`. r38 cluster-EXT executed the restoration: `git checkout retrofit-era-terminal -- <path>` first · adapt to 15-verb query grid second · NEVER re-author from scratch. Empirical anchor — r38 dim-* extractors (paintevent vtable · stylesheet · qstatemachine · qaction · sizepolicy · focus-chain · qtimer · tr-binding · mouse-gesture) all followed the protocol; substrate landed in pipeline pass-11 (sha 2198d138) without re-inventing prior bugs. **Test:** before authoring an extractor, did you `git log --all --diff-filter=D --name-only | grep <pattern>`? If no, IR-grounded restoration not yet attempted.

**§Trampoline-vtable-terminal-upstream-walk.** Cluster-B FnPgRov GBD-r36 single-tuple unresolved-signal at non-ctor binding site closed in r38 (sha 6d0f7b34 · i-cluster-b-fnpgrov-onconnection-resolve-post-rerun). Terminal-upstream IS the FnPgRov::OnConnection function body itself. The vtable trampoline walk preserved as honest method-of-last-resort; superseded in this case by lambda-functor bypass (see §Trampoline-with-bypass below). **Discipline:** when slot-side `qt_static_metacall` walker fails AND `QSlotObjectBase` resolver fails, the FINAL upstream is the binding site's own function body — not vtable indexing. Walk the body; vtable analysis only when body-walk fails.

**§Cluster-EXT-restoration.** r36 cluster name realised across r37–r38. Distinct from cluster-A (extraction-yield) and cluster-B (sender-pairing): cluster-EXT is the BACK-PORT cluster — extractors that retrofit-era had, scorched-earth deleted, IR-grounded restoration revives. r38 cluster-EXT footprint: 9 dim-* extractors landed · 5 PARTIAL-GREEN with named honest-RED residuals · 4 GREEN. Cluster-EXT velocity (≈3hr/extractor) > re-authoring velocity (≈1day/extractor). Operationalises §Substrate-survives-extractors-die at the meta-cluster level.

### r38 promotions · gap-diffusion-survey-pass-11

**§Tier-2-decompiler-derived-shards.** r38 Ghidra rerun (sha 3ccb992b · 167s elapsed) landed TIER-2 substrate beyond classes/functions/strings: 8466 classes · 331 vtables · 157 metaObjects · 201 rtti · 133 stackFrames. Tier-2 = decompiler-derived facts that require Ghidra's analysis (not raw symbol/string tables). Cluster-A corpus-depth-raise consumed (sha 96a4aa87) · cluster-EXT extractors consumed (paintevent vtable · qstatemachine · mouse-gesture vtable-rtti). **Discipline:** tier-2 shards are second-class to tier-1 (functions/classes/strings) but FIRST-class for any walker reaching beyond raw symbols. Per §Cluster-A-synchronous-Ghidra-rerun-protocol, tier-2 emit happens in the same single rerun as tier-1; never opportunistic re-runs.

**§Render-correctness-pivot-cross-axis.** r38 empirical inversion: r37 carrier ranking by axis-bias placed P2 (geometry) at 49.3%; r38 pixel-evidence (sha 4476c512 · carrier-ranking-by-pixel-coverage-pass-2 · 10 axes) revealed P2=0.82% and P9 (panel composition) dominant at 67.25%. **Thirteen carriers dropped** when ranked by real pixel-coverage instead of axis-bias narrative. Operationalises §When-axis-ceilings-stick-look-elsewhere with empirical seal: cross-axis pivot is mandatory whenever pixel-evidence and narrative-rank disagree. Pixel-evidence wins; doctrine-rank is hypothesis until the pick-buffer agrees.

**§Console-probe-pipeline-gate.** §Validator-must-open-the-console held doctrinally for 6 rounds (r31–r37) without empirical enforcement — receipts cited stratum-dev.log as proxy. r38 baked `scripts/validators/browser-console-probe.ts` into the pipeline (sha ceeb4f94 · i-browser-console-probe-bake-into-pipeline) as canonical primitive. Receipts MUST cite probe output (`browser_console_error_count` · `browser_pageerror_count` · `browser_async_error_count`); stratum-dev.log no longer satisfies the gate. r39 carrier r39-browser-console-probe-ci-hook wires it as pre-commit + roadmap-advance gate. **Test:** does the receipt name a probe sha and emit count? If no, gate is forged-via-server-log.

**§Trampoline-with-bypass.** Lambda-functor binding (`QObject::connect(sender, signal, [](){...})`) bypasses qt_static_metacall slot-dispatch entirely — the slot is an inline closure, no metaObject entry exists. r38 cluster-B FnPgRov::OnConnection resolved (sha 6d0f7b34) by recognising the bypass: walker checks for QSlotObjectBase functor pointer in connect-tuple BEFORE attempting metacall switch-walk. **Discipline:** sender-pairing-walker's first prong is bypass-detection · only fall through to switch-walker when functor-pointer absent. Vtable analysis is THIRD upstream layer, not first. Refines §Sender-pairing-walker-protocol with explicit bypass branch.

**§Array-PTRADD-falsified-again.** Cluster-A non-thisptr pass-2 residual execute (sha 30104545) lifted 0.0pp — array-indexed PTRADD STORE is NOT the dominant cluster-A subtype. Combined with r35 (caller-passed 0pp) and r36 (PTRADD partial), cluster-A flat across rounds 33–38 across SIX consecutive iterations on the same axis. Empirical asymptote — §When-axis-ceilings-stick-look-elsewhere fires hard. r39 deprioritises cluster-A in favor of P9 (panel composition · 67.25% pixel-mass) and P8 (custom-paint · 23.89%). **Test:** does the round's headline carrier sit on an axis whose pixel-coverage exceeds 5%? If no, you're polishing a 1% axis while 90% of disagree-cells go untouched.

**§Extractor-restoration-IR-grounded.** Empirical seal of §Extractor-restoration-IR-grounded-protocol. r38 retrofit-era survey verdict: of 50 surveyed extractors (r35 sha a40934dd), 4 RECOVERABLE shards landed in r38 (paintevent · qstatemachine · stylesheet · sizepolicy). Recovery cost ≈3hr/shard vs re-authoring ≈1day. Two failure modes encountered: (a) retrofit-era extractor depended on schema field that no longer exists — adapter required · (b) retrofit-era extractor used pre-IR ad-hoc grep — must be rewritten against `model/ir/query.ts`. Both modes accommodated; zero net-new judgment-table entries.

**§Granularity-pixel-evidence-seal.** Sibling refinement of §Granularity-fidelity-probe. r38 carrier-ranking-by-pixel-coverage-pass-2 (sha 4476c512) DROPPED 13 carriers whose pixel-coverage measured <2% empirically — they survived narrative-rank but failed pixel-rank. **Discipline:** every carrier owes a `pixel_coverage_pct` field measured against the live disagree-cell corpus before promotion to round-N P0. Carriers without pixel-coverage measurement default to P3 (lowest), not P0. Pixel-evidence is the seal — narrative confidence does not promote a carrier above empirical floor.

---

## §Discipline-notes-r39-preanchor

Forward-declarations for r39 LATE doctrine. PROVISIONAL — r39 gates may NOT be GBD'd via these. Five mandated stubs below; four r38-era stubs (Pdf-baseline-rebase-as-denominator · Panel-composition-as-dominant-axis · Custom-paint-stylesheet-literal-defuse · Cross-page-png-pairing-protocol) merged where mandated names overlap — see §PDF-baseline-rebase-discipline aliasing §Pdf-baseline-rebase-as-denominator, and §Page-corpus-png-pairing-protocol aliasing §Cross-page-png-pairing-protocol. §Panel-composition-as-dominant-axis and §Custom-paint-stylesheet-literal-defuse retained as standalone P9/P8 axis stubs.

**§Substrate-consume-must-follow-substrate-lift.** Trigger: substrate (`.generated.ts` · IR verb · fold-rule · dim-* extractor) lands without same-or-next-round populator-consume + DOM-wire. Mechanism: §Populator-consume-protocol four-hop wiring contract becomes round-spec mandatory — every substrate-LIFT node owes a paired populator-WIRE node and a runtime-PROVE gate, in same round if Goldilocks-budget allows, next round otherwise (named carrier, no >1-round drift). Test: does every substrate node in round-spec name its consumer node by id? If no, substrate is dead-weight per r30 cluster-EXT scar. LATE elaboration owed at r39 close — empirical seal vs r38 dim-* extractors (5 PARTIAL-GREEN, named consume-residuals).

**§RC-pivot-empirical-pixel-evidence.** Trigger: round considers RC-cluster pivot (cross-axis carrier reordering · §When-axis-ceilings-stick-look-elsewhere fires). Mechanism: pivot decision MUST cite per-axis pixel-coverage delta from `pixel-gap-classifier` corpus (§Pick-buffer-as-diffusion-substrate); narrative-rank insufficient, axis-bias insufficient. Pivot artifact names old-rank · new-rank · pixel_coverage_pct per axis · carriers dropped vs retained. Test: does the pivot receipt cite a sha of carrier-ranking-by-pixel-coverage with N≥10 axes measured? If no, pivot is forged-via-narrative. LATE elaboration owed — refines §Render-correctness-pivot-cross-axis with the citation contract.

**§PDF-baseline-rebase-discipline.** (Alias-of / supersedes §Pdf-baseline-rebase-as-denominator preanchor.) Trigger: round wants to rebase pixel-disagreement denominator (proxy-grid → real-pixel · sparse-PNG → dense-PNG · per-page → cross-page). Mechanism: rebase ONLY when (a) classifier shape changed AND (b) denominator unit changed; both prongs required per §Meta-#8 PBR — old denominator retained as parity-check until new dominates two consecutive rounds. Receipt names old_denom · new_denom · parity_window. Test: does rebase narrative point at classifier delta + denominator-unit delta both? If only one, it's goalpost-move. LATE elaboration owed.

**§Page-corpus-png-pairing-protocol.** (Alias-of / supersedes §Cross-page-png-pairing-protocol preanchor.) Trigger: cross-page render-lift considered while only 1/6 pages has visual-truth PNG paired (FnPgRov). Mechanism: PNG-pairing is PRECONDITION — round may not promote any cross-page render carrier until paired-page count ≥ K (K=3 for r39, ramps with rounds). Sources ranked: enshrined `docs/design/legacy-reference/*.png` first · era-PNG inversion sensor second (§Era-as-dubious-source-inversion) · re-photograph last. Test: does the round's render-correctness carrier name N paired pages with sha-pinned PNGs? If N<K, carrier is premature. LATE elaboration owed.

**§Pixel-coverage-priority-floor-2pct.** Trigger: carrier promotion to P0/P1 priority in round-spec. Mechanism: any carrier whose empirical `pixel_coverage_pct` measures <2% on the live disagree-cell corpus is auto-demoted to P2 (refines §Granularity-pixel-evidence-seal which dropped <2% carriers entirely; this preserves them at P2 rather than dropping). Floor enforced at round-spec compile time by validator hook (§Validator-as-process). Test: does every P0/P1 carrier's receipt slot include `pixel_coverage_pct ≥ 2.0`? If no or unmeasured, demote. LATE elaboration owed — empirical seal at r39 close vs the 13 carriers dropped in r38 sha 4476c512.

**§Panel-composition-as-dominant-axis.** (Retained from r38-era stub.) P9 panel-composition emerged r38 as 67.25% of pixel-mass — single largest axis ever measured. r39 expects multiple P9 carriers (tool-panel template · sizepolicy d-pointer walker · layout-policy DOM-attr emit). Doctrine pending: does P9 deserve sub-axis decomposition (anchor · margin · layout-mode · child-order)? Empirical anchor at r39 LATE.

**§Custom-paint-stylesheet-literal-defuse.** (Retained from r38-era stub.) P8 custom-paint = 23.89% pixel-mass. r38 dim-stylesheet-palette-font extract landed substrate but stylesheet content recovery requires climbing operands[1] pcode-tree to QString::fromAscii literal. r39 carrier r39-dim-stylesheet-literal-css-defuse-walker. Doctrine pending: literal-defuse is a NEW fold-rule family — operates on string-builder pcode patterns, not numeric scalars. LATE elaboration owed.


---

## §LATE-elaborations-r39

Ten new §-anchors / elaborations landing at r39 LATE per §Doctrine-author-cannot-violate. Five are the r39 preanchor stubs (sha 6f8827ed) finally elaborated against r39 empirical receipts. Four are r39 promotions earned by empirical landings. One is a meta-pattern-validation table (separate node not authored this round; verdicts inlined per stub).

### r39 preanchor elaborations · finally landing

**§Substrate-consume-must-follow-substrate-lift · ELABORATED.** A populator that LIFTs substrate without a downstream WIRE in the same or next round is dead weight (§Populator-consume-protocol forward direction). r39 empirical bite: `v-substrate-consume-coverage` (commit 2f93e9d4) landed RED-via-honest-named-carriers · 2/6 of 4 strict-consumed dims. Four r38–r39 substrate landings (paintevent · stylesheet-literal · qstatemachine · sizepolicy) had populators emitting but only 2 had stratum DOM-attr consumers. **Test:** for every `pipeline/populators/*.ts` field, does a `stratum/HmiRuntime.vue` (or sibling) line read it within ≤1 round of LIFT? If no, validator MUST surface unconsumed substrate explicitly. Substrate-without-consumer is forge-by-narrative regardless of unit-green.

**§RC-pivot-empirical-pixel-evidence · ELABORATED.** Carriers ranked by per-axis pixel-coverage (§Granularity-pixel-evidence-seal) · NOT axis-bias narrative. r39 anchors: `i-carrier-ranking-by-pixel-coverage-pass-3` (commit b71f58e5) · 15 carriers enumerated · 3 P0 pixel-ranked · 10 demoted to P3 · top-5 seed combined coverage 93.5%. `i-pixel-gap-classifier-pass-4` (commit 5f22d8b2) · 10 axes · 19592 cells · UNKNOWN 0.735% (honest near-floor) · P9 + P8 reclassified to 93.52% combined pixel-mass. **Discipline:** every round-terminal carrier manifest owes a `pixel_coverage_pct` per carrier OR a written reason it cannot be measured (e.g. denominator-shift in flight). Narrative-rank is hypothesis · pixel-rank is verdict.

**§PDF-baseline-rebase-discipline · ELABORATED.** When the denominator shifts (proxy-grid → real-pixel · 16px → 1px · synthetic → enshrined PNG), receipt MUST surface the shift transparently and re-baseline upward NEVER downward (§Bug-hunt-as-regression-gate sibling). r39 anchors: `i-pdf-baseline-rebase-on-real-pixels` (commit 9598745d) wave-1 rebased FnPgRov denominator from 16px proxy to 1px real pixel; `v-pixel-disagreement-fraction-pass-3` GBD-r40-via-honest-rise — fraction rose because the denominator tightened, not because diffusion regressed. **Test:** does the receipt name BOTH old and new denominator AND classify the delta as denominator-shift vs progress vs regression? If no, denominator change is laundering. Honest-rise routes to GBD-r40 with named follow-on (`r40-pdf-classifier-rebuild-on-real-pixel-denominator`).

**§Page-corpus-png-pairing-protocol · ELABORATED.** Multi-page §Three-way-convergence requires every target page own an enshrined screenshot OR honest unpaired status with named harvest carrier. r39 anchor: `i-page-corpus-png-pairing` (commit c5fe8d34) · 1/6 pages paired (FnPgRov only) · 5 unpaired (FnPgAuv · FnPgMission · FnPgFiles · FnPgHome · FnPgRovMk3) · GBD-r40 routed to `r40-png-harvest-from-tablet`. PNG harvest is synchronous-only (`dispatch_mode:"synchronous"` per §Cluster-A-synchronous-Ghidra-rerun-protocol sibling) — requires Windows VM or tablet running FUSION.exe. **Discipline:** until pairing closes, cross-page pixel-disagreement-fraction is predictor-vs-topology only, NOT vs-screenshot. Receipt must name which two oracles produced the verdict; absence of third oracle is honest, not silent.

**§Pixel-coverage-priority-floor-2pct · ELABORATED.** Carriers with measured pixel-coverage <2% auto-demote to P3. r39 enforcement seal: `i-gap-diffusion-survey-pass-12` (commit 9b18414a) · 19 r40 carriers · ZERO above P3 in cluster-A or cluster-B. Cluster-A's 0.82% pixel-coverage (7-rounds-flat) and cluster-B's structurally-absent class-tuple (`i-cluster-b-class-tuple-walker-corpus-extend` GBD-r40) both sit BELOW the floor and are demoted regardless of doctrinal interest. **Test:** is any P0/P1/P2 carrier sitting on an axis with measured pixel-coverage <2%? If yes, downgrade. Floor enforces §When-axis-ceilings-stick-look-elsewhere with a hard numeric.

### r39 promotions · empirically earned

**§Cluster-A-officially-CLOSED.** Cluster-A (LOAD-of-this-member fold yield) flat across SEVEN consecutive rounds (r32 6% → r33 14% → r34 honest-RED → r35 0% → r36 partial → r37 deprioritised → r38 array-PTRADD 0.0pp → r39 close). r39 anchors: `i-cluster-a-cross-function-member-resolver` (commit 53f6295f) DECLINE-TO-AUTHOR · `i-cluster-a-member-init-lattice` (commit 7c0be16b) ASYMPTOTE-FIRED-GBD-r40. §When-axis-ceilings-stick-look-elsewhere fired authoritatively · pixel-floor 0.82% << 2% threshold · 0 cluster-A carriers in r40 manifest above P3. Cluster-A is CLOSED — not solved, but retired as a primary axis. Future cluster-A work requires fresh evidence that pixel-coverage rose above 2%, not new mechanism iteration. **Discipline:** seven-rounds-flat is the empirical seal · no ceremonial reopens.

**§Cluster-B-class-tuple-FALSIFIED-AT-CORPUS.** r39 spec predicted 30–50 class-tuple connections at corpus extend; `i-cluster-b-class-tuple-walker-corpus-extend` (commit 8e326f73) found 0 — class-tuple shape structurally absent from FUSION's connect-tuples (lambda-functor + qt_static_metacall dominates per §Trampoline-with-bypass). FALSIFIED-AT-CORPUS · GBD-r40. **Discipline:** spec-time predictions of corpus shape ARE falsifiable — when a "30–50 expected" lands at zero, the prediction was a hypothesis disguised as a target. Receipt names the falsification and routes intent to a successor that re-targets the actual dominant shape (lambda-functor walker, already landed sha 6d0f7b34).

**§Substrate-consume-LIFT-WIRE-PROVE-canonical · empirical seal.** §Populator-wire-LIFT-WIRE-PROVE-canonical proven empirically at r39: `i-dim-paintevent-emit-wire` (commit 8ca6977b) · 92 widgets DOM-attr stamped · 10 on FnPgRov · LIFT GREEN · WIRE GREEN · PROVE FLAT (pixels unchanged). The PROVE step revealed: DOM attribute presence proves SCHEMA-RUNTIME-CONTRACT (§Schema-runtime-contract) but does NOT prove pixels rendered. Painting requires canvas/SVG render, not just attribute. Refines LIFT-WIRE-PROVE: the PROVE step has TWO sub-gates · (a) DOM-attr present (assay probe) · (b) pixel delta visible (pick-buffer diff). Both required for full PROVE.

**§DOM-attrs-don't-paint-pixels.** Sibling to §Substrate-consume-LIFT-WIRE-PROVE-canonical seal. Empirical anchor across two r39 lift attempts: `i-render-lift-fnpgrov-axis-P8` (commit d8cc4377 · GBD-r40 · substrate+DOM-attr LANDED · visual paint not in scope) and `i-render-lift-fnpgauv-axis-P9` (commit aff58b49 · GBD-r40 · P9 4387→4387 · 0pp pixel delta). Both proved: stamping `data-paint-source="custom"` or `data-panel-template="..."` on a widget is necessary but not sufficient. **Test:** does the round's render-correctness gate measure DOM-attribute count, OR pick-buffer pixel-disagreement-fraction? If the former, the gate is forged-via-attribute-presence. Pixel delta is the seal · attributes are the precondition.

### r39 verdict on r39 preanchors

| Stub | Verdict | Evidence |
|---|---|---|
| §Pdf-baseline-rebase-as-denominator | HELD · elaborated as §PDF-baseline-rebase-discipline | sha 9598745d + GBD-r40-via-honest-rise |
| §Panel-composition-as-dominant-axis | REINFORCED · P9 reclassified 67.25%→sub-axis pending | sha 5f22d8b2 + 85d4ec3d |
| §Custom-paint-stylesheet-literal-defuse | PARTIAL · 0/48 sites recovered · upstream RED to ghidra-strings-shard | sha bdd0e4be |
| §Cross-page-png-pairing-protocol | HELD · 1/6 paired · 5 named to r40 harvest | sha c5fe8d34 |
| §Pixel-coverage-priority-floor-2pct | HELD · enforced at gap-survey · 0 above P3 in cluster-A/B | sha 9b18414a |

Zero falsifications across five preanchors. §Doctrine-author-cannot-violate honored: r39 gates closed BEFORE this elaboration; no stub was cited to GBD an r39 gate.

---

# Spec-as-knowledge-graph cluster · r41 preanchor

The following three anchors form a cluster naming the emergent pattern that roadmap specs are typed knowledge graphs, not config files. PROVISIONAL — per §Doctrine-author-cannot-violate, the rounds that authored these (fleet-r41 · ml-prague-r1) cannot cite them to GBD their own gates. Only later rounds may cite as gates.

## §Spec-as-typed-knowledge-graph

Architectural · LOAD-BEARING. The spec is a typed knowledge graph, not a config file. Slots carry different KINDS of knowledge with different ACCESS patterns:

```
inputs[]      sha-pinned immutable substrate · participates in compile_hash
dag_desc      prose intent · scenario · stance · risk · cluster narrative
metadata.{}   structured round-level facts · permissive · jq-queryable
tasks[]       per-node specifications
validators    claim-category-matched checks
receipts      per-node completion JSON
```

Authors choose where to place a fact by KIND × ACCESS × DURABILITY: immutable+hashable→`inputs[]` · prose context→`dag_desc` · round-level fact→`metadata.{}` · per-task fact→`tasks[].{}` · durable across rounds→CLAUDE.md or skill.

Executors read each slot with the appropriate access pattern: metadata is jq-queryable · dag_desc is read once at orient · receipts are streamed and synthesized at term.

**Empirical anchor:** `fleet-r41-runtime-haul.spec.json` (commit 47d2209d) `metadata.{}` carries 7 distinct semantic categories (network endpoints · filesystem coordinates · toolchain · cross-repo bridges · procedures · policy · gates) — none required by the engine — because no first-class slot fit. Same shape across `ml-prague-r1` + `fleet-r41`. Pattern observed but not designed.

**Parallels:** npm `package.json.config` · K8s annotations · HTTP custom headers · JSON-LD `@context`.

## §Sidecar-promotion-rule

Parent: §Spec-as-typed-knowledge-graph. **Claim:** sidecars are honest interim slots. Discipline is in WHEN to promote, not in avoiding sidecars. **Rule:** when a metadata sidecar SHAPE recurs across 3+ specs, promote to first-class engine schema. Until then, sidecar IS the right place.

**Promotion candidates today:** `autonomy.{policy, stratum_push_gate, schema_extension_gate, human_window_nodes}` (2 specs · borderline · wait for one more) · `network_endpoints` (1 spec · not ready).

**Evidence from software parallels:** npm `package.json.config` promoted some keys to first-class · K8s annotations grew into status fields · HTTP `X-` headers standardized then dropped `X-` prefix.

## §Sidecar-as-ambient-context

Parent: §Spec-as-typed-knowledge-graph. **Claim:** executing agents read `metadata.{}` as round-level AMBIENT context. Per-node briefs do NOT re-pass round-level facts that live in metadata · that's duplication and drift risk. The dispatcher injects metadata as ambient. Procedures embedded in metadata (literal text agents emit on trigger) emit VERBATIM · no paraphrasing · the procedure lives in the spec not the agent.

**Empirical anchor:** `fleet-r41-runtime-haul` `metadata.autonomy.ssh_resilience` embeds the literal reactivation command `~/src/fusion-ncb/tools/activate-ssh.sh --spawn` — agent emits verbatim on SSH failure. Works because the procedure is graph-state, not training-state.

**Relation to §Three-non-negotiables:** item 2 ("the model is the database") generalizes — the spec is ALSO a database that agents query.

---

## §Discipline-notes-r40-preanchor

Forward-declarations for r40 LATE doctrine. PROVISIONAL — r40 gates may NOT be GBD'd via these.

**§PNG-harvest-synchronous-track.** r39 GBD-r40 named `r40-png-harvest-from-tablet` synchronous-only (Windows VM / Galaxy Tab). Doctrine pending: how does autonomous track sequence around synchronous PNG-harvest such that 5 cross-page disagree-cell measurements unblock without round-stall? §Synchronous-track-parallel-not-gating sibling.

**§Pixel-PROVE-gate-canvas-render.** §Substrate-consume-LIFT-WIRE-PROVE-canonical seal exposed two-sub-gate structure of PROVE. r40 owes the canonical pixel-PROVE primitive: pick-buffer pre/post diff per axis, not just DOM-attr count. Receipt schema field: `pixel_delta_pct` paired with `dom_attr_count`.

**§Panel-composition-sub-axis-decomposition.** P9 67.25% pixel-mass → r40 must split (anchor · margin · layout-mode · child-order · sizepolicy-d-pointer). Single-axis carrier ranking on a 67% axis is too coarse · sub-axis ranking required for cross-axis pivot to function below P9.

**§Cross-axis-pivot-cadence.** §When-axis-ceilings-stick-look-elsewhere fired r37 (P2→P9) and r39 (cluster-A close). Cadence pending: is cross-axis pivot a per-round discipline or a per-asymptote event? Empirical anchor needed at r40 — does the panel-composition pivot itself plateau and demand another cross-axis pivot, or does it converge?

