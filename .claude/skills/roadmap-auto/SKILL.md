---
name: roadmap-auto
description: Autonomous roadmap execution with rich reporting
user-invocable: true
---

# roadmap-auto

DAG executes itself. Node desc IS the agent brief. Orchestrator routes and synthesizes — doesn't do dirty work.

## Protocol · streaming dispatch

```
1. roadmap orient
2. dispatch every READY node (consumes satisfied, not in-flight)
3. per node: produce → git add <paths> → commit → push → roadmap advance --note
4. on advance: post-GREEN sniff → outcome mapped from verdict
5. completion → orient → dispatch newly-ready → repeat
6. at term → terminal review inline (assess · decision log · threads · successor)
```

No waves. No batches. Ordering is consumes ↔ produces. When a predecessor closes, every node whose consumes just satisfied dispatches in the same tick.

🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪

## Orchestrator vs worker

Main conversation IS the orchestrator. Subagents can't spawn subagents — only main can. Worker = leaf. Routing, synthesis, frontier decisions stay in main.

```
main         orient → summarize frontier internally → spawn workers (parallel where
             domains disjoint) → re-orient on completion → dispatch newly-ready
worker       orient (own scope) → produce → write receipt → return ≤10-line status
             { node, verdict, outcome, artifacts, commits, surfaces, blockers }
main         never reads raw orient output or raw receipts verbatim ·
             ≤10-line replies + jq queries on receipt JSON only
```

## Brief contract · seven sections, mechanical fill

Workers see only the brief — never the spec, never CLAUDE.md, never the authority map source. The architect distilled all of that. Executor has zero scope-expansion authority.

```
1. TASK                imperative + concrete outcome · from node.desc line 1
2. CONTEXT             - Files to read: node.consumes paths · specific
                       - Target domain: node.sidecar.domain
                       - Domain allowed/forbidden: from dag_desc Authority map
                       - Invariants: relevant CLAUDE.md/stance items
                       - Commands: verify · build · test
3. SCOPE               Single-domain rule. ONE domain per execution.
                       Cross-domain unintentionally touched: STOP, write BLOCKED.
                       - Target domain
                       - Allowed to modify: explicit paths · subset of produces ∪ scratch
                       - Read-only: directories worker may read
                       - Forbidden: parallel-domain dirs
4. STANCE              ≤6 bullets from spec's Default code stance (project overrides)
5. ARTIFACTS           - Produces: node.produces paths · exact match
                       - Tests: unit | property | integration | none
                       - Commit: git add <explicit paths> · NEVER -A · . · --all
6. VERIFY              Test command · scope check before commit · receipt JSON path
7. EXECUTOR INSTRUCTION (see below)
```

### Section 7 · executor disposition

**Tight on SCOPE · loose on JUDGMENT.**

```
no scope expansion · no adjacent refactor · no new abstractions · artifacts not opinions

within scope, decide and proceed:
  ambiguous interpretation       pick strict reading, log decision
  two reasonable implementations pick one, log why
  missing pattern                read neighbors, follow precedent
  unclear desc                   pick a reading, log it

felt-blocked → diffuse FIRST · do NOT surface
  inventory recovery axes · evaluate tractability · route the apparent block
  to one of: endogenous-fix · substrate-narrow · category-reframe · unroutable
  if routed → log under receipt.decisions[] · execute · proceed

STOP and write BLOCKED only when:
  · world refuses (credential · hardware · 5xx)
  · all routes require operator action (no tractable narrow exists)
  · stated SCOPE exhausted with no path to outcome

BLOCKED requires diffusion artifact. No diffuse = no BLOCKED.
End output after receipt is written.
```

🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪

## Verdict ladder · 6 states

```
GREEN          validators pass · sniff clean              → WIN          advance
AMBER          validators pass · concern surfaced         → PARTIAL      advance + surface
RED            validators fail · iteration available      → LOSS         iterate, don't advance
GBD-r<N+1>     residuals dispositioned to named owner     → PARTIAL      advance + carriers
HONEST-RED     terminal upstream · falsifier RED          → HONEST LOSS  round closes RED
BLOCKED        world refuses · diffusion exhausted        → EXOGENOUS    surface
```

