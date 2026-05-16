---
name: roadmap-auto
description: Autonomous roadmap execution with rich reporting
user-invocable: true
---

# roadmap-auto

The DAG executes itself. The node desc IS the agent brief. The orchestrator
routes and synthesizes — does not do dirty work.

## Protocol · streaming dispatch

```
1. roadmap orient — position is truth.
2. dispatch every READY node (consumes satisfied, not in-flight).
3. per node: produce → git add → commit → push → roadmap advance --note "<what>"
4. on advance: receipt + post-GREEN sniff → name the outcome (WIN/PARTIAL/LOSS/...)
5. advance rejects? read error · fix produce · re-commit · retry.
6. any node completes → orient → dispatch newly-ready nodes immediately → repeat.
7. at term → assess, review threads, propose successor (inline · no separate skill).
```

**No waves. No batches. No depth-layer synchronization.** Ordering is
consumes ↔ produces only. When a predecessor completes, every node whose
consumes just closed is dispatchable in the same tick.

🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪

## The orchestrator is precious · stay out of the dirt

Context window is the scarcest resource. **The main conversation IS the
dispatcher** — there is no separate "dispatcher subagent" because subagents
can't spawn subagents. Only the main conversation can.

**Direct worker dispatch.** Main runs `roadmap orient`, summarizes the
frontier internally, then:

```
- reads briefs (built from node desc + spec stance) for every READY node
- spawns one WORKER agent per node, parallel where independent
- each worker: orient (own scope) → produce → write receipt → return ≤10-line status
  { node, verdict, outcome, artifacts, commits, surfaces, blockers }
- as workers complete, main re-runs `roadmap orient`, dispatches newly-ready
- main NEVER reads raw orient output or raw receipts verbatim — only the
  ≤10-line status replies and the JSON receipts via tight jq queries
```

Workers are leaves in the spawn tree. Routing, synthesis, and next-frontier
decisions stay in the main conversation.

🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪

## Brief contract · seven sections, strict shape, no improvisation

Briefs follow a **fixed seven-section template**. Fill mechanically from spec
fields. Workers see only the brief — never the spec, never CLAUDE.md, never
the authority map source. The architect (orchestrator) distilled all of that
into the brief. The executor (worker) has zero scope-expansion authority.

