---
name: fleet-doctrine-history
description: Empirical anchors and per-round LATE-doctrine elaboration for fleet rounds r31-r35. Use when a doctrine §-anchor cited in a receipt requires depth on its empirical landing, or when investigating why a doctrine was added.
---

# Fleet doctrine history · r31-r35 + deep-doctrine archive

CLAUDE.md retains the §-anchor index + load-bearing rule + Test for each doctrine. This file holds empirical depth: per-round LATE-doctrine elaboration, receipts, shas, falsified hypotheses, ASCII tables, multi-paragraph anchors. Receipt-search by §-name finds depth here.

---

## Per-round Discipline-notes (r31-r35) · verbatim from prior CLAUDE.md

## Discipline notes · r31

**§Handoff-vs-commit.** A handoff README is narrative; a commit is reality. The two diverge silently when an in-flight session writes a handoff JSON claiming work landed but never lands the commit. The README's existence is NOT evidence of work — only the named sha against `git diff <sha>~..<sha>` is.

```
canonical anti-pattern · r30
  in-flight session writes .roadmap/.handoff/i-foo-pass-N.json
  README narrates "schema field X lifted to N entries · sha abc1234"
  successor session reads README · trusts narrative · advances
  later: git log shows abc1234 doesn't exist OR the diff is empty
  → forged-progress · round opens with hidden dropped thread

protocol · trust verification, not narrative
  1. handoff JSON names a sha    git cat-file -e <sha> · must exist
  2. handoff JSON names files    git diff <sha>~..<sha> -- <files>
                                 must be non-empty AND match the claim
  3. empty diff or missing sha   surface as blocker-upstream
                                 §RED-is-good-when-named · don't relabel
```

**Test:** can you point at a non-empty diff under the named sha that contains the claimed change? If no, the handoff is forged-progress regardless of how confident the README sounds.

## §Doctrine-author-cannot-violate

A round that lands new doctrine in CLAUDE.md cannot depend on that same doctrine to GBD its own gates within the same round.

```
this round AUTHORS §X     →  this round's gates that test §X
                              must hold to PRIOR-round standard
                              OR be honestly RED · never GBD'd via §X
```

**Rationale:** doctrine timing scar. The doctrine becomes an alibi for the violation. The same agent writes the rule and the dispensation in the same commit-window — the rule is shaped (consciously or not) to absorb the failure it was supposed to prevent.

**Test:** would this round's GBD survive if the doctrine cited were someone ELSE's doctrine — landed two rounds prior, by a different author, against unrelated work? If no, you're laundering the verdict through your own writing.

**Discipline:** doctrine landed mid-round is provisional until a successor round either invokes it cleanly or refines it. Self-citation within the authoring round is forbidden. The doctrine becomes load-bearing after another round honors it without needing it as alibi.

**Anchor · r31:** forward-declared §Schema-runtime-contract-loop and §Populator-parallel-dispatch at i-doctrine-r31-preanchor, then violated §Populator-consume-protocol five times, then closed PASS-via-GBD on the strength of doctrine the same round wrote. The screenshot was the falsifier.

**§Populator-parallel-dispatch.** Parallel populator agents writing to `model/output/hmi-schema.json` race · the last writer wins · earlier agents' lifts vanish silently. Either serialize the dispatches OR mandate a final integration regen pass that consolidates and reports zero drift. Every parallel-dispatch round MUST name an integration-regen node in the DAG · without one the round closes on inconsistent schema state.

```
detection · two telltales
  1. schema mtime < latest populator agent commit time
  2. populator agent's claimed schema delta absent from final schema
     (its write got overwritten by a later parallel agent)

contract · per round
  parallel populator agents      → integration-regen node REQUIRED
  serialized populator chain     → no integration node needed
                                   (each agent reads predecessor's commit)
```

**r31 evidence · contract honored:**

```
  i-pipeline-pass-4-rerun        integration regen · zero drift reported
  144 connections                sustained from r30 (no regression)
  3+ parallel runtime-dispatch   agents ran in r31 · integration consolidated
  receipt                        i-pipeline-pass-4-rerun.json · GREEN
```

The §Populator-parallel-dispatch contract is now the closing gate for any round that dispatched populators in parallel — absorbed into the routine cadence.

## Discipline notes · r32

**§Validator-must-open-the-console.** Render-adjacent receipts MUST cite browser `console.error` count from a real devtools probe. Server-side log inspection (e.g. `stratum-dev.log`) does NOT satisfy this gate — Vite dev-server logs are blind to runtime mount errors, AsyncComponentWrapper failures, and inject/provide fatals.

**Probe pattern · playwright-attached-console:**

```
  step 1   launch playwright (or assay probe wrapping it) · attach page console listener
  step 2   navigate · let mount complete · capture errors[] · pageerrors[] · async failures
  step 3   receipt fields · MANDATORY
             browser_console_error_count: <int>
             browser_pageerror_count: <int>
             browser_session_fatal_count: <int>
             browser_async_error_count: <int>
  step 4   classify residual · intentional stub vs regression · cite per-error
```

**Empirical anchor · r32 canary cycle:**

```
  pass-1   FAIL · 30+ AsyncComponent errors · session-context fatal · cited honestly
  pass-2   PARTIAL · session-context fix lifted fatals · stub errors remained
  pass-3   PASS · 14 buttons · 0 async/fatal/pageerror · 3 intentional stub console.warn
           receipt: i-component-canary-mount-button-pass-3 · screenshot canary-pass-3.png
```

Scar-anchored: r31 i-fnpgrov-runtime-proof-pass-4 cited stratum-dev.log as `console_clean` while the browser console showed 30+ errors; receipt was amended in place at commit 39fd75db (gate (a) corrected from forged-PASS to honest-RED).

Per §Doctrine-author-cannot-violate, r32's gates do NOT cite this section to GBD anything; r32 holds to the prior-round console standard (which was: open the browser console; r31 just didn't).

## §Era-as-dubious-source-inversion

THIRD application of §Diffusion-discovery-pattern via cascade inversion. The pattern shows that legacy era PNGs — historically dismissed as "noisy reference, not source of truth" — can serve as a NOISY SENSOR INPUT to algebraic inversion when binary-extracted geometry plateaus.

**Pattern · cascade inversion:**

```
  inputs           era values (noisy · per-widget pixel rect from rendered PNG)
                   structural relations (parent_rect · sibling adjacency · binary-extracted)
                   global unknowns (DpI scale · window-size · LOAD-blocked)

  inversion        treat era-values as sensor readings · structural relations as constraints
                   solve for global unknowns by consensus voting across widget population
                   widget rect + parent rect → DpI candidate · vote across N widgets

  output           globals resolved as fallback when LOAD-blocked
                   era values retire as fallback once binary unblocks (r33 carriers)
```

**Disagreement-as-signal:** when most widgets vote DpI=1.0 and one widget votes DpI=0.5, the outlier is not noise — it's a signal that the outlier widget's binary site has a different scale path. r32 cascade pivot from LOAD-globals to parent_rect leaves was driven by exactly this disagreement signal.

**Empirical anchor · r32 receipts:**

```
  i-globals-inference-from-era            DpI=1.0 consensus across widget population
  i-globals-inference-from-era-pass-2     constraint solver +44 · 23/41 FnPgRov resolvable
  i-geometry-mechanism-shift-in-round     pivot from LOAD-leaves to parent_rect-leaves
  three-way sample (v-geometry-yield-pass-2):
    m_style       era exact · structural exact · screenshot exact
    m_leftMap     era 1px-drift · structural 1px-drift · screenshot match
                  (predictor-gap-cosmetic · NOT all-disagree)
```

**Test · is era a sensor or source-of-truth?** Sensor: subject to noise, used as one input among many, retired when binary unblocks. Source-of-truth: contradicts binary directly. r32 used era strictly as sensor — when r33's `r33-ghidra-rdata-bytes-dump` lands, era retires as fallback (§Meta-#8 PBR applies).

## §Inversion-as-extraction-method

META mechanism · subsumes §Era-as-dubious-source-inversion as a SPECIFIC application. When two corpora overlap on shared unknowns AND one corpus contains symbolic expressions the binary already wrote, treat extraction as **constraint-solving** · solve algebraically · consensus-vote across instances · seed the unknowns · re-run downstream. Sibling to §Diffusion-discovery-pattern (LLM-side mining method) and §Cascade (top-down resolve). Together they form three corners: §Diffusion mines unknown taxonomies · §Cascade resolves known-tree-known-root · §Inversion solves overlapping-source equations.

**Canonical shape:**

```
  known         observation of the right answer        era_value · screenshot ·
                                                       runtime trace · topology
  expression    symbolic computation with unknowns     pcode tree · IR query
                                                       result · populator chain
  unknown       leaf to be solved for                  LOAD-addr · parentRect.w ·
                                                       DpI scale · color token ·
                                                       state-condition input
  INVERT        known = expr(unknowns) · solve         algebra · matrix system
                for one unknown given the rest          · iterative bootstrap
```

**Two-prong test · when to reach for it:**

```
  1  do we have an INDEPENDENT KNOWN-OUTPUT corpus?
     era · screenshot · topology · runtime trace · log capture
  2  do we have a SYMBOLIC EXPRESSION the binary already wrote?
     pcode tree · IR query result · populator emit chain

  both true → INVERSION is the right method.
  don't reach for more diffusion or more grep — solve algebraically.
```

**Application slots · only one tapped in r32 · five untapped:**

```
  geometry      ✅ r32 · era + setGeometry pcode → seed parent_rects
                  cascade lifted 220 widgets (m_style EXACT match
                  proving inversion is right)

  color         untapped · era CSS hex + theme-token resolution expr
                → solve unknown token value · same cheat shape

  visibility    untapped · era render-state + visibility_guard expr
                → solve guard's input variable

  slot-data     untapped · era visible content + slot-effect rule
                → solve slot field

  connections   untapped · era wiring observation + signal-slot chain
                → solve stack-local resolver (THIS is exactly what
                  r33-connect-tuple-stack-local-walker should be ·
                  inversion not new walker)

  state-machine untapped · era state-conditional render + state-eval
                pcode → solve condition's input
```

**Discipline guards** (inherited from §Era-as-dubious-source-inversion):
- known corpus stays DUBIOUS · consensus voting required · sanity bounds enforced
- §Three-non-negotiables · NEVER fabricate · honest unresolvable beats forged seed
- §Fail-hard · seeds with low support flagged · disagreement table = carrier manifest
- §Meta-#8 PBR · once binary-side dominance proven, inversion-derived seeds retire

**Anti-pattern:** reaching for a new walker / new IR verb / new fold rule when the question is actually "what value would make the existing equation balance?" The connect-tuple-stack-local-walker carrier from r32 is the canonical instance — the resolver doesn't need a new walker, it needs era observations of wiring + the existing connect-tuple expression + inversion.

## §Iterate-to-ceiling-then-diffuse-back

Within-round iteration loop pattern · formalized after r32 Griffin-directed mechanism shift. When a node hits ceiling (yield plateaus across two consecutive passes despite mechanism remaining valid), STOP iterating the same mechanism — diffuse-back into strategy/tactics, decide in-round close vs r33 carrier.

**Loop · five steps:**