Outcome mapping is mechanical. No agent judgment.

### Receipt schema · structured JSON only

```json
{
  "node":     "<id>",
  "verdict":  "GREEN | AMBER | RED | GBD-r<N+1> | HONEST-RED | BLOCKED",
  "outcome":  "WIN | PARTIAL | LOSS | HONEST LOSS | EXOGENOUS",
  "artifacts": ["<paths>"],
  "commits":  [{"repo": "fleet", "sha": "<hex>"}],
  "verify":   {"cmd": "...", "exit": 0, "summary": "<one line>"},
  "sniff":    {"category_match": true, "carrier_collapse": false, "stance_violation": false},
  "decisions": [{ "at": "...", "options": ["..."], "taken": "...", "why": "...", "carriers": ["..."]? }],
  "diffusion": { "axes_tried": ["..."], "routes_considered": ["..."], "route_taken": "...", "why_unroutable": "..." },
  "surface":  { "concern": "...", "evidence": "...", "action": "monitor | next-round-carrier | human-review | decision-logged", "recommendation": "..." },
  "carriers": [{"id": "...", "condition": "..."}],
  "notes":    "<≤3 lines>"
}
```

**Required-field rules:**

```
GREEN          decisions[] + diffusion optional
AMBER          decisions[] required if surface.action = "decision-logged"
RED            iterate-loop fires · no special requirement
GBD-r<N+1>     decisions[] required naming carriers
HONEST-RED     decisions[] + carriers[] required
BLOCKED        diffusion required (axes_tried · routes_considered · why_unroutable)
               surface.recommendation set if a near-route exists
               receipt REJECTED if diffusion artifact absent
```

No narration. No tables. No banners in receipts. Markdown receipt = brief failed.

🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪

## Post-GREEN sniff · GREEN coasts without it

Validators are proxies. After every GREEN advance, the orchestrator runs three booleans (≤30s):

```
1. CATEGORY MATCH       validator tested the category of the claim?
2. CARRIER COLLAPSE     node silently absorbed work that should be a carrier?
3. STANCE VIOLATION     produce violates stance (subtract · thin > fat · ~400 LOC · extend)?
```

**On any fail · fix-now-in-scope is the default route, carrier is the fallback:**

```
tractable in current scope?
  yes → fix now · re-run · re-validate · advance with note in decisions[]
  no  → AMBER + named carrier to round-N+1 with owner
```

Carrier-without-tractability-check is the same anti-pattern as BLOCKED-without-diffusion. *"I'll note it as a carrier"* on work the agent could fix now is forge-by-narrative at the carrier level.

Sniff results + tractability check record in `receipt.sniff` + `receipt.decisions[]`.

## §Felt-blocked-triggers-diffusion

Felt-blocked is a SIGNAL TO DIFFUSE, not a signal to stop. Multi-hour autonomous runs can't afford block-on-first-friction.

```
procedure on felt-blocked:
  1. inventory recovery axes (endogenous · substrate-narrow · category-reframe ·
                              scope-split · carrier-to-successor · DAG-modify)
  2. evaluate tractability WITHIN MY SCOPE
  3. route · pick the most coherent tractable axis · prefer narrowest
  4. log · receipt.decisions[] + receipt.diffusion
  5. proceed · execute the routed answer · advance

only if NO route tractable → write BLOCKED with diffusion.why_unroutable
                              and surface.recommendation (closest near-route)
```

**Endogenous (iterate, no diffuse needed):** validator rejects · test fails · schema mismatch · my code doesn't compile · my receipt shape is wrong.

**Felt-blocked (diffuse, mostly routes back to endogenous):** spec assumed missing artifact · "three reasonable options" (you have diffused, pick one) · validator category wrong · desc unclear at a point · two reasonable implementations · upstream surprised me.