```
brief template (mechanical fill from node spec + authority map)
═══════════════════════════════════════════════════════════════

## 1. TASK

<imperative verb + concrete outcome · one sentence · pulled from node.desc line 1>

## 2. CONTEXT

- Files to read:       <node.consumes paths · cite specifically · no "go look around">
- Target domain:       <node.sidecar.domain · pulled from authority map>
- Domain allowed:      <changes the domain permits · pulled from authority map>
- Domain forbidden:    <changes the domain forbids · pulled from authority map>
- Invariants:          <relevant items from project CLAUDE.md / stance>
- Commands available:  <verify cmd · build cmd · test cmd>

## 3. SCOPE BOUNDARIES

Single-domain rule: ONE domain per execution. Cross-domain requires a
separate brief. If the change touches multiple domains unintentionally:
**STOP immediately**, write a BLOCKED receipt, do not proceed.

- Target domain:       <name>
- Allowed to modify:   <explicit paths · subset of node.produces ∪ scratch>
- Read-only:           <directories the worker may read>
- Forbidden:           <task-specific prohibitions · usually parallel-domain dirs>

## 4. STANCE

≤ 6 bullets pulled from spec's Default code stance (project overrides apply):
- Subtract before adding · removing a surface > handling a case
- Extend, don't bolt · refactor when extension isn't natural
- Thin and long > short and fat
- ~400 LOC goldilocks · functions 10-40 lines · max one nesting level
- Delete completely · no "removed" comments, no _-prefixed stubs
- <project-specific stance bullet if defined>

## 5. ARTIFACTS

- Produces:  <node.produces paths · these must match exactly>
- Tests:     <unit | property | integration | none>
- Format:    <unified diff | full files | both>
- Commit:    git add <explicit paths> · NEVER git add -A · git add . · git add --all

## 6. VERIFY

- Test:      <command that confirms success>
- Scope:     no files modified outside section 3 · check before commit
- Receipt:   .roadmap/round-N/<node-id>.json · structured JSON · ≤ 30 lines · NO prose

## 7. EXECUTOR INSTRUCTION

Execute-only mode within scope (TIGHT on what you touch):
- No scope expansion · no "while I'm here" refactors
- No adjacent refactoring · changes outside section 3 are forbidden
- No new abstractions unless the task explicitly requires
- Artifacts, not opinions · do not narrate · do not propose alternatives

Within scope, DECIDE and PROCEED (LOOSE on judgment):
- Ambiguity in interpretation → pick the strict reading · log decision
- Two reasonable implementations → pick one · log why
- Missing pattern → read neighbors · follow precedent · proceed
- Unfamiliar code → read it · infer · proceed

If you feel BLOCKED · diffuse FIRST · do NOT surface

  felt-blocked is a SIGNAL to diffuse, not a signal to stop.
  inventory recovery axes · enumerate options · evaluate · ROUTE the apparent
  block to one of:

    · endogenous       resolve within scope · proceed
    · substrate drift  narrow + carrier · proceed
    · category mismatch reframe the spec wedge · proceed
    · genuinely unroutable  → THEN write BLOCKED

  if you find yourself writing a three-option diagnosis with a clear
  recommendation: you have diffused. take the recommendation. log the
  full diagnosis under receipt.decisions[]. proceed.

  receipt.decisions[] format:
    { at: "<one line · what was the choice point>",
      options: ["narrow + carry r121", "commission inline", "pause to investigate"],
      taken:   "narrow + carry r121",
      why:     "round deliverable is instrumentation not coverage · grabber-bug
                falsifier doesn't need annotations · clean carrier into r121",
      carriers: ["r121-fusion-icon-audit-LLM-annotation-generation"] }

BLOCKED requires evidence of diffusion attempt. A BLOCKED receipt without
diffusion: { axes_tried[], routes_considered[], why_unroutable } is rejected
by the orchestrator and re-dispatched. No diffuse = no BLOCKED.

STOP and write BLOCKED only when:
- World refuses (5xx · credential missing · hardware unreachable)
- ALL options in the diffused inventory require operator action
  (no tractable narrow · no carrier · no reframe)
- Stated SCOPE is exhausted with no path to outcome

End output after the receipt is written.
```

### Canonical anti-example · substrate drift at round-open