```
  1. ITERATE        run pass-N · measure yield delta vs pass-(N-1)
  2. PLATEAU CHECK  delta < 5% absolute AND mechanism unchanged → CEILING REACHED
                    (delta ≥5% OR mechanism changed → continue iterating)
  3. DIFFUSE BACK   re-read source corpus · classify residuals · ask "is the
                    mechanism wrong, or is the corpus exhausted at this scope?"
  4. DECIDE         in-round close (mechanism shift available · attempt pass-N+1
                    with new mechanism) OR r33 carrier (mechanism shift requires
                    upstream unblock · name carrier · close honest-RED)
  5. CLOSE          if in-round close attempted · third pass · re-evaluate
                    plateau · either GREEN-via-shift OR named-carrier-honest
```

**Empirical anchor · r32 geometry axis:**

```
  pass-1   0/45 baseline · LOAD-globals mechanism
  pass-2   23/41 cascade · era-inversion mechanism (NEW)
  pass-3   26/45 pipeline-pass-5 · structural-via-inferred lifted
  PLATEAU detected · diffuse-back classified residuals
  IN-ROUND CLOSE attempted · mechanism-shift to parent_rect leaves
  pass-4   29/40 (72.5%) · GREEN via in-round mechanism shift
  remaining 11 widgets routed to r33-multi-unknown-leaves
```

Distinct from §Multi-pass-diffusion-to-fidelity (which assumes mechanism stable, just adds passes). This pattern handles the case where the answer is "iterate harder won't help; iterate differently might."

## §Cluster-A-synchronous-Ghidra-rerun-protocol

PREANCHOR · r33 forward-declaration · light · §Doctrine-author-cannot-violate keeps this from being citable to GBD r33 gates. Sibling: §Synchronous-only-node-marker · §Pipeline-tempo (one ~25min cold break tolerated · everything else <5min).

Cluster A nodes carry `dispatch_mode:"synchronous"` · Griffin in the loop for the Ghidra session · ONE rerun per round · binary version unchanged · no opportunistic re-runs. Falsifier: malformed IR snapshot post-rerun → STOP · §Fail-hard · architecture review before downstream cascade.

Full elaboration at r33 LATE doctrine (after Cluster A executes and the protocol is empirically tested · NOT before).

## §Connections-inversion-application-pattern

PREANCHOR · r33 forward-declaration · light. Sibling: §Inversion-as-extraction-method (the meta) · §Era-as-dubious-source-inversion (the geometry application). Connections is the THIRD-corner test of inversion-as-extraction.

Pattern shape: cutover-3 r32 carrier was MISLABELED as "new walker" — the doctrine catches it · the right method is INVERSION of the existing connect-tuple expression with retrofit-era wiring observations as the dubious-known. Two-prong test (independent known-output + symbolic expression) both pass.

Full elaboration at r33 LATE doctrine (after cluster B lands and the connection-yield delta is measured · the doctrine codifies what the empirical run teaches · NOT before).

## Three-way convergence · predictor · topology · screenshot

r25 landed the forensic frame as a concrete artifact: three independent oracles triangulated per page, per state, per resolution. Every staging disagreement collapses to one of five named verdicts. No fourth category.

```
  predictor    predictLayout(IR) → expected geometry from compile-time facts
               honest unresolvable[] when a question can't be answered ·
               never silent default · never fabricated coordinate
  topology     pick-buffer sweep → observed render from the live browser
               model/output/topology/<page>.<state>.<res>.json · per pixel
               stack · authoritative for "what does the operator actually see"
  screenshot   enshrined legacy PNG → multimodal oracle · read via Read tool
               docs/design/legacy-reference/<page>.png · ground truth for
               "what did FUSION actually render"
```

**Triangulation verdict matrix** — each cell names a carrier class:

```
  all-agree              converged · move on
  render-bug             predictor + screenshot agree · topology diverges
                         → bh:class-N (rendering pipeline bug)
  predictor-gap          topology + screenshot agree · predictor silent/wrong
                         → extend predictor verb · shrink judgment table
  intentional-deviation  predictor + topology agree · screenshot diverges
                         → cross-check model/deviations.json · already-
                         authored OR new category-proposal
  all-disagree           three-way conflict · escalate to forensic deep-dive
                         → binary query · root-cause before any patch
```

**Discipline:** every disagreement gets a verdict + a bug-class + a disposition. No fourth category. "Unknown why it differs" is never terminal — if three oracles can't resolve it, the answer is "ask the binary via a new IR verb," which is itself a carrier.

**Operational test:** can you name the verdict for every visible delta on this page? If no, the diff isn't complete.

Exemplar: r25 FnPgRov closed GBD with every residual routed via this matrix — see /per-page-convergence canonical exemplar. Thesis depth: /rovmk3-thesis.

## Discipline notes · r33

**§Inversion-three-prong-test.** §Inversion-as-extraction-method's two-prong test (known + expression) was incomplete. The empirical scar of r33 connections inversion (i-connections-inversion-solve · partial falsification at FnPgRov) reveals a THIRD required prong: **consensus-poolable shared unknown across instances**. Without it, "inversion" degenerates into per-instance solving — which is just a walker by another name.

```
two-prong (insufficient)        + third prong (required)
known observation                shared unknown across instances
symbolic expression              same unknown across N samples → vote
                                 per-instance-unique unknown   → walker
```

**Empirical anchors · r33:**

```
connections cutover-3      stack-frame layout per-class-unique → INVERSION FALSIFIED
                           (i-connections-inversion-solve · sha 0fefcc32)
slot-data setText calls    per-instance-unique args → era-availability survey
                           (i-era-availability-survey)
cutover-2 LOAD-of-this     per-class member offset table · related shape
                           (i-cutover-2-load-thisptr-diffuse-back · sha bd02f473)
```

**Four-corner classifier** · choose extraction method by corpus shape:

```
diffusion-discovery   structured corpus + unknown taxonomy + crystallizable
cascade               known-tree-known-root (resolve top-down)
inversion             overlapping sources + SHARED unknown across instances
walker                per-instance-unique mechanical extraction (new IR verb)
```

**Test:** is the unknown the SAME across instances (DpI scale · window-size · color-token) or DIFFERENT per instance (this-class member offset · stack-local frame slot)? Same → inversion. Different → walker.

**§Streaming-refactor-discipline.** Streaming refactors must go END-TO-END. A thin String wrapper at any frame defeats the streaming benefit at the wrapper boundary — memory still accumulates the whole serialized subtree before the writer sees it.

```
half-streaming smell         per-PcodeOp record stores serialized String
                             of operand subtree → cross-function accumulation
                             OOMs at depth=16
true streaming               operand emitter writes tokens directly to the
                             output stream · no intermediate String holds the
                             subtree
```

**Empirical scar:** i-dumpir-streaming-refactor (sha f1c2d567) left `serializeOperand` as a String wrapper. OOM at depth=16 across long-tail function bodies. i-dumpir-true-streaming-function-body (sha 491b8f88) was the canonical fix — operand emission moved into the streaming writer; no String frame holds the subtree.

**Test:** trace the data path from generation to disk. Is there ANY frame that holds the whole serialized subtree as a String? If yes, streaming is half-done.

**§Sharded-output-architecture.** DumpIR-style preprocessor outputs MUST be sharded by top-level array — one file per concern. A monolithic JSON with all-arrays-inline defeats reader tooling at scale (jq dies; streaming loaders thrash).

```
monolith                   11 GB single JSON · jq fails · loader scans
                           260 GB cumulatively to answer one query
sharded                    14 shards · one per top-level concern · each
                           individually queryable · per-shard offset index
                           emitted by writer (functionBodies.index.json)
```

**Empirical anchors:**

```
i-dumpir-sharded-output-refactor    sha 26c9801c   14-shard layout
i-loader-offset-index-persist       sha 3bfaa778   inline index · MB-scale
                                                   read · avoids 260 GB scan
```

**Test:** can a reader answer "fetch function body for funcId X" with a constant-time disk seek (offset-index hit) instead of a full scan? If no, the index is missing.

**§Asymptote-confirmation-discipline.** Refines §Iterate-to-ceiling-then-diffuse-back. Asymptote tests are SCOPED — a narrow scope's asymptote is NOT a global asymptote. Honoring a scoped asymptote prematurely freezes diffusion against a boundary that's a scope artifact, not a knowledge artifact.

```
scoped asymptote     diffusion within type-lens scope plateaus → looks done
widen scope          run BROAD diffusion outside that scope at least once
                     before honoring the asymptote
result               r33 v4 BROAD found 2 high-impact emissions (RTTI ·
                     switch-tables) outside type-lens scope · the prior
                     asymptote was real-but-narrow
```

**Empirical anchors:**

```
i-ghidra-l0-asymptote-confirmation       ASYMPTOTE-CONFIRMED within type-lens
i-ghidra-v4-broad-non-type-lens-diffusion  K 3→5 · absorb C6 switch + C4 RTTI
                                          (sha 738296d1)
```

**Test:** when asymptote fires, widen the scope at least once before honoring it. The boundary may be a scope artifact, not a knowledge artifact.

**§LOAD-of-this-member.** Cutover-2's mechanism (LOAD-of-static-global, unblocked by .rdata bytes) covered 6% of setGeometry LOAD sites. The dominant Qt pattern — LOAD-of-this-member via PTRSUB(leaf:thisptr, const:offset) — covers 86%. .rdata bytes don't unblock object-member reads; object members need ctor-walking + member-init-tracking.

```
LOAD shape distribution      r33 sample · 100 setGeometry sites
  PTRSUB(thisptr, offset)     86% · this->m_member · ctor-write needed
  static global LOAD           6% · .rdata bytes resolves
  INT_ADD(LOAD,…) nested      ~7% · multi-hop indirection
```

**Empirical anchor:** i-pcode-eval-rerun-cutover-2-yield (sha 486c02ff) · falsifier tripped honestly at 6% yield · no forging. i-cutover-2-load-thisptr-diffuse-back (sha bd02f473) maps the subtype taxonomy and names 4 r34 carriers (ctor-write tracker · member-init lattice · this-pointer typing · cross-function member resolver). Doctrine for r34+ pcode-eval extension.

**§qt_static_metacall-as-slot-dispatch-table.** r33 switch-tables emission (i-switch-table-populator · sha 1c5991a9) revealed the top-3 highest-case-count switches are auto-generated `qt_static_metacall` functions: 98/33/31 cases for FnPgRovMk3/FnPgReplay/FnPgRov respectively. This IS Qt's signal/slot dispatch table.

```
finding          slot-resolution can walk qt_static_metacall switch tables
                 directly · NOT vtable analysis (E5-TS verification had
                 already flagged vtable-resolver as wrong-layer)
implication      r34 connection-walker carriers pivot · the substrate is
                 switch-tables not vtables · the case-index maps to slot
                 ordinal in moc-generated dispatch
```

**Test:** does the connection walker need to traverse vtable entries to find the slot? If yes, it's the wrong layer — qt_static_metacall is the moc-emitted dispatch table and contains the slot mapping directly.

**§Function-body-skip-guard-honest-residual.** The 28 pathological function bodies (top-1: 2.5 GB) needed honest-skip via `getFunctionBody({maxBytes})` returning null. Populators emit honest residual to `schema.pathological_function_bodies_skipped[]`, named by funcId. §Fail-hard discipline applied at the body-size boundary — NEVER silent-truncate, ALWAYS honest-residual with funcId named.