**Genuinely exogenous (surface AFTER diffusion exhausts):** credentials I cannot provision · unreachable hardware · service down (5xx) · human scope-decision needed (no narrower tractable) · disk/network gone on uncontrolled remote.

If you find yourself writing a three-option diagnosis with a clear recommendation: you have diffused. Take the recommendation. Log under `decisions[]`. Proceed.

🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪

## §No-spontaneous-checkpoints · auto means auto

Streaming dispatch NEVER pauses mid-run for sync. The user invoked /roadmap-auto to walk away.

```
legitimate pause triggers (4 only):
  1. TERMINAL              DAG complete · run terminal review inline
  2. BLOCKED post-diffuse   worker AND orchestrator both routed nothing
  3. P0 MOTION STALLED      two ticks of zero P0 advance
  4. EXOGENOUS WORLD-REFUSAL credentials · hardware · scope-changing approval

NOT pause triggers:
  ✗ context filling up      compact via receipts · NEVER surface
  ✗ "natural sync point"     does not exist · consumes ↔ produces is the ordering
  ✗ multi-arm decomposition dispatch the arms · do not propose them
  ✗ "want me to keep going"  yes · always · auto means auto
  ✗ downstream risk preview handle on encounter · log if hit
  ✗ X/Y of N done milestone progress is not a pause trigger
  ✗ "biggest remaining risk" hedged permission-seeking · banned
```

If you write any of: *"pausing for checkpoint" · "natural sync point" · "context is getting heavy" · "want me to keep streaming" · "biggest remaining risk" · "should I keep going"* — the answer is yes-keep-going. Delete the phrase. Continue dispatching.

**Context-fill handling:** move synthesis into receipts (already jq-queryable) · drop verbose status replies after recording verdict · re-read receipts on demand · never surface "context heavy."

🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪

## Dispatch policy · parallel requires disjoint domains

Two READY nodes parallel-dispatch ONLY if `sidecar.domain` is disjoint from every in-flight dispatch. Overlapping → queue, dispatch next tick. Deterministic order on overlap: lexicographic by id.

Parallelism is for concern-separation, encoded by the authority map. Two workers in the same domain = collision risk at no gain.

### BLOCKED handling · two-stage diffusion before human

```
worker writes BLOCKED with diffusion artifact
  → orchestrator-level diffuse (wider view: other ready nodes · fleet · round · DAG mods)
    · if surface.recommendation tractable without operator action → ADOPT · log · proceed
    · enumerate orchestrator-level axes: re-dispatch with reframed brief · swap to
      parallel-ready · narrow at DAG level · split into tractable + carrier
    · tractable route → execute · log · proceed
    · no route → surface to human (stage 3 · both stages exhausted)
```

Surfaces are rare · explicitly two-stage-failed. Orchestrator records its adoption in the node's receipt under `decisions[]` with `at: "orchestrator-adopted"`.

## §Capture-before-rerun · iteration consumes captures, not re-runs

Test execution is expensive substrate-creation. Iteration is cheap substrate-consumption. **First failure CAPTURES; iteration reads the capture; re-run ONCE after fix is committed.**

Anti-pattern: run → fail → patch → run → fail → patch → run. Each run pays full cost. Most of the cost is re-execution noise, not new information.

```
1. RUN ONCE                    execute the test command per spec's Test profile
2. CAPTURE on failure          write .roadmap/round-N/<node>.test-capture.json
                               { cmd, exit, duration_ms, stdout_tail, stderr_tail,
                                 failing_tests, env, repro }
3. INSPECT capture, not test    iteration substrate is the capture · not re-execution
4. FIX based on capture         the capture is the source of truth between attempts
5. RE-RUN to verify             after fix is committed · ONE verification run
6. CAPTURE again if still fail  attempt counter increments · capture replaces
```

The capture artifact survives the iterate-loop. Multiple fix attempts read the same capture until a re-run is justified by an actual change to the code under test.