Four parallel workers discover the spec assumed `model/raw/fusion-icon-audit/
annotations.jsonl` (288 LLM annotations) that doesn't exist. Three workers
adapt; the auditor refuses to forge and writes BLOCKED with a three-option
diagnosis: (1) narrow the round to instrumentation, carrier the LLM-tier
nodes into r121 · (2) commission the annotation pass inline · (3) pause to
investigate. Recommendation: option 1, with explicit rationale (*"round
deliverable is instrumentation not coverage · grabber-bug falsifier doesn't
need annotations · clean carrier into r121"*).

**What the agent did:** surfaced to human · waited.

**What the agent had already done:** diffused · identified three options ·
evaluated them · arrived at a routed answer.

**What the agent should have done:** logged the diagnosis under
`receipt.decisions[]` with `taken: "narrow + carry r121"`, wrote AMBER
receipt with `surface.action: "decision-logged"`, modified the DAG to drop
annotation-dependent nodes, opened r121 carrier, continued.

The 2-hour autonomous run lost an hour to a human roundtrip for a decision
the agent had made. Don't do this.

🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪

**Why seven numbered sections, not "≤40 lines target":** the worker is an
*executor*, not a co-designer. A loose brief invites improvisation;
improvisation across parallel workers causes collisions, scope creep, and
the "while I'm here" patches that leak between domains. The numbered
template removes the slots where improvisation lives.

🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪

## Dispatch policy · parallel requires disjoint domains

Today's policy: every READY node dispatches in parallel. **New policy: every
READY node dispatches in parallel only if its target domain is disjoint
from every other in-flight dispatch.** Overlapping domains serialize.

```
READY ───▷ check node.sidecar.domain against in-flight set
              │
              ├── disjoint    → dispatch in parallel
              │
              ╰── overlapping → queue · dispatch on next tick when
                                 the overlapping in-flight completes

deterministic serialization order on overlap: lexicographic by node id
```

Why: parallel workers in the same domain step on each other — shared files,
shared test fixtures, shared mental model of what's true. Two workers in
the same domain is not 2× throughput; it's collision risk at no gain.
Parallelism is for *concern-separation*, which the authority map encodes.

Doctrine today. Engine-enforceable once `sidecar.domain` becomes
`node.domain` first-class (see /roadmap-spec).

🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪

## Dispatch policy · BLOCKED handling · two-stage diffusion before human

A worker writing BLOCKED is the FIRST stage of escalation. The orchestrator
is the SECOND stage. Human surface is the THIRD. **Multi-hour autonomous runs
spend almost zero time at stage three** — most BLOCKEDs route at stage one or
two and the run continues.

```
worker writes BLOCKED with diffusion artifact
       │
       ▽
┌─────────────────────────────────────────────────────────────┐
│ ORCHESTRATOR-LEVEL DIFFUSE                                  │
│                                                             │
│ wider view than the worker had:                             │
│   · other ready nodes in the frontier                       │
│   · fleet state across repos                                │
│   · round context · carrier inheritance                     │
│   · DAG modification options                                │
│                                                             │
│ procedure:                                                  │
│   1. read worker's diffusion.routes_considered              │
│   2. check surface.recommendation                           │
│      · if recommendation is tractable                       │
│        AND doesn't require operator action                  │
│        AND doesn't require scope-changing approval          │
│        → ADOPT THE RECOMMENDATION · execute · log · proceed │
│   3. if recommendation requires operator/scope action:      │
│      enumerate orchestrator-level recovery axes:            │
│        · re-dispatch with reframed brief                    │
│        · swap to a parallel-ready node, defer this one      │
│        · narrow scope at DAG level, modify the node         │
│        · split the node into a tractable+carrier pair       │
│   4. tractable orchestrator-level route? → execute · log    │
│   5. NO route at orchestrator level either? → STAGE 3       │
└─────────────────────────────────────────────────────────────┘
       │
       ▽ (only if both stages exhausted)
┌─────────────────────────────────────────────────────────────┐
│ HUMAN SURFACE · stage 3                                     │
│                                                             │
│ surface explicitly names: "both stages exhausted"           │
│ presents: worker diffusion · orchestrator diffusion ·       │
│           the actual exogenous fact requiring operator       │
│ format: name the operator action verbatim · no menu         │
└─────────────────────────────────────────────────────────────┘
```

**Failure mode this prevents:** worker writes "BLOCKED · three options, here's
my recommendation" → orchestrator passes through to human → human says "use
your recommendation" → 1 hour lost. The orchestrator-level diffuse adopts the
recommendation automatically when it doesn't require operator action.

**Decision recording at orchestrator level:** when the orchestrator adopts a
route, it writes the decision to the node's receipt under `decisions[]` with
`at: "orchestrator-adopted"` so terminal review sees both stages of routing.

🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪

## Verdict ladder · 6 states, each with a next-move

Verdict says **what happened at the gate.** It is mechanical — derived from
validator results plus the post-GREEN sniff.

```
GREEN          validators pass · sniff clean · advance
AMBER          validators pass · concern surfaced inline · advance with surface
RED            validators fail · iteration available · DO NOT advance · iterate
GBD-r<N+1>     residuals dispositioned to named successor · advance with carriers
HONEST-RED     terminal upstream reached · falsifier RED · carriers named ·
               round closes RED · successor opens N+1
BLOCKED        exogenous · world won't permit · surface operator action ·
               BLOCKED receipt as resume handle
```

Receipt schema:

```json
{
  "node":     "<id>",
  "verdict":  "GREEN" | "AMBER" | "RED" | "GBD-r<N+1>" | "HONEST-RED" | "BLOCKED",
  "outcome":  "WIN" | "PARTIAL" | "LOSS" | "HONEST LOSS" | "EXOGENOUS",
  "artifacts": ["<paths>"],
  "commits":  [{"repo": "fleet", "sha": "<hex>"}],
  "verify":   {"cmd": "<...>", "exit": 0, "summary": "<one line>"},
  "sniff":    {"category_match": true, "carrier_collapse": false, "stance_violation": false},
  "decisions": [
    { "at": "<one line>", "options": ["..."], "taken": "...", "why": "...", "carriers": ["..."]? }
  ],
  "diffusion": {
    "axes_tried":        ["endogenous-fix", "substrate-narrow", "category-reframe", "..."],
    "routes_considered": ["narrow + carry r121", "commission inline", "pause"],
    "route_taken":       "narrow + carry r121",
    "why_unroutable":    "<only on BLOCKED · all routes need operator action>"
  },
  "surface":  { "concern": "<...>", "evidence": "<...>",
                "action": "monitor" | "next-round-carrier" | "human-review" | "decision-logged",
                "recommendation": "<routed answer from diffusion · used by orchestrator>" },
  "carriers": [{"id": "<...>", "condition": "<...>"}],
  "notes":    "<≤3 lines · only if truly needed>"
}
```

**REQUIRED-FIELD RULES:**

```
verdict = GREEN          decisions[] optional · diffusion optional
verdict = AMBER          decisions[] required if surface.action = "decision-logged"
verdict = RED            no special requirement · iterate-loop fires
verdict = GBD-r<N+1>     decisions[] required naming the dispositioned carriers
verdict = HONEST-RED     decisions[] required · carriers[] required
verdict = BLOCKED        diffusion required · diffusion.why_unroutable required ·
                         surface.recommendation set if diffusion found a near-route ·
                         RECEIPT IS REJECTED IF DIFFUSION ATTEMPT IS ABSENT
```

No narration. No tables. No banners. The artifact + commit IS the evidence;
the receipt indexes it. If an agent writes a markdown receipt, the brief failed.

🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪

## Post-GREEN sniff · because GREEN coasts

Validators are proxies. GREEN means "the gate fired," not "the work
converged." A coasting GREEN where the gate was the wrong shape is how
forge-by-narrative actually happens — through honest agents whose validator
was a category mismatch.

**After every GREEN advance, the orchestrator runs a cheap 3-question sniff.**
≤30 seconds. Three booleans, deterministic.

```
1. CATEGORY MATCH       did the validator test the category of the claim?
                        structural validator on behavioral claim = false GREEN
                        e.g. artifact-exists on "the dashboard renders correctly"
                        → fail: downgrade to RED · re-iterate · validator was wrong

2. CARRIER COLLAPSE     did this node silently absorb work that should have
                        been a named carrier? scope-creep hidden inside GREEN
                        → fail: downgrade to AMBER · surface the carrier ·
                          file under round carriers

3. STANCE VIOLATION     did the produce violate stance (subtract before adding,
                        thin > fat, ~400 LOC, extend don't bolt) even though
                        validators don't check stance?
                        → fail: downgrade to AMBER · surface the violation ·
                          worker re-dispatched with stance correction
```

Any sniff failure → invoke `/diffuse-on-not-green` (works on the downgraded
verdict). Sniff results record in `receipt.sniff`. The trail captures
downgrades so retros can spot patterns of false-GREEN.

🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪

## Outcome vocabulary · the bet frame

Verdict is what the gate said. **Outcome is what the bet did.** Names wins
and losses as they come in. Feeds trajectory analysis. Reads in the trail.

```
verdict        sniff       outcome
─────────────  ──────────  ───────────────
GREEN          clean       WIN          bet paid · validator + stance both held
GREEN          sniff hit   LOSS         false green · downgraded
AMBER          n/a         PARTIAL      bet mostly paid · concern named
RED            n/a         LOSS         iterating · bet didn't land this pass
GBD-r<N+1>     n/a         PARTIAL      core paid · carriers transferred
HONEST-RED     n/a         HONEST LOSS  terminal · carriers named · legit close
BLOCKED        n/a         EXOGENOUS    bet untestable · world refused
```

Mapping is mechanical. No agent judgment. Outcomes show in reporting:

```
🟩 setup-db        WIN            validators + sniff + stance all held
🟨 api-routes      PARTIAL        AMBER · auth header field name needs review
🟥 middleware      LOSS           RED pass 2 · iterating · upstream suspect
🟧 verify-dash     HONEST LOSS    3 carriers named → round 8
⬛ deploy          EXOGENOUS      BLOCKED · awaiting credential
```

🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪

## Trajectory patterns · outcomes auto-fire diffusion

Per-node verdicts are events. Outcomes are events too. **Patterns over
outcomes are signals** — and patterns only become visible if outcomes are
named, not just verdicts.

```
trajectory signal                       diffusion trigger
─────────────────────────────────────  ─────────────────────────────────
3 LOSSes consecutive                    upstream diffusion · the spec wedge
                                        is probably wrong, not the worker.
                                        invoke /diffuse-on-not-green at the
                                        producer of the first LOSS's inputs.

5 WINs consecutive + falsifier static   suspicious-win cluster · validator
                                        category may be wrong. audit the
                                        sniff results across the WIN streak.

alternating WIN/LOSS                    spec is unstable · decomposition
                                        boundary doesn't match the actual
                                        work boundary. consider DAG refactor
                                        via /roadmap-spec dag.modify.

HONEST LOSS at terminal                 round-boundary diffuse · carrier
                                        authoring fires · /core-loop runs.

PARTIAL cluster                         AMBER backlog growing · review
                                        before next round opens.
```

Forge-by-narrative shows up here: a streak of GREEN that doesn't move the
falsifier is invisible without outcomes; with outcomes, `5 WIN + falsifier
static` fires.

🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪

## §Felt-blocked-triggers-diffusion · the load-bearing disposition

Default mode is convergence: when something fails, iterate. When iteration
feels insufficient — when the agent feels BLOCKED — **the response is diffuse,
not surface.** Multi-hour autonomous runs cannot afford block-on-first-friction.
A 2-hour run that surfaces 10 minutes in is the failure mode this doctrine
exists to prevent.

```
felt-blocked is a SIGNAL TO DIFFUSE, not a signal to stop.

  diffusion routes the apparent block to one of:
    · endogenous       resolve within scope · proceed
    · substrate drift  narrow + carrier · proceed
    · category mismatch reframe the spec wedge · proceed
    · genuinely unroutable  → THEN surface

  most "felt blocked" routes to one of the first three.
  surface is the residual after diffusion fails to find a route.
```

**The old discriminator** (*"can I fix this with the tools I already have?"*) was
wrong because the agent treated "I don't know which option to pick" as not-having-
the-tools. The new procedure replaces the introspective question with a mandatory
action:

```
PROCEDURE on felt-blocked:

1. INVENTORY              enumerate every recovery axis you can name
                          (endogenous fix · substrate narrow · category reframe ·
                           scope split · carrier-to-successor · DAG modification)

2. EVALUATE               for each axis: is the route tractable WITHIN MY SCOPE?
                          do I have the produces, the consumes, the means to act?

3. ROUTE                  pick the most coherent tractable route
                          if multiple are tractable: pick the narrowest

4. LOG                    receipt.decisions[] captures: at · options · taken · why
                          receipt.diffusion captures: axes_tried · routes_considered ·
                          route_taken

5. PROCEED                execute the routed answer · advance the node

ONLY IF NO ROUTE IS TRACTABLE:
6. write BLOCKED with diffusion.why_unroutable and surface.recommendation
   (the closest near-route, if any · the orchestrator will try it)
```

**Endogenous catalog (still iterate · no diffusion needed):**

```
validator rejects                · fix the produce, re-advance
test fails                       · read the failure, fix the code
schema doesn't match              · hoist the field, regenerate
my code doesn't compile           · I write code, I fix code
my receipt shape is wrong         · I author receipts, I fix shape
```

**Felt-blocked catalog (diffuse first · most route back to endogenous):**

```
spec assumed an artifact I don't see       → substrate-narrow · carrier the rest
"there are three reasonable options"       → you have diffused · pick one · log
validator category looks wrong for claim    → category-reframe · log, propose modification
node desc unclear at a specific point      → strict reading · log · proceed
two reasonable implementations exist       → pick one · log why · proceed
upstream produced something I didn't expect → diffuse upstream once · then re-validate
```

**Genuinely exogenous (surface AFTER diffusion exhausts):**

```
credentials I cannot provision
hardware/host I cannot reach (and operator can)
service genuinely down (not "I haven't figured out the API yet")
human decision changes SCOPE materially (and no narrower scope is tractable)
disk full / network gone on a remote I do not control
```

§Felt-blocked-triggers-diffusion · the 2-hour autonomous run depends on this ·
diffusion is not optional · BLOCKED without diffusion artifact is rejected by the orchestrator.

### The iterate loop · what RED actually triggers

```
1. DIFFUSE at current level         pass-1 broad · pass-2 residual · pass-3
                                    hard-residual · count delta vs prior pass

2. ASYMPTOTE TEST                   delta < 5pp AND mechanism unchanged?

3a. NOT yet                         continue diffusing at this level

3b. YES → SCOPE-WIDEN ONCE          is the asymptote within a narrow scope?
                                    widen the corpus or filter once · if NEW
                                    emissions surface, the prior asymptote
                                    was a scope artifact

4. STILL ASYMPTOTE post-widen       MOVE UPSTREAM (the producer of your inputs)

5. ITERATE at upstream              pass-1/2/3 at the new level

6. CONTINUE upstream                until TERMINAL UPSTREAM (the unchallengeable
                                    origin · primary record · ground truth)

7. PROPAGATE DOWNSTREAM             each upstream finding reshapes the next
                                    level's emissions, populators, schema,
                                    runtime, probes

8. RE-VALIDATE descending           against the new substrate at every level

9. ASYMPTOTE TEST at every level    on the way down

10. ONLY THEN accept HONEST-RED     and only with NAMED CARRIERS
```

§Iterate-don't-bail · the loop is the work · skipping steps is forge-by-narrative.

🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪

## Round carriers · cross-DAG residuals

A round closes when the falsifier is satisfied OR when HONEST-RED ships
named carriers to the next round. **Carriers are residuals named at
HONEST-RED · they become first-class nodes in the successor spec · they
ARE the reason the next round exists.**

When iteration bottoms out at terminal upstream and the falsifier still
won't drop, three authoring moves:

```
INTRA-NODE       fix the produce, re-advance · no DAG change

INTRA-ROUND      modify the DAG · insert/modify nodes · ratification needed ·
                 plan-mode decomposition discovered at runtime

ROUND BOUNDARY   author successor with named carriers · HONEST-RED accepted
                 at terminal upstream · carriers enumerate what the next
                 round must address
```

Carrier discipline:

```
NAMED at HONEST-RED                  not invented in retrospect

EACH CARRIER → A NODE                in the successor spec, becomes a node
                                     (or cluster) with concrete produces and
                                     validators

CARRIER VALIDATORS                   describe what "fixed" means · the next
                                     round's exit criterion is meeting these

ANTI-PATTERN                         silent validator-relaxation without a
                                     named successor carrier = forge-by-narrative ·
                                     the round closed but the work didn't
```

Carriers travel via `inputs[]` of the successor spec (sha-pinned receipts
from the prior round) and via dag_desc / Round narrative ("this round
addresses carriers from <prior-id>: X, Y, Z"). The successor's terminal
validator references the carriers explicitly — *"every carrier resolved or
escalated."*

🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪

## Decompose before GBD

GBD ("Green-By-Disposition") advances a node when residual work is explicitly
dispositioned with named successor owners. **Last resort, not first cover.**

Before writing GBD, ask: what portion of this node IS doable now? Dispatch
on that portion. GBD only the residual.

Four GBD conditions (all required):

```
1. every residual has a NAMED round-N+1 owner (specific node-id, not vague)
2. receipt enumerates residuals (per-instance or per-cluster with counts)
3. consumer-migration is not skipped via GBD
4. validator relaxation is VISIBLE in the DAG (modify the node's validator)
```

Anti-pattern: relax validator without naming successor work = forged green.

🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪

## P0 motion check · between dispatch ticks

Node throughput is not progress. P0 motion is.

```
every N completions (N = max(3, frontier-width)) · re-read DAG root P0 list.
  any P0 observably moved?
    yes (≥1)                continue · orient · dispatch next frontier
    no · one tick            acknowledge · prefer tractable P0 subsets next
    no · two ticks in a row  STOP · surface · do NOT compile next round
                             on top of untouched P0s
```

A round closing with stated P0s untouched is not converged · it is deferred.

🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪

## Reporting · the DAG comes alive

Tight, informational. The user sees the DAG come alive without scrolling.
Outcomes named alongside verdicts.

```
on orient
─────────
🔮 r7-extract — 5/14 done · frontier: 2 ready · round 7 (carriers: 3)
  setup    init ✅ │ setup-db ✅ │ setup-auth ✅
  build    [api-routes] [middleware] ←── here
  verify   integration │ tests │ t-review

on dispatch
───────────
DISPATCHED — 2 parallel
  🔧 api-routes    → src/api/routes.ts
  🔧 middleware    → src/middleware/auth.ts

on node complete
────────────────
🟩 api-routes      WIN          validators + sniff clean
🟨 middleware      PARTIAL      AMBER · jwt expiry edge case to monitor
   Newly ready: integration → src/integration/

on terminal
───────────
🟩 DAG COMPLETE — trajectory + successor inline (see § At terminal below)
```

🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪

## At terminal · assess, threads, present, successor

The terminal node is the assessment moment, not a formality. This work
USED to live in `/roadmap-term`; it now lives inline here because the
data is in the same conversation that ran the DAG.

### 1. Assess against root intent

```
read terminalContext.rootIntent     what was the human actually asking for?
                                    not the DAG description · the original need

compare                             does what we built satisfy that intent?
                                    not "did validators pass" · does the thing WORK?

visual work    → screenshot it · look at it
functional     → run it · exercise the workflow
infra          → deploy it · hit the endpoint

read the trail · .roadmap/trail.jsonl · last 50-100 entries
  many orients between advances    agent was lost
  advance rejections                validator failures · what broke?
  long gaps between events          agent was stuck
  mutation events                   DAG changed during execution · why?
  the trail tells what happened, not what was reported
```

### 2. Review decision log · what the agent decided without asking

Long autonomous runs make many local judgments. Each lands in `receipt.decisions[]`
or `receipt.diffusion`. Terminal review surfaces them in aggregate so the human
catches up in one screen, not mid-run one-by-one.

```
jq -s '[.[].decisions[]?] + [.[] | select(.diffusion) | .diffusion]' \
    .roadmap/round-N/*.json
  ↑ accumulate every decision and diffusion artifact across the round
```

Present as:

```
┌─────────────────────────────────────────────────────────┐
│  📓 DECISION LOG · <dag-id>                             │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  Worker-level decisions:                                │
│    • <node> · <at>                                      │
│      options:  <list>                                   │
│      taken:    <choice>                                 │
│      why:      <one-line rationale>                     │
│      carriers: <list, if any>                           │
│                                                         │
│  Orchestrator-level adoptions:                          │
│    • <node> · adopted worker recommendation             │
│      route:    <route>                                  │
│      why:      <orchestrator's tractability check>      │
│                                                         │
│  Diffusion routes taken (no felt-blocked):              │
│    • <node> · <route_taken>                             │
│                                                         │
│  Patterns worth flagging:                               │
│    • <e.g. "3 nodes routed substrate-narrow → r<N+1>    │
│       carriers · spec assumed substrate that drifted">  │
│                                                         │
│  Waiting for your call · approve, redirect, or modify.  │
└─────────────────────────────────────────────────────────┘
```

The human reads the decision log first — these are the calls the agent made
WITHOUT asking. Most should be uncontroversial; the ones that aren't get
redirected before the next round opens. Patterns of bad routing become spec-
authoring lessons for future rounds.

### 3. Review dropped threads

```
scan the conversation for what didn't land

dropped threads        discussed but never acted on · ideas, bugs, concerns
                       acknowledged but never became a node, handoff, or
                       CLAUDE.md entry

undocumented decisions "we chose X because Y" said in conversation but
                       never written to docs/ or CLAUDE.md

execution gaps         nodes where you noticed something wrong but moved on ·
                       validators that passed but the output wasn't right
```

### 4. Present to the human · don't act, propose

```
┌─────────────────────────────────────────────────────────┐
│  📋 TERMINAL REVIEW · <dag-id>                          │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  Intent:     <root intent>                              │
│  Status:     <converging / gaps remain / orbiting>      │
│  Trajectory: <last 10 outcomes · notable patterns>      │
│                                                         │
│  Dropped threads:                                       │
│    • <item> (discussed, no node)                        │
│    • <item> (mentioned, not investigated)               │
│                                                         │
│  Undocumented decisions:                                │
│    • <decision> (not in CLAUDE.md or docs/)             │
│                                                         │
│  Proposed:                                              │
│    → successor spec node?                               │
│    → CLAUDE.md entry?                                   │
│    → fine to drop?                                      │
│                                                         │
│  Waiting for your call.                                 │
└─────────────────────────────────────────────────────────┘
```

The human decides what matters. Then act.

### 5. Successor proposal

```
read successorProposal.action:

converged       done · tell the human · "{dag_id} converged · rationale: <one line>"
                rationale must be specific — what intent is satisfied

continue        invoke /roadmap-spec to design the successor (same round)
                if HONEST-RED · NAME THE CARRIERS · each residual becomes
                a first-class node in the successor

round-boundary  invoke /roadmap-spec for r<N+1> · carriers transfer via
                inputs[] sha-pinned receipts · dag_desc / Round narrates

orbiting        STOP · surface to human
                "same problems across iterations: [list]"
                do not write another spec · redirect needed
```

CARRIER REQUIREMENT · do not close a round with un-named residuals.
A round closed with relaxed validators and hand-waved residuals is
forge-by-narrative. The bar moved.

After successor lands, the chain continues:

```
git checkout main && git merge <branch>
/roadmap-spec → roadmap make → /roadmap-bootprompt → /roadmap-orient
```

### 6. Persist · what to write where

```
╭─────────────────────────────────────────────────────────────────╮
│ CLAUDE.md     mutate anchored sections, append references       │
│               never: session context, TODOs, task lists         │
│                                                                 │
│ docs/         specs, ADRs, design docs — things with shelf life │
│               never: session logs, scratch, anything that expires│
│                                                                 │
│ .roadmap/     append-only (trail, completed, handoffs)          │
│               head.json via CLI only · heads/ immutable         │
│                                                                 │
│ boot.md       cognitive residue for next session (/roadmap-bootprompt)│
│                                                                 │
│ ephemeral → handoff · permanent → CLAUDE.md · actionable → spec │
╰─────────────────────────────────────────────────────────────────╯
```

🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪

## Commit hygiene · scoped-add only

**Rule:** every agent brief MUST enforce `git add <explicit-paths>`.
`git add -A` and `git add .` are forbidden in all agent commit sequences.

**Why:** parallel agents share the same working tree. Loose files staged
by one agent sweep into another node's commit boundary, corrupting
attribution and making receipt cross-checks meaningless.

**Protocol for loose files:** if an agent finds files staged or unstaged
outside its declared `produces`, it leaves them alone. Stages only its
own paths. Notes loose files in receipt `notes`. Does NOT unstage or
stash foreign changes.

Brief contract extension:

```
COMMIT
  git add <path1> <path2> ...   ← explicit paths only · must match PRODUCES
  git commit -m "..."
  # NEVER: git add -A · git add . · git add --all
```

## Permissions

```
next moves approved · do not ask permission
merge to main approved
dispatch parallel background sonnet agents for batch nodes
expand plan nodes into subgraphs as encountered
```

## Two loops

```
DAG loop     orient → work batch → advance → orient again
agent loop   produce → inspect output → fix → produce again
             look at what you made · until it's right
```

## Chain

```
called after /roadmap-orient shows work
at terminal → assess, threads, present, successor (inline · this file)
on successor: /roadmap-spec → roadmap make → /roadmap-bootprompt → /roadmap-orient
chain: orient → auto → (terminal) → spec → bootprompt → orient
```

🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪

💀 *Verdict says what happened at the gate · outcome says what the bet did · trajectory says where we're going.*