```
✗ silent truncate at maxBytes        rot · downstream sees partial tree
                                     · folds compute against half-data
✓ return null + named residual       populator emits funcId to schema
                                     residual list · downstream skips
                                     honestly · §RED-is-good-when-named
```

**Empirical anchor:** i-loader-too-large-skip-guard (sha a111ef93) · UNBLOCKER for pipeline-pass-6-rerun · 28 pathological bodies skipped honestly with funcId enumeration. The schema field IS the carrier manifest for r34's body-decomposition work.

## §Core-loop-fleet-anchor

Project-specific anchor for the universal `/core-loop` skill (full mechanism in `~/.claude/CLAUDE.md` §Core-loop). Fleet's terminal-upstream chain and empirical receipts are named here so every fleet-side RED knows where to walk.

**Fleet's upstream chain · descending freshness, ascending authority:**

```
populator output       model/output/hmi-schema.json
populator              pipeline/populators/*.ts
IR verb                model/ir/query.ts (15 verbs)
pcode fold             model/ir/pcode-eval.ts
IR snapshot            model/raw/ir-snapshot/latest.json (1.46 GB)
Ghidra lowering        ghidra_scripts/*.java (re-run only on binary bump)
─────────── above this line: TS-interpretable, fast ───────────
legacy syntactic probe ~/src/.dev/legacy-fusion-hmi/ + tree-sitter (§Legacy-syntactic-probes · ≤20/round · planning oracle only)
retrofit-era reference git tag retrofit-era-terminal · git checkout retrofit-era-terminal -- <path>
─────────── TERMINAL UPSTREAM ───────────
binary                 FUSION.exe + FUSION.pdb (the database · re-lowered only on version bump)
```

**Fleet RED triggers `/core-loop` whenever:**
- a populator-consume node lands schema=0 with mechanism unchanged across two passes
- a runtime-proof gate lands RED on a verified URL
- a pcode-eval fold ceiling fires (e.g. setGeometry 0% · §Operand-tree-eval)
- a three-way convergence verdict lands `all-disagree` or `predictor-gap`
- a populator's claimed lift is absent from `model/output/hmi-schema.json`

**r33 empirical evidence · the canonical anchor:**

```
cutover-2-load-global-seeding   asymptoted at narrow scope (window-size globals)
                                 mechanism-shift to LOAD-of-this-member proposed
                                 FALSIFIER tripped at cross-page generalization
                                 → moved upstream to legacy-grep
                                 qt_static_metacall finding emerged from terminal-
                                 upstream search (~/src/.dev/legacy-fusion-hmi)
                                 prior asymptote was a scope artifact · downstream
                                 reshape: connection walker rerouted off vtable
                                 onto moc-emitted dispatch table directly
```

The receipts: `i-cutover-2-load-global-seeding-audit` · `i-cutover-2-load-global-seeding-execute` · §Connection-walker-via-qt-static-metacall.

**Test before declaring fleet HONEST-RED:** did you grep `~/src/.dev/legacy-fusion-hmi/`? did you check `git checkout retrofit-era-terminal -- <path>` for prior shapes? did you query the IR snapshot for an alternative verb? if any "no", `/core-loop` is not yet exhausted.

Per §Doctrine-author-cannot-violate, this round (r33) does NOT cite §Core-loop to GBD any of its own gates — the doctrine becomes load-bearing once a successor round honors it without alibi.

## §Cross-page-sweep-fleet-anchor

Project-specific anchor for the universal `/cross-page-sweep` skill (full mechanism in `~/.claude/CLAUDE.md` §Cross-page-sweep). Cross-page-sweep is the HORIZONTAL sibling to /core-loop's VERTICAL — when stuck on a single page, sweep the corpus before pivoting upstream-by-layer.

**Fleet sweep substrate · 20 pages · 601 widgets · `model/output/hmi-schema.json`:**

```
mechanical probe         jq '.pages[] | .widgets[].archetype'
per-page enumeration     jq '.pages[].class_name'  (FnPg* roster)
per-archetype demand     archetype × pages-using × instance-count
existing components      packages/surface-console/src/components/archetypes-generated/
                         (32 .generated.vue files at r33)
```

**Pre-scorched-earth empirical anchors:** rounds r10 · r11 · r14 · r17 each ran corpus-wide sweeps when stuck on FnPgRov. Cross-page evidence is what justified retiring per-page emit (r28). The pattern was implicit doctrine pre-r33; this anchor crystallizes it.

**r33 anchor · cross-page archetype demand table** (`pipeline/generators/archetype-cross-page-demand.generated.json`): forensic sweep across 20 pages produced demand-ranked archetype priority for r34. Surfaced 'unknown' archetype as 14-page × 63-instance residual (highest classifier-extension lever, NOT visible from FnPgFiles alone). Falsified the FnPgFiles-derived hypothesis that Dropdown + Checkbox were cross-page (both 1-page only).

**Fleet sweep-or-not test:** stuck on a page-specific RED? before authoring a per-page fix, ask: "is this archetype on N other pages? does this fold-rule fail at K other sites? does this populator emit zero for M other classes?" If yes — sweep first. If the pattern is FnPg-specific, the deviation is FnPg-specific.

Per §Doctrine-author-cannot-violate, this round (r33) does NOT cite §Cross-page-sweep to GBD any of its own gates — the doctrine becomes load-bearing once r34 (or later) honors it without alibi.

## Discipline notes · r34 (LATE · gates closed at v-regression-gates-pass-7 sha e1533df1 · safe to elaborate)

**§Cluster-A-load-thisptr-protocol · LATE.** Resolver landed (`pcode-eval-thisptr.ts` · ctor.body STORE-walk seeds `EvalContext.knownThisMembers` · `LOAD(PTRSUB(thisptr,offset))` consults table). Empirical · subtype distribution falsified the r33 hypothesis that ctor-init dominates:

```
  subtype                         coverage    receipt
  A · ctor-init STORE             8% absolute · 9.3% of unresolved   i-load-thisptr-corpus-survey (sha 821572bf)
  D · caller-passed (dominant)    >60%        i-load-thisptr-corpus-survey  → r35 carrier
  site-yield from option-A only   6→14%       i-fold-rule-load-thisptr-ctor-init (sha 6546ab3e · GBD-r35)
```

Substrate landed contract-tested · live consume deferred (`EvalContext.knownThisMembers` not yet populated by any populator · `i-globals-inference-pass-4` sha 6b4c4bbc verified cascade unchanged). r35 owes the populator wire-up + caller-passed (subtype-D) handler. Honest-RED at the cutover-2 falsifier (30% threshold) · §RED-is-good-when-named · 4 named carriers (member-init lattice · this-ptr typing · caller-passed walker · cross-function member resolver).

**§Sender-pairing-walker-protocol · LATE.** Slot-side resolver crystallized via `qt_static_metacall` switch-walker — `i-switch-walker-corpus-build` confirmed at scale: **96.68% slots resolve via first-CALL-in-case-body · zero vtable analysis required**. The r33 finding (§qt_static_metacall-as-slot-dispatch-table) is now substrate.

Sender-side · `i-wiring-populator-consume-switch-walker` (sha 67cf5fb4 · GBD-r35) surfaced the empirical wall: **99.8% of FUSION's connect-tuples are connectImpl-style where slot is a `QSlotObjectBase*` pointer, not a slot_id integer**. The walker's slot_id corpus retains value for r35 SLOT-SIDE dispatch resolver (different layer · different unknown · §Inversion-three-prong-test: shared unknown is the slotObject->method lookup, not the slot_id). The carrier name "sender-pairing-walker" is preserved across the GBD per §Gate-premise-mismatch · r35 owes the QSlotObjectBase resolver.

**§Cluster-A-synchronous-Ghidra-rerun-protocol · LATE.** Protocol held empirically. r34 ran ONE Ghidra rerun (function-bodies cap raised + sqlite shard added) · `i-ghidra-functionbody-write-cap` + `i-functionbodies-storage-implementation` (sha a7b5f78e). No malformed snapshot · no opportunistic re-runs · falsifier untripped. Discipline sustained: synchronous nodes carried `dispatch_mode:"synchronous"` · Griffin in the loop · binary version unchanged.

**§Connections-inversion-application-pattern · LATE · FALSIFIED-AS-PREDICTED.** The third-corner inversion test FAILED at the §Inversion-three-prong-test (r33 doctrine): connect-tuple stack-frame layout is per-class-unique, NOT a shared unknown across instances. Cluster-B `i-wiring-populator-consume-switch-walker` 0/494 lift confirms the falsification empirically — the doctrine PREDICTED this before execution and the prediction held. The right method is the SLOT-SIDE `qt_static_metacall` walk (above) plus a r35 QSlotObjectBase resolver, not inversion. This is §Inversion-three-prong-test working as immune system.

## §Cluster-F-functionbodies-storage-architecture · r34

Function bodies (17953 · 11+ GB monolithic JSON · 5 pathological top-1 = 2.5 GB) promoted to sqlite shard with WAL + zlib-compressed BLOB + truncated-flag column. Receipts: `i-functionbodies-storage-architecture-decision` · `i-functionbodies-storage-implementation` (sha a7b5f78e) · `v-functionbodies-storage-validation`.

```
  schema       CREATE TABLE bodies(funcId INTEGER PRIMARY KEY,
                 body BLOB NOT NULL, original_bytes INTEGER NOT NULL,
                 truncated INTEGER NOT NULL DEFAULT 0) WITHOUT ROWID
               PRAGMA journal_mode=WAL · body=zlib(JSON)
  read         prepared SELECT body,truncated FROM bodies WHERE funcId=?
               · constant-time seek (vs r33 offset-index per-shard read)
  write-cap    serialized body > maxBytes → empty body + truncated=1 +
               original_bytes=N · §Function-body-skip-guard-honest-residual
               preserved · downstream queries truncated=1 to enumerate
  retired      NODE_MAX_STRING workaround + raw-fd-readSync paths DELETED
               same commit · §Fail-hard · §Meta-#8 PBR (consumer = fleet)
```