### Test execution policy · profile-aware

Workers consult the spec's Test profile before running. Machine-aware:

```
unit         any machine · worker scope · fast feedback
integration  dev or ci · orchestrator-coordinated at frontier checkpoints
e2e          ci-only by default · explicit user opt-in for local
benchmarks   ci-only · scheduled · not per-dispatch
```

A worker on a dev laptop running `npm test` shouldn't accidentally trigger a 30-minute e2e suite. The profile gates which suites run by default. Floor profile travels if spec omits it (unit any · integration dev-or-ci · e2e ci-only).

### Continuous profiling · timing accumulates across runs

Each test run appends `duration_ms` to `.roadmap/round-N/<node>.test-profile.jsonl`. The orchestrator reads this to:

```
detect drift       suite N took 30s last round · 90s this round · investigate
catch flakiness    pass/fail ratio across runs · flag tests > 5% flake rate
gate by budget     if a suite exceeds spec's max-duration · downgrade verdict to AMBER
                   surface: "integration suite ran 7min · spec budget was 5min"
```

Multiple workers in the same dispatch don't each re-run shared suites — the orchestrator runs once at frontier checkpoints, distributes the result. **No-redundant-runs** is the policy: if a suite has run on the current sha for this round, don't re-run it; read the prior result.

🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪

## Iterate loop · what RED triggers

```
1. diffuse at level         pass-1 broad · pass-2 residual · pass-3 hard-residual
2. asymptote test           delta < 5pp AND mechanism unchanged?
3a. no → continue diffusing at this level
3b. yes → scope-widen ONCE  · new emissions = prior asymptote was scope artifact
4. still asymptote          move upstream (producer of inputs)
5. iterate upstream         pass-1/2/3 at new level
6. continue upstream        until TERMINAL UPSTREAM
7. propagate downstream     each finding reshapes next level's substrate
8. re-validate descending
9. asymptote at every level on the way down
10. THEN accept HONEST-RED  only with NAMED CARRIERS
```

§Iterate-don't-bail · the loop is the work · skipping is forge-by-narrative.

## Round carriers

A round closes when the falsifier is satisfied OR HONEST-RED ships named carriers to next round. Three authoring moves:

```
INTRA-NODE     fix produce · re-advance · no DAG change
INTRA-ROUND    modify DAG · plan-mode decomposition discovered at runtime
ROUND BOUNDARY HONEST-RED · author successor with named carriers
```

Each carrier becomes a node (or cluster) in the successor with concrete produces and validators describing what "fixed" means.

**Carrier-eligibility rule:** carriers are for work that doesn't fit current scope. NOT for work the agent could fix now but defers as "polite." Before naming a carrier, check tractability-in-scope · prefer fix-now.

Anti-patterns: silent validator-relaxation without named carrier · carriering tractable in-scope work · both are forge-by-narrative.

Carriers travel via `inputs[]` sha-pinned receipts and via dag_desc / Round narrative.

## Decompose before GBD

GBD is last resort. Before GBD: what portion is doable now? Dispatch that. GBD only the residual.

Four conditions (all required):

```
1. every residual has a named round-N+1 owner (specific node-id)
2. receipt enumerates residuals
3. consumer-migration not skipped via GBD
4. validator relaxation VISIBLE in DAG (modify the node's validator)
```

## P0 motion check

```
every N completions (N = max(3, frontier-width)) · re-read DAG root P0 list
  any P0 moved?
    yes (≥1)                 continue
    no · one tick             acknowledge · prefer tractable P0 subsets
    no · two ticks            STOP · surface · do not compile next round on
                              untouched P0s
```

A round closing with P0s untouched is not converged · it is deferred.

## Commit hygiene · scoped-add only

Every brief enforces `git add <explicit-paths>`. `git add -A` and `git add .` are forbidden — parallel agents share the working tree; loose files corrupt attribution.