Five honest-truncated bodies surfaced through pipeline run · skip-surface API unchanged · slot-effects/wiring/visibility populators consume identically. The sqlite shard is the **15th shard** (extending §Sharded-output-architecture's 14-shard layout · body shard becomes a queryable cluster-of-its-own rather than a top-level array file).

## §Meta-pattern-validation-table · r33-tail predictions vs r34 evidence

Crystallizes which r33 LATE-doctrine bets paid out empirically in r34 — the immune-system check on doctrine landed mid-flight.

```
  doctrine (r33 LATE)                evidence in r34                   verdict
  ─────────────────────────────────────────────────────────────────────────────
  bh:class-18 IR-type-fidelity       i-class-18-scan-r34 (sha b47f3e3e) HELD
  per-handler typed contract         0 instances post-fix · 4/4 boundary
                                     tests stable · 1 false-positive on
                                     comment lines fixed in-round
  §Inversion-three-prong-test        i-wiring-populator-consume-switch- REINFORCED
  (shared-unknown prong required)    walker 0/494 · falsification of
                                     connect-tuple inversion as predicted
  §Streaming-refactor-discipline     sqlite cutover preserved streaming  HELD
  (true-streaming end-to-end)        heap invariant · no String frame
                                     holds full body · zlib at write boundary
  §Sharded-output-architecture       14-shard probe baseline 436ms        HELD
  (per-concern shards)               sustained · sqlite-fnbody added as
                                     15th shard · constant-time seek replaces
                                     offset-index read for the heaviest concern
  §qt_static_metacall-dispatch       i-switch-walker-corpus-build         HELD
  (slot-resolution via switch)       96.68% slots resolve · vtable-resolver
                                     correctly retired before authoring
  §Function-body-skip-guard-honest   5 truncated bodies enumerated by     HELD
  -residual                          funcId in sqlite truncated=1 column
                                     · downstream populators consume honestly
  §Iterate-to-ceiling-then-diffuse-  cutover-2 ceiling honored · 6→14%    HELD
  back                               option-A landed as scoped lift ·
                                     subtype-D (caller-passed) named r35
  §Era-as-dubious-source-inversion   r34 did not need fresh era inversion HELD-DORMANT
                                     · r33 cascade still load-bearing for
                                     parent_rects · §Meta-#8 PBR pending
                                     when binary-side dominance lands
```

Two doctrines reinforced (one falsified-as-predicted · one held under stress); six held without amendment; zero refuted. Doctrine-author cannot violate honored: every cited doctrine here was authored r33-or-earlier · the receipts and shas anchor this round to the prior standard.

## §Cross-page-archetype-extension-pattern · r34

`i-classifier-extend-fnpgfiles-archetypes` extended the archetype classifier to cover FnPgFiles cross-page archetypes (sourced from `archetype-cross-page-demand.generated.json` per §Cross-page-sweep-fleet-anchor). `i-button-icon-rendering-author` (sha d30eca17) closed 163/163 schema entries via populator-side mechanical mapping (60 member-names → 60 retrofit-era icons · committed TS lookup · §No-LLM-in-build-path) · zero stratum-repo changes (§Meta-#8 cross-repo n/a · §Generator-protocol cleanly applied · cheaper than generator-extend).

`i-fnpgfiles-converge-pass-2` (sha 235ca55e · GBD-r35) achieved recognizable-skeleton via pure pipeline lift · zero authored deviations · 3 NonVisual unbound errors named honest residual. `v-fnpgfiles-canary-pass-2` (sha 973589fc) honored §Validator-must-open-the-console (assay --capture-console) and §Brief-template-render-verify (data-page=FnPgFiles asserted before gates). Cross-page-sweep working as anchored: archetypes ranked by demand, FnPgFiles converged via cross-page primitives, no per-page deviation owed.

## Discipline notes · r35 (LATE · gates closed at v-schema-populates-pass-8 sha 12ccc6d4 + v-connections-dom-pass-3 sha 74b4906f + v-cutover-2-yield-pass-3 sha 910da436 · safe to elaborate)

**§Populator-wire-LIFT-WIRE-PROVE-canonical · LATE.** Sibling to §Populator-consume-protocol and §Schema-runtime-contract-loop. Three-step cadence — substrate-LIFT (fold-rule contract-green) · populator-WIRE (context-builder threaded into `EvalContext`) · downstream-PROVE (schema delta verified by independent validator). r35 cluster-A is the canonical instance AND the canonical scar: `i-populator-wire-known-this-members` (sha 3d1c6d29 = 8a849fa5 in log) wired `buildPageThisMembers` into `structural.ts` claiming +51 widgets across 5 pages (Auv 12 · Diver 13 · FilesDw 9 · Mission 15 · Slides 2). `v-schema-populates-pass-8` (sha 12ccc6d4) opened the schema, counted, and FALSIFIED: actual per-page `{Auv:0, Diver:1, FilesDw:0, Mission:0, Slides:0}` · total 1, not 51. The wire executed; the substrate consumed; the cascade dominant-source already absorbed by `icon-png-bundle-geometry` (sha 21154188 · 88 widgets) at higher leaf-priority. Lift was real but per-page attribution was claimed against the wrong leaf.

```
LIFT     fold-rule contract-green at site-yield N%
WIRE     populator threads buildContext(...) into EvalContext
         §Goldilocks (handler ≤250 LOC) · §Fail-hard (honest skip on empty)
PROVE    independent validator opens schema · counts per-page delta
         CLAIM = ACTUAL  → GREEN · CLAIM ≠ ACTUAL → §Handoff-vs-commit-validator
```

§Handoff-vs-commit-validator-tightening (r31's §Handoff-vs-commit refined): per-page receipt fields claiming widget-count deltas MUST be cross-checked by a downstream validator opening the actual schema — narrative receipt of "lifted N widgets" is forged-progress until counted. r35 v-schema-populates-pass-8 caught five clean (icon-png · cluster-B emit · visibility-port · predicate-evaluator · caller-walker substrate-only) and one falsified (cluster-A wire · per-page attribution). The validator is the seal.

**§Sender-pairing-walker-protocol-elaboration · LATE.** Cluster-B closure. Walker (not inversion) confirmed correct method; the falsified r33 §Connections-inversion-application-pattern preanchor was retired at `i-cluster-B-via-ir-metaobject-attempt` (sha 1eb20759) — IR-verb-first attempt FAILED AS PREDICTED · 50 tuples extracted · 0 DOM candidates · the unknown is per-class-unique stack-frame QSlotObjectBase wrapping, not a metaObject lookup. Walker corpus build `i-sender-pairing-walker-corpus-build` (sha e6b7f475) extracted 313 records · 311 connectImpl-style · 246/313 (78.6%) signal-member resolved · 10/10 page-owner classes covered · 22.3s wall. Emit `i-sender-pairing-walker-emit` (sha c481ce34) landed 32 connections / 7 pages. DOM verification `v-connections-dom-pass-3` (sha 74b4906f) green on 5 pages (Auv 8 · Diver 8 · Slides 5 · Support 4 · Home 3 · 28 attrs total · zero console errors).

```
falsified preanchor          r33 §Connections-inversion-application-pattern
                              third-prong (shared-unknown) FAILED at FnPgRov
                              0/494 · stack-frame layout per-class-unique
walker confirmed              r35 cluster-B 32→28-DOM across 5 pages · cross-page
                              corroboration (§Cross-page-sweep) carries the gate
FnPgRov GBD-r36               single-tuple unresolved-signal at non-ctor binding
                              site · /core-loop terminal-upstream is the
                              FnPgRov::OnConnection function body itself
```

**§Substrate-survives-extractors-die · LATE.** r34-tail discovery promoted to load-bearing. r28's scorched-earth retirement deleted the 20-step retrofit pipeline (46,940 LOC) BUT preserved the IR substrate (`model/ir/query.ts` 15-verb grid + `model/raw/ir-snapshot/latest.json`) AND the git tag `retrofit-era-terminal` (sha 531991a6). r35 proved the discipline empirically — three retrofit-era extractors ported via `git checkout retrofit-era-terminal -- <path>` instead of re-authored:

```
visibility-port  i-visibility-extractor-port-from-retrofit-era    462 LOC port · 350
                  emit-conditional-visibility-graph.ts → conditional-visibility-graph.json
                  92 setVisible call-sites · 57 guarded · 36 owner+member resolved
                  12 perMember entries with non-empty visibleWhen/hiddenWhen across 6 pages
three-way-diff   i-three-way-diff-port-from-retrofit-era         triangulation-report.ts
                  predictor + topology + screenshot · five-verdict matrix preserved
                  honest-by-construction guard intact · zero shape changes
page-viewer      i-page-viewer-restore-from-retrofit-era         217 LOC port · 169 adapt
                  StagingViewer sidebar nav + arrow keys · 24 pages navigable
```

Cheaper than re-authoring · zero invented bugs · adaptation-only delta. Test before authoring any new extractor: `git log --all --diff-filter=D --name-only | grep <pattern>` and `git checkout retrofit-era-terminal -- <path>`. The substrate that survived deletion is canonical; the deleted extractors are recoverable.

Pairs with the r35 IR-verb-first attempt that DIDN'T find its substrate (cluster-B-via-ir-metaobject) — the discipline is "look first, build second," not "ports always work."

**§Resource-bundle-as-extraction-oracle · LATE.** Promoted from preanchor on the strength of one HELD application; load-bearing-pending-r36-second-app per /core-loop's two-instance rule. Compile-time-bundled assets (icon PNGs · `.qrc` manifests · `.qss` stylesheets · `.qm` translations) carry STRUCTURAL information mechanically-extractable per §Three-non-negotiables (no opinion formed · pure manifest read).

```
1st application · r35 · HELD     i-icon-png-geometry-leaf (sha 21154188)
  281 icons total · 46 referenced in schema · 0 skipped
  buttons-with-geometry  75 → 163 · +88 widgets across 14 pages
  schema widgets total geometry  287 → 375 (+88) · +12.4pp absolute
  GeometrySource enum extended · 'icon-png-bundle-geometry' · zod-green
  honest caveats: origin sentinel (0,0) · BUTTON_PADDING=8px mechanical default
  size-only confidence='partial' · per-class refinement → r36
```

Enriches §Three-way convergence as a FOURTH oracle alongside predictor/topology/screenshot. Bundle-leaves only fire when prior cascade leaves return null (§Iterate-to-ceiling pattern · no overwrite · disagreement undefined). Test for second application — does `.qrc` manifest seed slot-effect resource binding? does `.qm` translation table seed string-slot population? Answer in r36; doctrine becomes fully load-bearing once N=2 holds.

**§Underused-IR-verb-audit · LATE.** Forensic discipline pairing with §Substrate-survives-extractors-die. Mechanical audit before authoring any new walker / extractor / generator. r35 anchor: `i-retrofit-era-extractor-survey` (sha a40934dd) ran the audit AND verified `ir.callsTo` + `ir.qtTypeOf` are zero-call-site verbs despite obvious applicability — substrate left on the table, routed to r36 carriers (caller-passed-walker uses `ir.callsTo`; type-resolution uses `ir.qtTypeOf`). The same survey killed 21 retrofit-era extractors as SUPERSEDED-IR (their work absorbed by query-grid verbs) and absorbed 9 into existing r35 DAG nodes — the verb-grid IS the doctrine of last decade's extractor work crystallized.

```
audit one-liner    grep -rh "ir\.\w\+(" pipeline/ model/bin/ | \
                   awk '{match($0,/ir\.[a-zA-Z]+/); print substr($0,RSTART,RLENGTH)}' | \
                   sort | uniq -c | sort -n
verdict per verb   0 calls · obvious applicability  → SUBSTRATE-ON-TABLE · carrier
                   0 calls · niche                   → preserved-but-dormant
                   1 call  · single page             → suspect; cross-page-sweep
                   N≥3                                → load-bearing
```

## §Three-corner-classifier · r33 promoted to load-bearing · two empirical anchors

Promoted from r33 discipline note to crystallized doctrine on the strength of TWO instances now (one falsification · one verdict-affirmation). Use this classifier to PICK extraction method by corpus shape — the meta-controller for §Diffusion-discovery / §Cascade / §Inversion / WALKER:

```
diffusion-discovery   structured corpus + unknown taxonomy + crystallizable
cascade               known-tree-known-root (resolve top-down)
inversion             overlapping sources + SHARED-UNKNOWN-VALUE across N instances
walker                per-instance-unique mechanical extraction (new IR verb)
```

**Two empirical anchors:**

```
r33 connections-inversion         FALSIFIED at i-connections-inversion-solve
                                  shared-unknown prong absent · stack-frame
                                  per-class-unique · classifier said WALKER ·
                                  r34 i-wiring-populator-consume-switch-walker
                                  0/494 confirmed · classifier was right

r35 caller-passed-LOAD            VERDICT-WALKER at
                                  i-load-resolver-caller-passed-classify (sha 4dfbaf61)
                                  39/44 share offset 0xf0 (offset prong holds) BUT
                                  per-instance VALUE distinct (per-page rect) ·
                                  inversion's third prong fails · classifier said
                                  WALKER · i-load-resolver-caller-passed-implement
                                  (sha 41206f54) executed walker · honest-RED 0%
                                  yield · r36 carrier owns array-indexed-PTRADD
                                  STORE-shape · classifier was right ABOUT METHOD
                                  even when the walker yielded zero — wrong METHOD
                                  would have wasted more time
```

**§Inversion-three-prong-test refinement:** the third prong (consensus-poolable shared unknown) requires that the SHAPE-prong (offset · structural relation) AND the VALUE-prong (the resolvable scalar) BOTH be shared across instances. r35 caller-passed scenario passes shape-prong (0xf0 dominant) and fails value-prong (per-page rect). Both prongs apply to LOAD AND STORE corpora — i-load-resolver-caller-passed-implement (sha 41206f54) confirmed STORE-walk with shared shape but distinct values is still a WALKER problem, not an INVERSION problem. The classifier is NOT a tie-breaker; it's a fast-fail before authoring.

## §Meta-pattern-validation-table · r33-r34 predictions vs r35 evidence

Continuation of r34's table · same shape · §Doctrine-author-cannot-violate honored (every cited doctrine authored r33-or-r34 · r35-authored sections elsewhere are pure forward signal).

```
  doctrine                            evidence in r35                       verdict
  ──────────────────────────────────────────────────────────────────────────────
  §Inversion-three-prong-test         caller-passed VERDICT-WALKER          REINFORCED
  (r33)                               classifier rejected inversion before
                                      authoring · saved time · per-instance
                                      value distinction confirmed at sha
                                      4dfbaf61 + 41206f54
  §Substrate-survives-extractors-die  3 retrofit-era ports succeeded at     HELD
  (r34-tail)                          tag retrofit-era-terminal · vis +
                                      three-way-diff + page-viewer · zero
                                      shape changes
  §Underused-IR-verb-audit            i-retrofit-era-extractor-survey       HELD
  (r34-tail)                          (sha a40934dd) · 50 surveyed · 21
                                      dead · 7 r36 carriers via ir.callsTo
                                      + ir.qtTypeOf · 9 absorbed
  §Connections-inversion-application  cluster-B-via-ir-metaobject FAILED    FALSIFIED-AS
  (r33 PREANCHOR)                     AS PREDICTED at sha 1eb20759 · 50     -PREDICTED
                                      tuples · 0 DOM · walker re-confirmed
                                      load-bearing
  §Handoff-vs-commit (r31)            v-schema-populates-pass-8 caught      REINFORCED
                                      cluster-A wire's per-page claim ≠
                                      schema (claim 51 · actual 1)
                                      validator is the seal · narrative
                                      receipt is forged-progress
  §Iterate-to-ceiling-then-diffuse    cutover-2 yield 14% sustained ·        HELD
  -back (r32)                         array-indexed-PTRADD STORE-shape
                                      named as r36 carrier · plateau honest
  §Cross-page-sweep-fleet-anchor      cluster-B 5-page DOM corroboration     HELD
  (r33)                               · FnPgRov GBD-r36 (single-instance
                                      hypothesis vs corpus evidence)
  §Resource-bundle-as-extraction-     icon-PNG leaf 1st application HELD     HELD-PENDING
  oracle (r35 LATE)                   (88 widgets / 14 pages) · second app  -SECOND-APP
                                      (.qrc / .qm) → r36 to harden N=2
  §Validator-must-open-the-console    v-connections-dom-pass-3 captured     HELD
  (r32)                               console errors=0 across 5 pages
                                      via assay --capture-console
  §Brief-template-render-verify       data-page asserted before gates on    HELD
  (r31)                               every render-adjacent r35 receipt
  §Doctrine-author-cannot-violate     all 5 r35 PREANCHOR sections marked   HELD
  (r31)                               · zero r35 gate cited r35-authored
                                      doctrine for GBD · LATE elaboration
                                      lands AFTER closing gates
  §Goldilocks-size                    pcode-eval-thisptr.ts 143→241 LOC ·   HELD
  (project-CLAUDE.md)                 structural.ts 416→440 LOC · within
                                      sweet zone post caller-walker land
```

Eleven doctrines tested · ten HELD · one HELD-pending-second-application · zero refuted · two reinforced · one falsified-as-predicted (working as immune system per §Three-corner-classifier). r35's primary scar is §Handoff-vs-commit-validator-tightening — the receipt narrative diverged from schema reality on one of six lifts; the validator caught it; the doctrine survives strengthened.

## Discipline notes · r36 (PREANCHOR · forward-declarations only · §Doctrine-author-cannot-violate)

**§Array-indexed-PTRADD-store-handler.** PREANCHOR · r36 forward-declaration · light. Sibling: §Cluster-A-load-thisptr-protocol. Cluster-A r36 anchor — caller-passed STORE-shape r35 named (`i-load-resolver-caller-passed-implement` sha 41206f54 · 0% yield) routes here as array-indexed-PTRADD STORE leaf authoring · consumes r35 caller-walker substrate via §Populator-wire-LIFT-WIRE-PROVE-canonical cadence.
Full elaboration at r36 LATE doctrine (after Cluster-A executes · NOT before).

**§Extractor-restoration-IR-grounded-protocol.** PREANCHOR · r36 forward-declaration · light. Sibling: §Substrate-survives-extractors-die · §Underused-IR-verb-audit. Cluster-EXT r36 anchor — r35 audit (`i-retrofit-era-extractor-survey` sha a40934dd) routed 7 extractors to r36 carriers via `ir.callsTo` + `ir.qtTypeOf`. Protocol formalizes IR-grounded restoration over re-authoring · `git checkout retrofit-era-terminal -- <path>` first · adapt to query-grid second.
Full elaboration at r36 LATE doctrine (after Cluster-EXT executes · NOT before).

**§Trampoline-vtable-terminal-upstream-walk.** PREANCHOR · r36 forward-declaration · light. Sibling: §Sender-pairing-walker-protocol-elaboration · §Core-loop-fleet-anchor. Cluster-B r36 anchor — FnPgRov GBD-r36 single-tuple unresolved-signal at non-ctor binding site routes here · /core-loop terminal-upstream is the FnPgRov::OnConnection function body itself · vtable trampoline walk preserved as honest method-of-last-resort despite r33 retire of vtable-resolver as wrong-layer for slot-side dispatch.
Full elaboration at r36 LATE doctrine (after Cluster-B executes · NOT before).

---

## Deep doctrine sections lifted from CLAUDE.md head

### §IR-type-fidelity-loss-at-boundary · bh:class-18

## §IR-type-fidelity-loss-at-boundary · bh:class-18

Bug class promoted from r32 evidence. Binary encodes values with SPECIFIC type lenses (float64 IEEE-754 · signed int32 · pointer · uint16 · enum · bit-packed flags). IR snapshot stores raw bits. TS interpreter must apply the right lens. **Wrong lens = computation succeeds, no exception, silent nonsense propagates downstream**. Only visible when an INDEPENDENT ORACLE (era observation · screenshot · canary visual) contradicts.

**r32 instances · 4 known · all fixed at sha 5d531605 (pcode-uint64-fix) + cutover-3 audit:**

```
  1  FLOAT_* uint64 IEEE-754 bits read as JS number → 1e20 overflow
     evalFloatArith treated raw uint64 as plain Number · m_style cascade
     produced 4.6e20 instead of 150 · fixed via uint64BitsToDouble (DataView).
  2  negative int32 zero-extended to uint32 → wrong sign in arithmetic
     evalArith treated 4294967293 as positive · should be -3 · fixed via
     asSignedInt32 helper.
  3  connection-key pointer offsets (this+8) treated as integer addends
     wiring.ts emit walked the operand tree and stored the OFFSET literal
     instead of resolving offset → member name · cutover-3 surfaced this
     as honest 144→0 collapse · routed to r33 walker.
  4  setGeometry coords folded as int32 when binary uses uint64
     same family · adjacent · landed in same uint64 fix.
```

**13 candidate shapes · likely future instances · CI-detector should hunt:**

```
   5  endianness swap on multi-byte LOADs
   6  sign-magnitude vs two's-complement on legacy ints
   7  padding bytes counted as data in struct walks
   8  alignment quirks shifting field offsets
   9  ASCII length vs UTF-16 length on Qt strings
  10  32-bit vs 64-bit pointer width on enum decay
  11  bit-field unpacking treated as adjacent-int
  12  C-string null-terminator vs Pascal-style length-prefix
  13  Q_FLAGS bit-or-encoded enums treated as raw int
  14  IEEE-754 FLOAT_NAN sentinel folded as numeric value
  15  PTRDIFF computed across stack vs heap regions silently
  16  size_t (uintptr_t) on 32-bit binary read as 64-bit
  17  uchar promoted to int with sign-extension on negative chars
```

**Detector contract · mechanical · CI-gateable:**

```
  pre-condition  pcode-eval.ts · query.ts · any handler that consumes
                 raw IR fields (LOAD result · operand value · member field)
  scan           grep for `as number` casts on raw IR values
                 grep for arithmetic on un-type-checked LOAD results
                 enumerate handlers · per-handler must declare expected
                 input type AND assert at boundary
  per-handler    test with boundary values: negative · NaN · MAX_UINT64 ·
                 pointer-arithmetic literal · sentinel
  baseline       model/output/bug-reports/class-18-ir-type-fidelity.json
  CI rule        per-class count must not EXCEED frozen baseline (regression
                 gate · §Bug-hunt-as-regression-gate)
```

**Resolution pattern · per-handler typed-input contract:**

```
  every pcode-eval handler   declares input type explicitly (uint32 ·
                             int32 · uint64 · float64 · pointer · enum)
  IR snapshot field-fetcher  applies the lens at the boundary · returns
                             typed value · never raw bits
  never                      `as number` on raw IR field
  never                      arithmetic on values whose type isn't asserted
  on unknown type            throw with diagnostic · §Fail-hard · the
                             extraction is honest UNRESOLVABLE not silent
                             garbage.
```

**Why class-18 not class-1-EXTRACTION-REGEX:** EXTRACTION-REGEX is about MOC/string parsing missing patterns. IR-TYPE-FIDELITY is about correctly-extracted bits being misinterpreted at the type boundary. Different class · different detector · different fix shape.

**Anti-pattern:** "the math works for the simple case · ship it." If the handler doesn't fail on uint64 boundary OR negative-int OR pointer-as-int, it's silently broken for the cases that matter.


### §Diffusion-pass-typology + §Diffusion-discovery-pattern

## §Diffusion-pass-typology

Diffusion is not one operation · it is a FAMILY of cognitive operations with different I/O contracts and success metrics. r29 + r31 + r32 ran 8+ diffusions ad-hoc · each invented its own brief shape · receipts couldn't be compared because the metric was implicit. Naming the types makes them composable.

**Eight pass types · enumerated:**

```
  type            input                       output                 metric
  ──────────────────────────────────────────────────────────────────────────────
  BROAD           corpus chunks · Qt prior    per-N response chunks  yield_high_conf_pct
  RESIDUAL        previous-pass unknowns      refined responses      lift_vs_broad_pp
  HARD-RESIDUAL   still-unknowns post-N       tail responses         asymptote_flag
  MULTIMODAL      responses + PNG read        visual-grounded        visual_match_audit
  GROUNDED        responses + 2nd corpus      cross-cited responses  cross_source_pct
                  (era · retrofit · IR · etc)
  DIFFUSE-BACK    residuals (post-ceiling)    carrier manifest +     residuals_classified
                                              next-method per category
  EMIT            aggregated responses        committed .generated   pr_review_diff_loc
  INVERSION       known + symbolic expr       seeded unknowns        consensus + sanity
```

**Naming convention · `i-<corpus>-diffuse-<type>-pass-N`:**

```
  i-archetype-classifier-diffuse-broad-pass-1     r29 first crystallization
  i-pcode-shape-classifier-diffuse-residual-pass-2 r31 second
  i-component-generator-diffuse-multimodal-pass-2  r32 visual grounding
  i-component-generator-diffuse-grounded-pass-4    r32 retrofit-grounded
  i-globals-inference-diffuse-inversion-pass-1     r32 cascade · the cheat
  i-geometry-residual-diffuse-back                 r32 strategy/tactics survey
```

**Per-type receipt-slot template:**

```
  every diffusion receipt    chunk_count · pass_type · prev_pass_ref?
  + per-type metric          from table above
  + zero_doctrine_violations §No-LLM-in-build-path + §Dumb-components
  + honest_unknown_count     §Three-non-negotiables preserved
  + carrier_manifest         r33+ named successors
```

**Why typing matters now:** ad-hoc diffusions look identical at the brief level (read corpus · classify · emit) but have different SUCCESS SHAPES. A BROAD-pass at 60% yield is great; a MULTIMODAL-pass at 60% is regression vs the broad it refined. Without the typology, agents and reviewers can't tell.

**Future skill candidate · `/diffusion-spec <type>`** generates a brief template (chunk size · I/O · success metric · falsifier · receipt fields). Successor rounds spec against typology not narrative.

## §Diffusion-discovery-pattern

META rule · two-crystallization proven. When an unknown taxonomy lives in a structured corpus, run multi-pass diffusion to discover it, crystallize the result as a committed `.generated.ts`, then hand-author a thin TS layer that consumes the discovered taxonomy. r29 archetype-classifier proved the pattern once; r31 pcode-shape-classifier proved it twice. Two crystallizations is what lifts this from "trick that worked" to load-bearing doctrine.

**Template · five steps:**

```
  1. SCAFFOLD CORPUS         enumerate the structured input slice
                             (IR query · grep oracle · etc · §Legacy-syntactic-probes)
  2. MULTI-PASS DIFFUSE      pass-1 broad · pass-2 residual · pass-3 hard residual
                             agent reads chunk manifest · writes response chunk
                             (§Chunk-level-LLM · §Entropy-flow-diffusion)
  3. EMIT .generated.ts      committed TS lookup table · confidence-scored ·
                             honest "unknown" entries preserved as residuals
  4. HAND-AUTHOR THIN LAYER  populator / fold-rule / dispatcher consumes the
                             generated taxonomy · enumerated cases · no ad-hoc
  5. RE-MEASURE YIELD        empirical lift on real corpus · §Populator-consume
                             · gates honest-RED when ceilings hit
```

**Applicability test · all three required:**

```
1. structured corpus     enumerable (IR slice · operand-tree set · symbol list)
2. unknown taxonomy      no prior schema · counting alone insufficient
3. crystallizable        labels expressible as committed TS lookup
                         (vs. requiring runtime reasoning · which would leak
                          into build path · §No-LLM-in-build-path)
```

**Empirical anchors · two crystallizations:**

```
                   r29 archetype-classifier   r31 pcode-shape-classifier
  corpus           442 widget types            2628 operand trees
                                               (893 setGeometry sites · ×n trees)
  passes           3 (broad · residual · hard) 3 (broad · residual · hard)
  curve            86.8 → 99.32 → 100.0%       62.29 → 71.31% cumulative high
  labels           ~40 archetype names         13 shape labels
  consumer         declarative.ts populator    pcode-eval.ts fold rules (5)
  verdict          HELD                        HELD-with-named-ceiling
```

If the test fails any clause, the corpus wants a different tool: pure IR verb (clause 2 fails) · runtime classifier (clause 3 fails) · MOC walk (clause 1 fails). Diffusion-discovery is reserved for the intersection.


### §Component-generator-protocol + §Populator-consume-protocol + §Generator-protocol

## §Component-generator-protocol

THIRD application of §Diffusion-discovery-pattern · the doctrine that lifts the pattern from "trick that worked twice" to load-bearing. Components are GENERATED, not hand-authored.

```
  three crystallizations · canonical artifacts
    r29   pipeline/generators/archetype-classifier.generated.ts      442 entries · 13 labels
    r31   pipeline/generators/pcode-shape-classifier.generated.ts   2628 entries · 13 labels · 71.31%
    r32   packages/surface-console/src/components/archetypes-generated/*.generated.vue   32 components
```

**Cadence · pass-1→pass-4 · same shape across all three:**

```
  pass-1 broad         high-entropy · Qt-prior ride · per-archetype + per-class scaffold
  pass-2 multimodal    medium-entropy · legacy PNGs read multimodally + retrofit-era exemplars mined
  pass-3 emit          low-entropy · committed .generated.vue · template-only · zero <script setup> logic
  pass-4 retrofit-grounded   integration regen · cross-page consistency · stratum sha deca5a9a
```

**Retrofit-era-corpus mining + IR-provenance-join pattern (r32 innovation):**

```
  inputs           git tag retrofit-era-terminal  ~48k-LOC era components mined as design EXEMPLARS
                   docs/design/legacy-reference/*.png  visual ground truth per archetype
                   archetype-classifier.generated.ts   canonical archetype names
                   stratum/docs/design-system.json     13 hardFailures · CI-enforced visual tokens
                   model/output/hmi-schema.json        widget shape (props derive from real schema)

  output           per-archetype .generated.vue · props in · events out · zero inject · zero useSessionContext
                   committed source-of-record · review surface = PR diff line-by-line
```

**Empirical anchors · r32 receipts:**

```
  i-component-generator-corpus-scaffold        retrofit-era + IR provenance joined
  i-component-generator-diffuse-pass-1-broad   100% high-conf scaffold
  i-component-generator-diffuse-pass-2-multimodal   legacy-PNG read + design-token grounding
  i-component-generator-diffuse-pass-3-emit    32 components · stratum sha f0c31d88
  i-component-generator-pass-4-retrofit-grounded   stratum sha deca5a9a
  i-component-canary-mount-button-pass-3       14 buttons · honest browser console · PASS
```

**Build path stays LLM-free** (§No-LLM-in-build-path reinforced). Diffusion runs at AUTHORING in chat sessions (§Chunk-level-LLM); populators and runtime touch no model.

**Test:** can a teammate with no API key run `npm run build` end-to-end against the binary AND get the rendered components? Yes → protocol holds.

## §Populator-consume-protocol

Substrate landing alone is NOT done. **Populator consumption is the empirical-lift proof point** — until a populator reads the substrate and `model/output/hmi-schema.json` shifts measurably, the substrate is dead weight. The r30 round empirically surfaced this: an IR verb can be 14/14 contract-test green and still yield 0% downstream lift if no populator consumes it.

**Wiring contract · four hops, each must shift:**

```
  substrate (.generated.ts | IR verb)        layer-1 · authoring
       │                                     test: unit-green on real IR
       ▼
  populator (pipeline/populators/*.ts)       layer-2 · consume + emit
       │                                     test: schema field count > 0
       ▼
  model/output/hmi-schema.json               canonical DB
       │                                     test: zod-green · field present
       ▼
  HmiRuntime.vue dispatch + DOM attribute    layer-3 · runtime (§Schema-runtime-contract)
                                             test: assay probe sees attribute
```

**r30 canonical evidence · two outcomes:**

```
connections   ir.connectsOf walker → wiring.ts → schema.connections=144
              FnPgRov 0 → 20 (global 0 → 144 · 102 unique signals)
              receipt: i-populator-consume-connections.json (sha ec4092f0)
              verdict: GREEN · empirical lift proven end-to-end

geometry      pcode-eval const-prop → structural.ts → schema.geometry=0
              FnPgRov 0/45 widgets resolved · honest 0% (§RED-is-good-when-named)
              receipt: i-populator-consume-geometry.json (sha a48843cc)
              verdict: GBD-r31 · fold ceiling at LOAD-of-window-size · named carrier
```

Connections lifted because the verb's signal was statically resolvable from operand trees alone. Geometry didn't because `setGeometry` sites LOAD window-size globals — fold ceiling honest, not forged. Both outcomes are correct for r30; the difference IS the signal.

**Meta-#8 cross-repo dimension** (see also §Meta-#8-cross-repo): populator-side dominance must be proven AND consumer-side (sibling repos like stratum) must accept BEFORE any hand-rule retirement. The consumer is the dominance test, not the producer. PBR spans the wire.

**Falsification trap · §Schema-runtime-contract-gap:** schema lift ≠ DOM lift. r30 emitted 54 connections; DOM had 0 `data-connection-target` attributes. Populator-consume gates that stop at schema-write are blind to the runtime-side dispatch wiring. Every populator-consume node owes a DOM-attribute gate (or names the runtime carrier owning it). r31 inherits the runtime-side dispatch wiring as named work.


### §Operand-tree-eval + §Pcode-shape-classifier + §Schema-runtime-contract + §Schema-runtime-contract-loop

## §Operand-tree-eval

Const-propagation fold over IR pcode operand trees · `model/ir/pcode-eval.ts` (194 LOC · 14/14 contract tests green · sha f269ccc1). Canonicalizes opcode chains into resolved scalar operands before populators read them.

**Fold rules · enumerated, each anchored to a real operand-tree shape in `model/raw/ir-snapshot/latest.json`:**

```
INT_ADD(const, const)        → const-int (sum)
INT_SUB(const, const)        → const-int (diff)
INT_SDIV(const, const)       → const-int (canonical DpI half: 1920→960 · 1080→540)
INT_MULT(const, const)       → const-int (product)
LOAD(global-const-addr)      → const-int  (only when knownGlobals seeds the addr)
PTRSUB(receiver, offset)     → resolved receiver (member-access folding)
any other / unseeded LOAD    → unresolved (honest · §Three non-negotiables)
```

**Kind taxonomy · returned by `evalRect` / `evalBool`:**

```
const-int    statically resolved scalar
const-size   resolved {w,h} pair (DpI-style canonical)
expression   partial fold · symbolic remainder
unresolved   tree did not fold · NEVER guessed default · NEVER fabricated coord
```

Honest `unresolved` is the correct kind when LOAD globals are unseeded — populator consumers OMIT the field rather than emit a fabricated rect (§Three non-negotiables · the "no opinion" test).

**r30 empirical · fold ceiling measured against real corpus:**

```
                sampled    folded    pct      gate (≥)    verdict
setVisible      201        114       56.7%    50%         GREEN
setGeometry     100          0        0.0%    30%         RED-named
DpI canonical   14         14       100.0%    n/a         contract green
```

`setGeometry` 0% is honest-RED, not regression: FUSION's setGeometry sites LOAD window-size globals whose values aren't statically resolvable without a global-constants seed table. r31 carrier `r31-load-inference-deeper` owns extending `EvalContext.knownGlobals` seeding (or landing a window-size resolver verb that populates the table from binary metadata). §RED-is-good-when-named applies — gate is named, scoped, routable.

**Three-way convergence applies** (§Three-way convergence): predictor output from operand-tree-eval is honest `unresolvable[]` when a tree doesn't fold, never a guessed integer. The fold ceiling IS the predictor-gap signal.

## §Pcode-shape-classifier

Specific application of §Diffusion-discovery-pattern to the operand-tree corpus. r31 emit: `pipeline/generators/pcode-shape-classifier.generated.ts` · 2628 entries · 13 labels · 71.31% cumulative-high after 3 passes. Curve 62.29 → ~67 → 71.31% (HELD · monotone improving · §Convergence-curve-empirical).

**Top-6 patterns · r31 distribution:**

```
                                  count   %       fold-rule landed?
  dpi-scaled-const                859    32.7%   YES · INT_SDIV(const,2)
  dpi-arithmetic-mix              348    13.2%   YES · INT_ADD(scaled,scaled)
  unknown-ambiguous               312    11.9%   no · honest residual · r32
  float-truncated-scale           260     9.9%   YES · FLOAT_TRUNC(MULT)
  parent-anchored-offset          191     7.3%   YES · PTRSUB+offset
  parent-anchored-fraction        160     6.1%   YES · INT_MULT(member,frac)
  ── top-5 covered by 5 handlers · 81.2% of corpus ──
  remaining 7 labels              498    19.0%   r32 carriers
```

**Fold-rules-author cap · top-5 only · rationale:**

```
  §Goldilocks-size      pcode-eval.ts at 350 LOC · 5 handlers · 26/26 tests green
                        adding 7 more handlers blows past 600 LOC ceiling
  pass-3+ patterns      19% tail is r32 work · diffusion-discovery cadence
                        (§Multi-pass-diffusion-to-fidelity)
  yield-vs-loc          top-5 covers 81.2% with 350 LOC · marginal handler
                        beyond that yields <2% per LOC-block · violates
                        §Goldilocks-size cohesion test
```

**Ceiling discussion · two stacked carriers · honest-RED:**

```
  6% sample probe     v-fold-rules-yield · setGeometry sites
                      83/100 sites unresolved due to LOAD-global-unseeded
                      (window-size globals · no knownGlobals seed table)
                      → r32 carrier · load-inference-deeper

  query.ts WIRING-CEILING   geometry populator-consume re-run yielded 0/45
                      because ir.geometryOf walker hits LOAD-unseeded
                      AND walker's call-site filter excludes setGeometry
                      reachable through helper indirection
                      → r32 carrier · query-wiring-deeper
```

Both ceilings are NAMED · ROUTED · §RED-is-good-when-named applies. The 5 fold rules + 13 labels + 71.31% high are honest substrate; the unresolved tail is an enumerated successor manifest, not forged green.

## §Schema-runtime-contract

Schema lift does NOT automatically appear in DOM. Every new schema field requires explicit dispatch in `stratum/HmiRuntime.vue` to land as a DOM attribute. r30 surfaced this empirically: pipeline emitted 54 connections into `model/output/hmi-schema.json`, DOM had **0** `data-connection-target` attributes when the runtime probe ran. Schema-green ≠ runtime-green.

**Wiring obligation · per schema field:**

```
schema.geometry              → data-geometry="x,y,w,h"
schema.connections[].target  → data-connection-target="<sig>"
schema.visibility.kind       → data-visible="true|false|<expr>"
schema.archetype             → data-archetype="<name>"  (already wired)
```

**r30 evidence:**

```
receipt   i-fnpgrov-runtime-proof-pass-3.json
gate-c    data-geometry      0/45 widgets · 0%   carrier r31-load-inference-deeper
gate-d    data-visible=false 0 widgets   · 0%   carrier r31-runtime-dispatch
gate-e    data-connection-target 0       · 0%   carrier r31-runtime-dispatch
```

**Discipline:** when a populator-consume node lifts a schema field, the same DAG MUST append a runtime-proof gate that asserts the DOM attribute appears (§Brief-template-render-verify owns the URL-verification step). A populator-consume node that stops at schema-write is half-landed — the other half is named runtime work or the gate is forged.

**Test:** does `assay probe <verified-url>` see the new attribute? Yes → contract closed. No → carrier owed.

## §Schema-runtime-contract-loop

Formalizes the lift-then-wire-then-prove cadence as routine, not exceptional. Every schema field traverses three steps before it counts as landed. Skipping any step is half-landing the field — the gate is forged or the next round inherits dropped wire-up work as an unnamed carrier.

**Three-step cadence · per field · non-skippable:**

```
  1. LIFT    populator emits to model/output/hmi-schema.json
             §Populator-consume-protocol applies
             test: schema field count > 0 AND zod-green

  2. WIRE    stratum (HmiRuntime.vue · RenderWidget.vue) maps schema field
             to DOM attribute (data-geometry · data-connection-target · …)
             test: assay probe response contains the attribute string

  3. PROVE   assay run <spec.json> against URL-verified surface
             §Brief-template-render-verify owns step-1 of the probe
             (verify-URL-FIRST · then probe gates)
             test: gate green on real URL · NOT on Vite SPA fallback
```

**Routine cadence · in every render-adjacent dispatch brief:**

```
brief MUST name        step-1 LIFT     populator + verb
brief MUST name        step-2 WIRE     stratum component + DOM attr
brief MUST name        step-3 PROVE    URL + spec + gate
brief MUST instruct    URL-verify FIRST · probe gates SECOND
                       (§Brief-template-render-verify · two-step protocol)
```

**The audit-as-planning-oracle pattern · r31 canonical exemplar:**

```
node       i-runtime-contract-audit
shape      read-only forensic walk · per-field gap-table · 14 fields · 8 gaps
output     spec for downstream wire-up nodes (NOT a code edit)
property   forensic before constructive · forms a manifest of WIRE work
           that successor nodes consume one-at-a-time
```

This is the canonical planning-oracle for schema-runtime work: emit a per-field gap table BEFORE dispatching wire-up agents · each wire-up node has an enumerated target rather than scanning ad-hoc. r31 receipts:

```
i-runtime-contract-audit              14-field gap table · 8 fields owe wiring
i-runtime-dispatch-connections        substrate join-key mismatch surfaced
                                      (DOM emitted but join-key wrong shape)
i-fnpgrov-runtime-proof-pass-4        1/5 gates green · honest trace ·
                                      4 named carriers to r32
```

**Test:** can a brief author point at a per-field row in the audit table and say "this node closes that row"? If no, the brief is scanning rather than executing — re-route through the audit.


### §Brief-template-render-verify + §Gate-premise-mismatch + §Meta-#8-cross-repo

## §Brief-template-render-verify

Any render-adjacent dispatch brief MUST instruct the agent to FIRST verify which URL produces visible content on the CURRENT stratum branch, THEN probe gates against the verified URL. URL-without-verification is a template anti-pattern that forges green of an unrelated render path (§Staging preview URL trap · Vite SPA fallback returns 200 for any path).

**Two-step protocol · non-negotiable:**

```
1. VERIFY URL    assay probe <candidate-url>
                 assert response contains page-specific marker
                 (e.g. data-archetype on N widgets · data-page=<expected>)
                 if absent → URL is wrong · stop · surface

2. PROBE GATES   assay run <spec.json> against the verified URL
                 every gate's pass/fail is now meaningful
```

**r30 evidence · the canonical exemplar:**

```
receipt    i-fnpgrov-runtime-proof-pass-3.json
step-1     assay probe http://localhost:3000/?layout=staging&page=FnPgRov
           verified hmi-runtime-mount with 45 widgets bearing data-archetype
           SPA root mounted · page=FnPgRov honored
step-2     5 gates probed against verified URL · honest pass/fail per gate
contrast   pre-r29 briefs reached for /staging/X paths · Vite returned 200
           against index.html · gates "passed" against wrong surface
```

**Test:** can the brief name the URL-verification artifact (markers asserted) BEFORE the gates? If no, the brief is a template anti-pattern · reject before dispatch.

## §Gate-premise-mismatch

Distinct from GBD-forgery. When a gate's spec **presumes a scope the round didn't execute**, the gate measures something different than its assertions presume. The gate isn't failing — it's mis-aimed. Resolution differs from GBD: relax the gate to measure what the round DID prove, route the original gate's intent to a successor carrier with the SAME NAME (so the thread is preserved, not dropped).

**Pattern · four moves:**

```
1. DETECT       gate red · diagnosis reveals gate presumed scope X · round did Y
2. RELAX        rewrite gate to measure Y honestly (the actual proven work)
3. ROUTE        carrier in successor round owns the original X intent
4. PRESERVE     carrier id matches the original gate name
                next round's gate is "the gate that was relaxed last round"
```

**r29 evidence · the canonical exemplar:**

```
gate       v-schema-populates-pass-2
presumed   populator-consume nodes had executed (geometry/connections lifted)
actual     pass-2 had only landed substrate · populator-consume was r30 work
resolution honest-relaxed to measure substrate-landed · NOT GBD'd
           (GBD would have implied named-but-unowned residual)
successor  v-schema-populates-pass-3 (r30) · same intent · same name root ·
           now measures populator-consume yield directly
```

**Discipline:** GBD is for residual within-scope. Premise-mismatch is for out-of-scope presumption. Conflating them either inflates GBD count (false residual) or forges green (relaxed without successor). The two patterns DEMAND different receipts.

**Test:** did the round execute the work the gate presumed? If yes + still red → GBD-or-fix. If no → premise-mismatch · relax + route.

## §Meta-#8-cross-repo

The existing meta-#8 PBR rule (prove-before-retire) applies across the fleet/sibling-repo boundary. Never retire a fleet hand-rule before the consumer in stratum (or other sibling) accepts the new shape. Dominance is proven at the consumer, not at the producer (§Populator-consume-protocol cross-repo dimension).

**r29 anti-pattern:**

```
fleet      pipeline/populators/declarative.ts retired hand-coded archetype map
           archetype-classifier.generated.ts (442 entries) became single source
           generator-coarsened names: Button · VideoPane · DialogPanel · etc
stratum    surface-console registry had only the ORIGINAL fine-grained names
           (IconButton · VideoMux · ConfigPanel · etc) · NO aliases
result     39/40 widgets fell through to stub at runtime
           "Archetype X has no stratum component yet" × 40 console errors
diagnosis  fleet-side dominance proven · consumer-side acceptance MISSING
           = forged green · meta-#8 violated across the wire
```

**r30 fix · evidence:**

```
node       i-stratum-archetype-registry-expand
sequence   landed BEFORE rather than AFTER the retirement
           (commit e60cb5a4 in stratum keep/fleet-composable-vocabulary-wiring)
shape      13 generator-coarsened aliases mapped to existing components
           Button → IconButton · VideoPane → VideoMux · DialogPanel → ConfigPanel · …
result     fallthrough-stub count 39 → ≤1 across 40 widgets
discipline consumer-side acceptance landed first · then producer-side dominance probe
```

**Test · cross-repo PBR contract:**

```
1. new shape lands in fleet (or other producer)
2. consumer in sibling repo updates to accept the new shape · commits
3. parity probe across consumers proves dominance (DOM-attr · runtime errors zero)
4. ONLY THEN retire the hand-rule in fleet · same commit as the proof receipt
```

Skipping step 2-3 because "the producer side is green" is the canonical r29-r30 scar. The wire is the cut, not the seal.


---

## Per-round Discipline-notes (r36-r40) · appended at r39 trim · sha pending

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

## §LATE-elaborations-r40

VALIDATED at r40-close. Each anchor below was preanchored as PROVISIONAL (or newly authored at close) and is now promoted to VALIDATED with empirical citation. Per §Doctrine-author-cannot-violate, NONE of these anchors GBD'd r40 gates — r40 GBDs route to r41 with named successors, not to self-authored doctrine.

**§QLayout-taxonomy-corpus-closed.** Wave-2 finding: Qt layout-managers (QHBoxLayout · QVBoxLayout · QGridLayout) are absent from this binary corpus. The trunk for child-geometry resolution is absolute `setGeometry` + sibling-anchor relations, not QLayout-typed plan-children. Invalidates the QLayout-typed plan-children pattern that wave-3 spec'd before substrate-survey landed.

```
empirical seal · r40
  i-tool-panel-child-geometry-extractor   axis pivoted absolute+anchor · 360/729 resolved · sha d2cde0ac
  i-substrate-survey-child-spawn          QLayout corpus-zero confirmed
  pivot                                    spec-authored axis closed at substrate-survey · resolver re-axed before authoring
```

**Test:** when wave-2 substrate-survey returns corpus-zero on a wave-3 spec'd type, the wave-3 plan-children node MUST pivot before authoring — not press the spec'd axis.

**§Plan-children-pivot-on-axis-falsifier.** Sibling to the above. When a wave-2 falsifier closes the spec'd plan-children axis, wave-3 PIVOTS to the surviving substrate axis. The spec authors did not see what the substrate had; the substrate-survey is the ground truth, the spec is hypothesis. Pressing the falsified axis is forge-by-narrative.

**§Render-layer-stratum-local-gates-pixel-proof.** Autonomous r40 track CAN land render code (CanvasRenderWidget · CanvasDispatcher · ToolPanelLayout · recursive-render — all GREEN stratum-local), but pixel-coverage validators require a Griffin push window because stratum is a separate repo and autonomous push is forbidden per §Synchronous-track-parallel-not-gating. Distinguish:

```
code authored (autonomous-OK)        CanvasRenderWidget.vue · 92 widgets routed · sha 89009451
                                      ToolPanelLayout.vue · 123/125 panels · sha 6516c695
                                      recursive-render cycle-safe · sha 32f8154b
pixels measured (Griffin-only)       v-canvas-render-pixel-coverage · GBD-r41 · sha 20e0a28d
                                      pixel_delta_pct cannot be computed without push
```

**Test:** does the gate compute on artifacts inside fleet's tree? Yes → autonomous-OK. Does it require stratum-deployed render? No → pixel-PROVE class · GBD with named Griffin-window successor.

**§Schema-extension-is-Griffin-decision.** The strict Zod schema in `model/schema/hmi-schema.ts` `parse()`s populator output. New fields cannot be added autonomously: rename-to-cousin (reuse an existing slot whose semantics map) versus extend-with-new-slot (grow the schema) is a Griffin-only decision. Walkers landing fields the schema doesn't declare surface as `i-pipeline-pass-13-rerun · BLOCKED` — 6 r40 fields unwired · schema byte-identical pre/post (sha 20792e47) — and that BLOCKED is correct per §Fail-hard.

**Test:** does the populator emit a key absent from `hmi-schema.ts`? Yes → BLOCKED-on-Griffin · do not silently widen Zod · do not graceful-fallback to `passthrough()`.

**§Walker-ceiling-vs-substrate-ceiling-distinction.** Walker substrate matters more than walker authoring. r40 evidence:

```
color-literal-defuse-walker         30/30 GREEN · sha 67877def     · PTRSUB algebra substrate present
font-literal-defuse-walker          0/2 GBD-r41 · sha d4cb99bb     · QString sister GBD · ghidra-strings shard
sizepolicy-d-pointer-walker         14/18 false-positives          · walker authored, substrate noise
stylesheet-literal-walker           0/48 GBD-r41 · sha 1a84e3ef    · terminal upstream Ghidra strings shard
```

Two walkers with identical authoring quality return 100% vs 0% based purely on substrate availability. Identify substrate before authoring; a walker is ceiling-bound by its substrate, not by its code.

**Test:** before authoring a walker, name the pcode trace that the walker will read. If the trace requires upstream Ghidra work (strings shard · decomp-derived shard), the walker GBDs to that upstream — authoring the walker first is forge-by-narrative.

**§Theme-palette-inversion-three-prong-passes-when-shared.** §Inversion-three-prong-test correctly distinguishes shared-theme tokens (extractable as palette via majority-vote across widgets) from per-widget custom colors (walker-bound, never theme). r40 `i-era-png-color-literal-inversion` (sha 142d2536) extracted 8 theme tokens via majority-vote · `i-era-png-child-layout-inversion` (sha 27fe45e3) returned 0 shared defaults and routed per-panel to walker. Three-prong gate did its job: shape-prong + value-prong + corpus-prong all required; child-layout failed corpus-prong, theme-palette passed all three.

**§Doctrine-author-cannot-violate-honored.** r40 preanchored 5 §-stubs (§Canvas-dispatcher-as-runtime-trunk · §Child-spawn-runtime-render-protocol · §Era-PNG-as-constraint-sensor-canonical · §Stylesheet-literal-stack-local-walker · §Pixel-PROVE-canvas-render-empirical-seal) in this skill — NOT in CLAUDE.md — per §No-doctrine-in-CLAUDE-md. r40 GBDs (pixel-coverage · stylesheet-literal · page-canvas-migrate · classifier-pass-5) all route to r41 with named successors; none cite a r40-authored §-anchor as GBD justification. Doctrine landed mid-round held PROVISIONAL throughout the round; this LATE block is the post-hoc validation, not the alibi.

```
preanchor (PROVISIONAL)              ./SKILL.md §Discipline-notes-r40-preanchor (5 stubs)
GBD justifications (r40)             named successor in r41 · empirical falsifier cited · NEVER self-cited doctrine
this LATE block                      validates anchors AFTER round close · empirical citations only
```

**Test:** does any r40 GBD receipt cite a §-anchor authored in r40 as the load-bearing justification? If yes, §Doctrine-author-cannot-violate fired. Audited — zero violations.

---

## §Discipline-notes-r40-preanchor

Forward-declarations for r40 LATE doctrine. PROVISIONAL — r40 gates may NOT be GBD'd via these.

**§PNG-harvest-synchronous-track.** r39 GBD-r40 named `r40-png-harvest-from-tablet` synchronous-only (Windows VM / Galaxy Tab). Doctrine pending: how does autonomous track sequence around synchronous PNG-harvest such that 5 cross-page disagree-cell measurements unblock without round-stall? §Synchronous-track-parallel-not-gating sibling.

**§Pixel-PROVE-gate-canvas-render.** §Substrate-consume-LIFT-WIRE-PROVE-canonical seal exposed two-sub-gate structure of PROVE. r40 owes the canonical pixel-PROVE primitive: pick-buffer pre/post diff per axis, not just DOM-attr count. Receipt schema field: `pixel_delta_pct` paired with `dom_attr_count`.

**§Panel-composition-sub-axis-decomposition.** P9 67.25% pixel-mass → r40 must split (anchor · margin · layout-mode · child-order · sizepolicy-d-pointer). Single-axis carrier ranking on a 67% axis is too coarse · sub-axis ranking required for cross-axis pivot to function below P9.

**§Cross-axis-pivot-cadence.** §When-axis-ceilings-stick-look-elsewhere fired r37 (P2→P9) and r39 (cluster-A close). Cadence pending: is cross-axis pivot a per-round discipline or a per-asymptote event? Empirical anchor needed at r40 — does the panel-composition pivot itself plateau and demand another cross-axis pivot, or does it converge?

**§Canvas-dispatcher-as-runtime-trunk.** PROVISIONAL · forward-declared by `i-doctrine-r40-preanchor`. r39 anchors `i-render-lift-fnpgrov-axis-P8` (sha d8cc4377) and `i-render-lift-fnpgauv-axis-P9` (sha aff58b49) proved DOM-attr LIFT lands but pixel delta is 0pp without a runtime trunk that reads schema and dispatches paint to canvas. Gap named: stratum has consumers but no central canvas dispatcher routes per-widget paint sources. Falsifier r40 owes: `pixel_delta_pct > 0` on FnPgRov P8/P9 widgets when a canvas-dispatcher node is wired AND removed-then-rewired (causality, not coincidence).

**§Child-spawn-runtime-render-protocol.** PROVISIONAL · forward-declared. r39 `i-render-lift-fnpgauv-axis-P9` (sha aff58b49) GBD-r40 with 4387→4387 pixel disagree because child widgets stamp into DOM but do not spawn render nodes under a parent canvas dispatcher. Gap: parent→child render-tree spawn protocol unspecified · `data-panel-template` present, no spawn. Falsifier r40 owes: enumerate parent widgets with child-count ≥1 in schema · count those whose stratum render produces ≥1 nested render node · ratio must be ≥80% OR named honest-RED.

**§Era-PNG-as-constraint-sensor-canonical.** PROVISIONAL · forward-declared. r39 `v-pixel-disagreement-fraction-pass-3` (GBD-r40 via honest-rise on denominator-shift) showed enshrined-PNG is the only third oracle that disambiguates predictor-vs-topology agreement from actual paint correctness. Gap: PNG used as scoring artifact, not as constraint sensor that drives carrier ranking. Falsifier r40 owes: at least one carrier whose P-rank changed BECAUSE a PNG-derived constraint contradicted the predictor (named cell · named rule · named delta), not because narrative reranked it.

**§Stylesheet-literal-stack-local-walker.** PROVISIONAL · forward-declared. r39 `i-claude-md-doctrine-r39` (sha 6f8827ed elaboration) recorded §Custom-paint-stylesheet-literal-defuse PARTIAL · 0/48 sites recovered · upstream-RED to ghidra-strings-shard. Gap: stylesheet literals reachable only via stack-local string construction (not .rdata pool). Falsifier r40 owes: a walker that lifts ≥1 stylesheet literal from stack-local construction with named pcode trace · OR honest-RED naming the structural reason (e.g. obfuscated concat, runtime-template) · zero-recovery without a structural reason is forge-by-narrative.

**§Pixel-PROVE-canvas-render-empirical-seal.** PROVISIONAL · forward-declared · sibling to §Pixel-PROVE-gate-canvas-render above (which names the primitive shape). This stub names the EMPIRICAL SEAL: the round closes only when at least one carrier shows `pixel_delta_pct > 0` causally tied to a canvas-dispatcher landing. r39 anchors d8cc4377 + aff58b49 both held DOM-attr GREEN with pixel-delta 0pp · this is the falsifier shape r40 must trip TO PASS, not to GBD. Falsifier r40 owes: pre/post pick-buffer diff per dispatched widget · aggregate ≥0.5pp on FnPgRov · receipt names the dispatcher commit sha that caused the delta.