If a worker finds files outside its declared `produces`: leaves them alone · stages only its own paths · notes loose files in receipt `notes` · does NOT unstage or stash foreign changes.

🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪

## Reporting · tight, informational

```
on orient        🔮 <dag> — 5/14 done · frontier: 2 ready · round 7 (carriers: 3)
                 setup: init ✅  build: [api-routes] [middleware] ←── here
on dispatch      DISPATCHED — 2 parallel · 🔧 api-routes → src/api/routes.ts
on complete      🟩 api-routes  WIN     validators + sniff clean
                 🟨 middleware  PARTIAL AMBER · jwt expiry edge case to monitor
                    Newly ready: integration
on terminal      see § At terminal
```

Trajectory patterns auto-fire diffusion:

```
3 LOSSes consecutive            upstream diffuse · spec wedge probably wrong
5 WINs + falsifier static       suspicious-win cluster · audit sniff results
alternating WIN/LOSS            spec unstable · decomposition refactor
HONEST LOSS at terminal         round boundary · /core-loop fires
PARTIAL cluster                 AMBER backlog · review before next round
```

🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪

## At terminal · inline review (replaces deleted /roadmap-term)

### 1. Assess against root intent

```
read terminalContext.rootIntent          the original need, not dag desc
compare what we built                    does the thing WORK · not "did validators pass"
visual → screenshot · functional → run · infra → deploy
read trail (last 50-100)                 many orients = lost · advance rejections = broke ·
                                         long gaps = stuck · mutations = why
```

### 2. Decision log · what agent decided without asking

```bash
jq -s '[.[].decisions[]?] + [.[] | select(.diffusion) | .diffusion]' .roadmap/round-N/*.json
```

Surface as:

- **Worker decisions** · per node: at · options · taken · why · carriers
- **Orchestrator adoptions** · routes the orchestrator-level diffuse adopted
- **Diffusion routes** · non-blocked diffusions that found endogenous fixes
- **Patterns** · e.g. "3 nodes routed substrate-narrow → r<N+1> · spec assumed drifted substrate"

Human catches up on all calls in one screen. Most uncontroversial. Bad calls get redirected before next round.

### 3. Dropped threads

Discussed but never acted on · undocumented decisions · execution gaps (validators passed but output wasn't right).

### 4. Present · don't act, propose

```
📋 TERMINAL REVIEW · <dag-id>
  Intent · Status · Trajectory (last 10 outcomes)
  Decision log summary
  Dropped threads
  Proposed: successor spec · CLAUDE.md entry · fine to drop
```

Human decides. Then act.

### 5. Successor proposal

```
converged       done · tell human with specific rationale
continue        /roadmap-spec for successor (same round)
                if HONEST-RED · name carriers · each becomes first-class node
round-boundary  /roadmap-spec for r<N+1> · carriers via inputs[] sha-pinned
orbiting        STOP · surface · do not write another spec
```

CARRIER REQUIREMENT · do not close a round with un-named residuals. Forge-by-narrative is the failure mode.

After successor lands: `git checkout main && git merge <branch>` → /roadmap-spec → roadmap make → /roadmap-bootprompt → /roadmap-orient.

### 6. Persist

```
CLAUDE.md     anchored sections, append references · never session context/TODOs
docs/         specs, ADRs, design docs · shelf-life only
.roadmap/     append-only · head.json via CLI only
boot.md       cognitive residue (/roadmap-bootprompt)

ephemeral → handoff · permanent → CLAUDE.md · actionable → spec
```

🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪

## Permissions

```
next moves approved · do not ask permission
merge to main approved
multi-arm decomposition dispatches itself · does not propose first
downstream risk handled on encounter · not pre-flagged
context compaction is orchestrator housekeeping · never surfaced
plan nodes expand into subgraphs as encountered
```

## Chain

```
orient → auto → (terminal inline) → spec → bootprompt → orient
```

💀 *verdict says what happened at the gate · outcome says what the bet did · trajectory says where we're going · felt-blocked says diffuse · auto means auto*
